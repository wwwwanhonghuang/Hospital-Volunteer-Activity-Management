// SPDX-License-Identifier: AGPL-3.0-only
import { Component, Suspense, lazy, useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Bell, BookOpen, CalendarDays, ChartNoAxesCombined, ChevronRight, CircleHelp, ClipboardList, Command, FolderKanban, HeartHandshake, LayoutDashboard, LogOut, Menu, Package, Search, Settings2, ShieldCheck, Sparkles, Users, X, Box, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { api, getSession, getState, login, logout } from './api';
import type { AppState, PageId, PageProps, User } from './types';
import { Badge, Modal } from './components/UI';
import Dashboard from './pages/Dashboard';
import { BrandMark, ShuoriBrand } from './components/Brand';
import SoftwareNotice from './components/SoftwareNotice';
const Projects = lazy(() => import('./pages/Projects'));
const Volunteers = lazy(() => import('./pages/Volunteers'));
const Schedule = lazy(() => import('./pages/Schedule'));
const Events = lazy(() => import('./pages/Events'));
const Spatial = lazy(() => import('./pages/Spatial'));
const Records = lazy(() => import('./pages/Records'));
const Support = lazy(() => import('./pages/Support'));
const Resources = lazy(() => import('./pages/Resources'));
const Reports = lazy(() => import('./pages/Reports'));
const Settings = lazy(() => import('./pages/Settings'));
const nav = [
  {id:'dashboard',label:'Overview', icon:LayoutDashboard,group:'WORKSPACE'},
  {id:'projects',label:'Projects & planning',icon:FolderKanban},
  {id:'volunteers',label:'Volunteers',icon:Users},
  {id:'schedule',label:'Schedule',icon:CalendarDays},
  {id:'events',label:'Events & meetings',icon:FolderKanban},
  {id:'spatial',label:'Spatial simulation',icon:Box,tag:'3D'},
  {id:'records',label:'Activity records',icon:ClipboardList,group:'OPERATIONS'},
  {id:'support',label:'Support & improvement',icon:HeartHandshake},
  {id:'resources',label:'Resources',icon:Package},
  {id:'reports',label:'Reports & insights',icon:ChartNoAxesCombined},
  {id:'settings',label:'Workspace settings',icon:Settings2,group:'ADMINISTRATION'},
] as const;
const pages: Record<PageId, React.ComponentType<PageProps>> = {dashboard:Dashboard,projects:Projects,volunteers:Volunteers,schedule:Schedule,events:Events,spatial:Spatial,records:Records,support:Support,resources:Resources,reports:Reports,settings:Settings};
export const todayInTokyo = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
class ErrorBoundary extends Component<{children:ReactNode},{error:boolean}> {
  state = {error:false}; static getDerivedStateFromError() { return {error:true}; }
  render() {return this.state.error ? <div className="empty-state"><AlertCircle/><h2>This view could not load</h2><p>Your saved work is safe. Reload to reconnect.</p><button className="button button-primary" onClick={() => window.location.reload()}>Reload workspace</button></div> : this.props.children;}
}
function Login({mode,onLogin}: {mode:string;onLogin:(user:User)=>void}) {
  const [username,setUsername] = useState('admin'); const [password,setPassword] = useState(''); const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  async function submit(demo = false) {setBusy(true); setError(''); try { const result = await login(username,password,demo); onLogin(result.user); } catch(e) {setError((e as Error).message);} finally {setBusy(false);} }
  return <div className="login-layout"><div className="login-story"><div className="login-brand"><ShuoriBrand /></div><div className="login-story-content"><span className="eyebrow">VOLUNTEER OPERATIONS</span><h1>Woven together.<br/>Carefully coordinated.</h1><p>A thoughtful workspace for the people who make a hospital feel a little more human.</p><div className="login-weave" aria-hidden="true"><BrandMark size={260}/><span className="weave-caption">EVERY THREAD OF CARE, CONNECTED.</span></div></div><p className="login-footnote">Designed for the University of Tokyo Hospital volunteer coordination brief.</p></div><main className="login-main"><div className="login-card"><Badge tone="blue"><ShieldCheck size={13}/> Your coordination workspace</Badge><h2>Welcome to SHUORI</h2><p className="muted">A clear view of your team, your plans, and the day ahead.</p>{mode === 'demo' && <div className="demo-login"><Sparkles size={21}/><div><strong>Take a look around</strong><p>A complete sample workspace with fictional people and activities.</p></div><button className="button button-primary" disabled={busy} onClick={() => submit(true)}>Explore demo workspace <ArrowRight size={16}/></button></div>}<form onSubmit={e => {e.preventDefault(); void submit();}}><label className="login-label" htmlFor="username">Username</label><input id="username" autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/><label className="login-label" htmlFor="password">Password</label><input id="password" type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={1}/>{error && <p className="form-error" role="alert">{error}</p>}<button className="button button-secondary login-submit" disabled={busy}>{busy ? 'Connecting…' : 'Sign in'}<ArrowRight size={16}/></button></form><p className="small muted login-notice">For volunteer coordination. Do not enter patient information.</p></div><footer className="login-bottom"><span lang="zh-Hant">守織</span><strong>SHUORI</strong><span>Every thread of care, connected.</span><SoftwareNotice/></footer></main></div>;
}
export default function App() {
  const initial = window.location.hash.replace('#/','').split('?')[0] as PageId;
  const [page,setPage] = useState<PageId>(pages[initial] ? initial : 'dashboard');
  const [date,setDate] = useState(todayInTokyo()); const [user,setUser] = useState<User|null>(null); const [mode,setMode] = useState('demo');
  const [loading,setLoading] = useState(true); const [data,setData] = useState<AppState|null>(null); const [error,setError] = useState('');
  const [mobile,setMobile] = useState(false); const [searchOpen,setSearchOpen] = useState(false); const [query,setQuery] = useState(''); const [notifications,setNotifications] = useState(false);
  const [toast,setToast] = useState<{message:string;kind:string}|null>(null);
  const notify = useCallback((message:string,kind = 'success') => setToast({message,kind}),[]);
  const refresh = useCallback(async () => {try {const next=await getState(); setData(previous=>previous&&JSON.stringify(previous)===JSON.stringify(next)?previous:next); setError('');} catch(e) { setError((e as Error).message); throw e; }},[]);
  const navigate = useCallback((id:PageId) => {setPage(id);window.location.hash = `/${id}`; setMobile(false);window.scrollTo({top:0,behavior:'instant'});},[]);
  useEffect(() => {getSession().then(s => {setMode(s.mode);setUser(s.user);}).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
  useEffect(() => {const expired=()=>{setUser(null);setError('Your session has ended. Sign in again to continue.');};window.addEventListener('komorebi-session-expired',expired);return ()=>window.removeEventListener('komorebi-session-expired',expired);},[]);
  useEffect(() => { if(user) void refresh().catch(()=>{}); else setData(null);},[user,refresh]);
  useEffect(() => {const handler = () => {const p = window.location.hash.replace('#/','').split('?')[0] as PageId;if (pages[p]) setPage(p);}; window.addEventListener('hashchange',handler);return ()=>window.removeEventListener('hashchange',handler);},[]);
  useEffect(() => {const handler = (e:KeyboardEvent) => {if ((e.ctrlKey || e.metaKey) && e.key === 'k') {e.preventDefault();setSearchOpen(o=>!o);}};window.addEventListener('keydown',handler);return ()=>window.removeEventListener('keydown',handler);},[]);
  useEffect(() => {if (!toast) return;const timer = setTimeout(()=>setToast(null),5000);return ()=>clearTimeout(timer);},[toast]);
  useEffect(() => {if(!user) return; const t=setInterval(()=>{if(document.visibilityState==='visible') void refresh().catch(()=>{});},30000);return ()=>clearInterval(t);},[user,refresh]);
  useEffect(() => { document.title = user ? `${nav.find(item => item.id === page)?.label || 'Workspace'} | 守織 SHUORI` : '守織 SHUORI | Volunteer Operations'; }, [page, user]);
  const Page = pages[page];
  const alerts = data ? [
    ...data.shifts.filter(s=>s.date===date&&s.status!=='cancelled'&&s.volunteerIds.length<s.requiredCount).map(s=>({title:`${s.title}: ${s.requiredCount-s.volunteerIds.length} open places`,detail:`${s.start} · ${data.locations.find(l=>l.id===s.locationId)?.name}`,page:'schedule' as PageId})),
    ...data.volunteers.filter(v=>v.status==='active'&&(v.healthStatus!=='cleared'||v.healthDueDate<date)).map(v=>({title:`Readiness review · ${v.name}`,detail:'Check administrative clearance before assigning a shift.',page:'volunteers' as PageId})),
    ...data.requests.filter(r=>r.status!=='resolved'&&r.priority==='high').map(r=>({title:r.title,detail:`${r.department} · ${r.owner}`,page:'support' as PageId})),
  ] : [];
  const results = data && query.trim() ? [
    ...data.volunteers.map(v=>({title:v.name,sub:`Volunteer · ${v.skills.join(', ')}`,page:'volunteers' as PageId})),
    ...data.projects.map(p=>({title:p.title,sub:`Project · ${p.owner}`,page:'projects' as PageId})),
    ...data.shifts.map(s=>({title:s.title,sub:`Shift · ${s.date} ${s.start}`,page:'schedule' as PageId})),
    ...data.events.map(event=>({title:event.title,sub:`Event ? ${event.date} ${event.start}`,page:'events' as PageId})),
    ...data.requests.map(r=>({title:r.title,sub:`Support · ${r.department}`,page:'support' as PageId})),
  ].filter(r=>(r.title+' '+r.sub).toLowerCase().includes(query.toLowerCase())).slice(0,12) : [];
  if (loading) return <div className="boot-screen"><ShuoriBrand tagline={false}/><p>Opening your workspace…</p></div>;
  if (!user) return <><Login mode={mode} onLogin={setUser}/>{error && <div className="connection-error" role="alert">{error}<button onClick={()=>location.reload()}>Reconnect</button></div>}</>;
  return <div className="app-layout"><a className="skip-link" href="#main-content">Skip to content</a>{mobile && <div className="sidebar-scrim" onClick={()=>setMobile(false)}/>}<aside className={`sidebar ${mobile?'is-open':''}`}><a className="brand" href="#/dashboard" aria-label="守織 SHUORI home" onClick={()=>navigate('dashboard')}><ShuoriBrand /></a><div className="workspace-switch"><span className="hospital-symbol">H<span>+</span></span><div><strong>UTokyo Hospital</strong><small>Volunteer coordination</small></div><ChevronRight size={14}/></div><nav aria-label="Main navigation">{nav.map(item=><div key={item.id}>{'group' in item&&<p className="nav-group">{item.group}</p>}<button className={`nav-link ${page===item.id?'active':''}`} aria-current={page===item.id?'page':undefined} onClick={()=>navigate(item.id)}><item.icon size={18}/><span>{item.label}</span>{'tag' in item&&<small>{item.tag}</small>}</button></div>)}</nav><div className="sidebar-bottom"><div className="workspace-note"><span className="status-dot"/><span>{mode==='demo'?'Demo workspace':'Connected workspace'}</span>{mode==='demo'&&<small>FICTIONAL DATA</small>}</div><button className="help-link" onClick={()=>navigate('settings')}><CircleHelp size={17}/>Workspace guide<ArrowRight size={15}/></button><div className="user-box"><span className="avatar avatar-0">{user.name.slice(0,2).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role==='admin'?'Workspace administrator':user.role==='coordinator'?'Volunteer coordinator':'Read-only access'}</small></div><button className="icon-button" aria-label="Sign out" onClick={async()=>{try{await logout();setUser(null);}catch(e){notify((e as Error).message,'error');}}}><LogOut size={16}/></button></div></div></aside><div className="workspace-main"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" onClick={()=>setMobile(true)} aria-label="Open navigation"><Menu size={20}/></button><span>Workspace</span><ChevronRight size={13}/><strong>{nav.find(n=>n.id===page)?.label}</strong></div><div className="topbar-actions"><button className="search-trigger" aria-label="Search workspace" onClick={()=>setSearchOpen(true)}><Search size={15}/><span>Search workspace</span><kbd><Command size={11}/> K</kbd></button><span className="topbar-timezone">JST</span><button className="notification-button icon-button" aria-label={`Notifications, ${alerts.length} items`} onClick={()=>setNotifications(true)}><Bell size={19}/>{alerts.length>0&&<span/>}</button></div></header><main id="main-content" tabIndex={-1}><div className="workspace-date"><span><span className="status-dot"/> {mode==='demo'?'Sample workspace':'Workspace connected'}</span><label><CalendarDays size={14}/>Workspace date<input aria-label="Workspace date" type="date" value={date} onChange={e=>e.target.value&&setDate(e.target.value)}/></label></div>{error&&<div className="connection-banner" role="alert"><AlertCircle size={16}/>{error}<button onClick={()=>void refresh().catch(()=>{})}><RefreshCw size={14}/>Retry</button></div>}<ErrorBoundary key={page}><Suspense fallback={<div className="page-loading"><RefreshCw className="spin"/>Loading workspace…</div>}>{data?<Page data={data} date={date} user={user} refresh={refresh} notify={notify} navigate={navigate}/>:<div className="page-loading"><RefreshCw className="spin"/>Loading your team and activities…</div>}</Suspense></ErrorBoundary><footer className="page-footer"><span><BrandMark size={20}/><span lang="zh-Hant">守織</span> SHUORI · Every thread of care, connected.</span><span>All dates & times in Asia/Tokyo</span><SoftwareNotice/></footer></main></div>{searchOpen&&<Modal title="Search workspace" onClose={()=>setSearchOpen(false)}><div className="search-input-wrap"><Search size={19}/><input autoFocus aria-label="Search volunteers, projects, shifts, events and requests" placeholder="Find a person, project, shift, or request…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="search-results">{results.map((r,i)=><button key={i} onClick={()=>{navigate(r.page);setSearchOpen(false);}}><div><strong>{r.title}</strong><small>{r.sub}</small></div><ArrowRight size={16}/></button>)}{!results.length&&<p className="muted">{query?'No matching items. Try a different name or keyword.':'Start typing to explore the workspace.'}</p>}</div></Modal>}{notifications&&<Modal title="Needs your attention" onClose={()=>setNotifications(false)}><div className="search-results">{alerts.length?alerts.map((a,i)=><button key={i} onClick={()=>{navigate(a.page);setNotifications(false);}}><div><strong>{a.title}</strong><small>{a.detail}</small></div><ArrowRight size={16}/></button>):<p className="muted">All clear. No coordination alerts for the selected day.</p>}</div></Modal>}{toast&&<div className={`toast toast-${toast.kind}`} role="status">{toast.kind==='error'?<AlertCircle size={19}/>:<CheckCircle2 size={19}/>}<span>{toast.message}</span><button aria-label="Dismiss notification" onClick={()=>setToast(null)}><X size={16}/></button></div>}</div>;
}
