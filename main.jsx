import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { LayoutDashboard, Truck, CalendarDays, ClipboardList, LogOut, Plus, Search, Wrench, CircleAlert, CheckCircle2, Clock3, Menu, X, Upload, Settings, RefreshCw } from 'lucide-react';
import './style.css';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const ADMIN_EMAIL = 'operations@gctowtrucks.com.au';

function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [page, setPage] = useState('dashboard');
  const [trucks, setTrucks] = useState([]);
  const [records, setRecords] = useState([]);
  const [statusRows, setStatusRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !supabase) { setProfile(null); setLoading(false); return; }
    loadAll();
  }, [session]);

  async function loadAll() {
    setLoading(true); setNotice('');
    const [{ data: p, error: pe }, { data: t, error: te }, { data: r, error: re }, { data: s, error: se }] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', session.user.id).single(),
      supabase.from('trucks').select('*').order('registration'),
      supabase.from('maintenance_records').select('*, trucks(registration)').order('work_date', { ascending: false }).limit(100),
      supabase.from('fleet_service_status').select('*').order('registration')
    ]);
    if (pe) setNotice('Could not load your staff profile: ' + pe.message);
    else setProfile(p);
    if (te) setNotice('Could not load trucks: ' + te.message); else setTrucks(t || []);
    if (re) setNotice('Could not load maintenance records: ' + re.message); else setRecords(r || []);
    if (se) setNotice('Could not load service statuses: ' + se.message); else setStatusRows(s || []);
    setLoading(false);
  }

  async function signIn(e) {
    e.preventDefault(); setNotice('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setNotice(error.message);
  }
  async function signOut() { await supabase.auth.signOut(); setSession(null); }
  async function updateTruck(id, changes) {
    const payload = { ...changes, current_odometer: changes.current_odometer === '' ? null : Number(changes.current_odometer), last_service_odometer: changes.last_service_odometer === '' ? null : Number(changes.last_service_odometer), updated_at: new Date().toISOString() };
    const { error } = await supabase.from('trucks').update(payload).eq('id', id);
    if (error) { setNotice('Could not update truck: ' + error.message); return false; }
    await loadAll(); return true;
  }

  async function addRecord(form) {
    const { file, ...recordFields } = form;
    const payload = { ...recordFields, odometer: Number(form.odometer), labour_hours: Number(form.labour_hours || 0), labour_cost: Number(form.labour_cost || 0), parts_cost: Number(form.parts_cost || 0), created_by: session.user.id };
    const { data, error } = await supabase.from('maintenance_records').insert(payload).select().single();
    if (error) { setNotice('Could not save record: ' + error.message); return false; }
    if (file && data) {
      const safeName = `${data.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const { error: uploadError } = await supabase.storage.from('maintenance-files').upload(safeName, file);
      if (uploadError) setNotice('Record saved, but file upload failed: ' + uploadError.message);
      else await supabase.from('maintenance_attachments').insert({ maintenance_record_id: data.id, file_path: safeName, file_name: file.name, file_type: file.type.startsWith('image/') ? 'photo' : 'invoice', uploaded_by: session.user.id });
    }
    await loadAll(); setShowForm(false); return true;
  }

  const filteredTrucks = useMemo(() => trucks.filter(t => t.registration.toLowerCase().includes(search.toLowerCase())), [trucks, search]);
  const stats = useMemo(() => ({ total: statusRows.length, overdue: statusRows.filter(x => x.service_status === 'overdue').length, due: statusRows.filter(x => x.service_status === 'due_soon').length, setup: statusRows.filter(x => x.service_status === 'setup_required').length, ok: statusRows.filter(x => x.service_status === 'up_to_date').length }), [statusRows]);

  if (!supabase) return <SetupScreen />;
  if (!session) return <Login email={email} setEmail={setEmail} password={password} setPassword={setPassword} signIn={signIn} notice={notice} />;
  if (loading) return <div className="loading"><div className="spinner"/>Loading fleet data…</div>;
  if (!profile) return <div className="loading"><h2>Staff profile unavailable</h2><p>{notice || 'Ask a manager to check your account permissions.'}</p><button onClick={loadAll}>Try again</button></div>;

  const isManager = profile.role === 'management';
  const nav = [ ['dashboard','Dashboard',LayoutDashboard], ['trucks','Trucks',Truck], ['calendar','Service status',CalendarDays], ['records','Maintenance records',ClipboardList] ];
  return <div className="app-shell">
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark">G</div><div><b>GCTT</b><small>FLEET MAINTENANCE</small></div><button className="close-nav" onClick={()=>setMobileNav(false)}><X/></button></div>
      <div className="nav-label">WORKSPACE</div>
      {nav.map(([id,label,Icon]) => <button key={id} className={`nav-item ${page===id?'active':''}`} onClick={()=>{setPage(id);setMobileNav(false)}}><Icon size={19}/>{label}</button>)}
      <div className="sidebar-bottom"><div className="user-card"><div className="avatar">{(profile.email||'U').slice(0,1).toUpperCase()}</div><div className="user-info"><b>{profile.email}</b><small>{profile.role}</small></div></div><button className="nav-item signout" onClick={signOut}><LogOut size={18}/>Sign out</button></div>
    </aside>
    {mobileNav && <div className="scrim" onClick={()=>setMobileNav(false)}/>}
    <main className="main-area">
      <header className="topbar"><button className="menu-btn" onClick={()=>setMobileNav(true)}><Menu/></button><div className="crumb">Gold Coast Tow Trucks <span>/</span> {nav.find(n=>n[0]===page)?.[1]}</div><div className="top-right"><span className="role-pill">{isManager?'Management':'Mechanic'}</span><button className="icon-btn" onClick={loadAll} title="Refresh"><RefreshCw size={17}/></button></div></header>
      <div className="content">
        {notice && <div className="notice"><CircleAlert size={17}/>{notice}<button onClick={()=>setNotice('')}>Dismiss</button></div>}
        {page==='dashboard' && <Dashboard stats={stats} records={records} statusRows={statusRows} setPage={setPage} />}
        {page==='trucks' && <TrucksPage trucks={filteredTrucks} search={search} setSearch={setSearch} statusRows={statusRows} isManager={isManager} onUpdateTruck={updateTruck}/>}
        {page==='calendar' && <StatusPage statusRows={statusRows}/>}
        {page==='records' && <RecordsPage records={records} onAdd={()=>setShowForm(true)} canAdd/>}
      </div>
    </main>
    {showForm && <RecordModal trucks={trucks} onClose={()=>setShowForm(false)} onSave={addRecord}/>}
  </div>;
}

function SetupScreen(){return <div className="center-screen"><div className="login-card"><div className="brand large"><div className="brand-mark">G</div><div><b>GCTT</b><small>FLEET MAINTENANCE</small></div></div><h1>Connect your fleet app</h1><p>Add your Supabase project settings to start using the maintenance system.</p><ol><li>Copy <code>.env.example</code> to <code>.env.local</code>.</li><li>Set your Supabase Project URL and publishable key.</li><li>Run <code>npm install</code> then <code>npm run dev</code>.</li></ol><p className="muted">Do not add a Supabase secret or service-role key here.</p></div></div>}
function Login({email,setEmail,password,setPassword,signIn,notice}){return <div className="center-screen"><form className="login-card" onSubmit={signIn}><div className="brand large"><div className="brand-mark">G</div><div><b>GCTT</b><small>FLEET MAINTENANCE</small></div></div><h1>Welcome back</h1><p>Sign in to manage your fleet maintenance.</p><label>Email address<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com"/></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/></label>{notice&&<div className="notice">{notice}</div>}<button className="primary full">Sign in</button><small className="muted">Access is for authorised management and mechanics only.</small></form></div>}
function PageTitle({eyebrow,title,description,action}){return <div className="page-title"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{description}</p></div>{action}</div>}
function Dashboard({stats,records,statusRows,setPage}){return <><PageTitle eyebrow="FLEET OVERVIEW" title="Fleet dashboard" description="Maintenance status across your tow truck fleet." action={<button className="secondary" onClick={()=>setPage('records')}><ClipboardList size={17}/> View records</button>}/><div className="stat-grid"><Stat label="Total trucks" value={stats.total} icon={Truck} tone="blue"/><Stat label="Up to date" value={stats.ok} icon={CheckCircle2} tone="green"/><Stat label="Due soon" value={stats.due} icon={Clock3} tone="orange"/><Stat label="Overdue" value={stats.overdue} icon={CircleAlert} tone="red"/></div>{stats.setup>0&&<div className="setup-banner"><CircleAlert/><div><b>{stats.setup} trucks need service information</b><p>Add current odometer and last service details to calculate accurate service status.</p></div><button onClick={()=>setPage('trucks')}>Update trucks</button></div>}<div className="section-heading"><div><h2>Service attention</h2><p>Trucks that need attention based on recorded odometer readings.</p></div><button className="text-btn" onClick={()=>setPage('calendar')}>View all <span>→</span></button></div><div className="table-card"><ServiceTable rows={statusRows.filter(r=>['overdue','due_soon','setup_required'].includes(r.service_status)).slice(0,8)}/></div><div className="section-heading recent-head"><div><h2>Recent maintenance</h2><p>Latest work recorded by the team.</p></div><button className="text-btn" onClick={()=>setPage('records')}>All records →</button></div><div className="table-card"><RecordsTable records={records.slice(0,5)}/></div></>}
function Stat({label,value,icon:Icon,tone}){return <div className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={20}/></div><div><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div></div>}
function TrucksPage({trucks,search,setSearch,statusRows,isManager,onUpdateTruck}){const [editing,setEditing]=useState(null);return <><PageTitle eyebrow="FLEET" title="Truck register" description={`${trucks.length} matching vehicles in your fleet.`}/><div className="toolbar"><div className="searchbox"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search registration…"/></div><span className="muted">Select a truck's records from the maintenance register.</span></div><div className="truck-grid">{trucks.map(t=>{const s=statusRows.find(x=>x.id===t.id);return <div className="truck-card" key={t.id}><div className="truck-card-top"><div className="truck-icon"><Truck/></div><StatusBadge status={s?.service_status}/></div><h3>{t.registration}</h3><p>{t.description||'Tow truck'}</p><div className="truck-meta"><span>Current odometer</span><b>{t.current_odometer==null?'Not entered':Number(t.current_odometer).toLocaleString()+' km'}</b></div><div className="truck-meta"><span>Next service</span><b>{s?.service_due_odometer==null?'Awaiting service data':Number(s.service_due_odometer).toLocaleString()+' km'}</b></div>{isManager&&<button className="text-btn edit-truck" onClick={()=>setEditing(t)}>Update readings →</button>}</div>})}</div>{trucks.length===0&&<div className="empty">No registrations match your search.</div>}{editing&&<TruckEditModal truck={editing} onClose={()=>setEditing(null)} onSave={async changes=>{const ok=await onUpdateTruck(editing.id,changes);if(ok)setEditing(null);return ok;}}/>}</>}

function TruckEditModal({truck,onClose,onSave}){const [form,setForm]=useState({description:truck.description||'',current_odometer:truck.current_odometer??'',last_service_odometer:truck.last_service_odometer??'',last_service_date:truck.last_service_date||''});const [saving,setSaving]=useState(false);const change=(k,v)=>setForm(f=>({...f,[k]:v}));async function submit(e){e.preventDefault();setSaving(true);await onSave(form);setSaving(false)}return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="modal compact-modal" onSubmit={submit}><div className="modal-head"><div><div className="eyebrow">FLEET DETAILS</div><h2>Update {truck.registration}</h2></div><button type="button" className="icon-btn" onClick={onClose}><X/></button></div><div className="form-grid"><label className="span2">Vehicle description<input value={form.description} onChange={e=>change('description',e.target.value)}/></label><label>Current odometer (km)<input type="number" min="0" value={form.current_odometer} onChange={e=>change('current_odometer',e.target.value)}/></label><label>Last service odometer (km)<input type="number" min="0" value={form.last_service_odometer} onChange={e=>change('last_service_odometer',e.target.value)}/></label><label className="span2">Last service date<input type="date" value={form.last_service_date} onChange={e=>change('last_service_date',e.target.value)}/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving?'Saving…':'Save truck details'}</button></div></form></div>}
function StatusPage({statusRows}){return <><PageTitle eyebrow="SERVICE PLANNER" title="Fleet service status" description="Colour-coded status using the 15,000 km service interval and 1,000 km due-soon warning."/><div className="legend"><span><i className="dot green"/>Up to date</span><span><i className="dot orange"/>Due soon</span><span><i className="dot red"/>Overdue</span><span><i className="dot grey"/>Setup required</span></div><div className="table-card"><ServiceTable rows={statusRows}/></div></>}
function StatusBadge({status}){const map={up_to_date:['Up to date','green'],due_soon:['Due soon','orange'],overdue:['Overdue','red'],setup_required:['Setup required','grey']};const [label,tone]=map[status]||['Unknown','grey'];return <span className={`status ${tone}`}><i/> {label}</span>}
function ServiceTable({rows}){return <div className="overflow"><table><thead><tr><th>Registration</th><th>Odometer</th><th>Service due at</th><th>Remaining</th><th>Status</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td className="reg-cell">{r.registration}</td><td>{r.current_odometer==null?'—':Number(r.current_odometer).toLocaleString()+' km'}</td><td>{r.service_due_odometer==null?'—':Number(r.service_due_odometer).toLocaleString()+' km'}</td><td>{r.kilometres_remaining==null?'—':(r.kilometres_remaining<0?Math.abs(r.kilometres_remaining).toLocaleString()+' km overdue':Number(r.kilometres_remaining).toLocaleString()+' km')}</td><td><StatusBadge status={r.service_status}/></td></tr>)}</tbody></table>{rows.length===0&&<div className="empty">No trucks to display yet.</div>}</div>}
function RecordsPage({records,onAdd,canAdd}){return <><PageTitle eyebrow="WORKSHOP" title="Maintenance records" description="Repairs, servicing, tyres, inspections and breakdown history." action={canAdd&&<button className="primary" onClick={onAdd}><Plus size={18}/> Add record</button>}/>}<div className="table-card"><RecordsTable records={records}/></div></>}
function RecordsTable({records}){return <div className="overflow"><table><thead><tr><th>Date</th><th>Truck</th><th>Work type</th><th>Description</th><th>Odometer</th><th>Total cost</th></tr></thead><tbody>{records.map(r=><tr key={r.id}><td>{new Date(r.work_date+'T00:00:00').toLocaleDateString('en-AU')}</td><td className="reg-cell">{r.trucks?.registration||'—'}</td><td><span className="type-pill">{r.record_type.replaceAll('_',' ')}</span></td><td className="desc-cell">{r.description}</td><td>{Number(r.odometer).toLocaleString()} km</td><td>${Number(r.total_cost||0).toFixed(2)}</td></tr>)}</tbody></table>{records.length===0&&<div className="empty">No maintenance records have been entered yet.</div>}</div>}
function RecordModal({trucks,onClose,onSave}){const [form,setForm]=useState({truck_id:'',record_type:'service',work_date:new Date().toISOString().slice(0,10),odometer:'',description:'',supplier:'',labour_hours:'',labour_cost:'',parts_cost:'',file:null});const [saving,setSaving]=useState(false);const update=(k,v)=>setForm(f=>({...f,[k]:v}));async function submit(e){e.preventDefault();setSaving(true);const ok=await onSave(form);setSaving(false);if(ok)onClose()};return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><form className="modal" onSubmit={submit}><div className="modal-head"><div><div className="eyebrow">WORKSHOP ENTRY</div><h2>Add maintenance record</h2></div><button type="button" className="icon-btn" onClick={onClose}><X/></button></div><div className="form-grid"><label className="span2">Truck registration<select required value={form.truck_id} onChange={e=>update('truck_id',e.target.value)}><option value="">Select truck</option>{trucks.map(t=><option key={t.id} value={t.id}>{t.registration}</option>)}</select></label><label>Work type<select value={form.record_type} onChange={e=>update('record_type',e.target.value)}>{['service','mechanical_repair','tyres','inspection','breakdown','other'].map(x=><option key={x} value={x}>{x.replaceAll('_',' ')}</option>)}</select></label><label>Date<input type="date" required value={form.work_date} onChange={e=>update('work_date',e.target.value)}/></label><label>Odometer (km)<input type="number" min="0" required value={form.odometer} onChange={e=>update('odometer',e.target.value)}/></label><label>Supplier / workshop<input value={form.supplier} onChange={e=>update('supplier',e.target.value)}/></label><label className="span2">Work performed<textarea required rows="3" value={form.description} onChange={e=>update('description',e.target.value)} placeholder="Describe repairs, service items or inspection findings…"/></label><label>Labour hours<input type="number" min="0" step="0.1" value={form.labour_hours} onChange={e=>update('labour_hours',e.target.value)}/></label><label>Labour cost ($)<input type="number" min="0" step="0.01" value={form.labour_cost} onChange={e=>update('labour_cost',e.target.value)}/></label><label>Parts cost ($)<input type="number" min="0" step="0.01" value={form.parts_cost} onChange={e=>update('parts_cost',e.target.value)}/></label><label>Photo or invoice<input type="file" accept="image/*,.pdf" onChange={e=>update('file',e.target.files?.[0]||null)}/></label></div><div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={saving}>{saving?'Saving…':'Save maintenance record'}</button></div></form></div>}

createRoot(document.getElementById('root')).render(<App/>);
