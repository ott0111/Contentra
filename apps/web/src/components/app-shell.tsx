'use client';
import Link from 'next/link';
import { Bell, ChevronDown, Settings, LogOut, Search, X, Command, FileText } from 'lucide-react';
import { SearchButton, Skeleton, AIWidget, Badge, Toaster, toast } from './ui';
import { ReleaseNotice } from './release-notice';
import { api, ApiClientError } from '@/lib/api';
import { useCallback, useEffect, useState } from 'react';

const nav=[['Home','/app'],['Creatos','/creatos'],['Create','/app/create'],['Content','/app/content'],['Library','/app/library']];
const navGroups=[
 {label:'Intelligence',tier:'PRO',items:[['Inspiration','/app/inspiration'],['Trend Intelligence','/app/analytics']]},
 {label:'Plan & Grow',tier:'PRO',items:[['Calendar','/app/calendar'],['Analytics','/app/analytics']]},
 {label:'Business',tier:'BUSINESS',items:[['Business OS','/app/business/overview'],['Campaigns','/app/business/campaigns'],['Team & Workspaces','/app/settings/workspaces']]},
];

type Workspace = { id:string; name:string; type:string };
type Me = { user:{id:string;name?:string|null;email:string}; workspaces:Array<{role:string;workspace:Workspace}> };
type NotificationItem = { id:string; type:string; title:string; body?:string|null; readAt?:string|null; createdAt:string; entityType?:string|null; entityId?:string|null };
type ContentItem = { id:string; title?:string|null; format:string; platform:string; status:string };

export function AppShell({children,active}:{children:React.ReactNode;active:string}){
 const [me,setMe]=useState<Me|null>(null);
 const [workspaceId,setWorkspaceId]=useState('');
 const [menu,setMenu]=useState(false);
 const [mobileOpen,setMobileOpen]=useState(false);
 const [loading,setLoading]=useState(true);
 const [authFailed,setAuthFailed]=useState(false);
 const [bellOpen,setBellOpen]=useState(false);
 const [notifs,setNotifs]=useState<NotificationItem[]|null>(null);
 const [notifError,setNotifError]=useState('');
 const [searchOpen,setSearchOpen]=useState(false);
 const [searchLoading,setSearchLoading]=useState(false);
 const [searchItems,setSearchItems]=useState<ContentItem[]>([]);
 const [query,setQuery]=useState('');

 useEffect(()=>{
  let mounted=true;
  api<Me>('/api/v1/auth/me').then(data=>{
   if(!mounted)return;
   setMe(data);
   const saved=localStorage.getItem('contentra_workspace');
   const selected=data.workspaces.find(x=>x.workspace.id===saved)?.workspace.id ?? data.workspaces[0]?.workspace.id ?? '';
   setWorkspaceId(selected);
   if(selected)localStorage.setItem('contentra_workspace',selected);
   else localStorage.removeItem('contentra_workspace');
  }).catch(()=>{if(mounted)setAuthFailed(true)}).finally(()=>{if(mounted)setLoading(false)});
  return ()=>{mounted=false};
 },[]);

 const workspace=me?.workspaces.find(x=>x.workspace.id===workspaceId)?.workspace;
 const unread=notifs?.filter(n=>!n.readAt).length ?? 0;

 const refreshNotifications=useCallback(()=>{
  if(!workspaceId)return;
  api<NotificationItem[]>(`/api/v1/workspaces/${workspaceId}/notifications`,{},workspaceId)
   .then(setNotifs).catch(e=>setNotifError(e instanceof ApiClientError?e.message:'Notifications could not be loaded.'));
 },[workspaceId]);

 useEffect(()=>{ if(bellOpen) refreshNotifications(); },[bellOpen,refreshNotifications]);

 async function markRead(id:string){
  if(!workspaceId)return;
  setNotifs(current=>current?.map(n=>n.id===id?{...n,readAt:new Date().toISOString()}:n)??current);
  await api(`/api/v1/workspaces/${workspaceId}/notifications/${id}/read`,{method:'POST'},workspaceId).catch(()=>undefined);
  toast('Notification marked as read','info');
 }
 async function markAllRead(){
  const id=workspaceId; if(!id||!notifs)return;
  const ids=notifs.filter(n=>!n.readAt).map(n=>n.id);
  await Promise.all(ids.map(nid=>api(`/api/v1/workspaces/${id}/notifications/${nid}/read`,{method:'POST'},id).catch(()=>undefined)));
  setNotifs(current=>current?.map(n=>({...n,readAt:n.readAt??new Date().toISOString()}))??current);
  toast('All notifications marked as read','success');
 }

 function openSearch(){
  setSearchOpen(true); setQuery('');
  if(searchItems.length)return;
  const id=localStorage.getItem('contentra_workspace')??workspaceId;
  if(!id)return;
  setSearchLoading(true);
  api<ContentItem[]>(`/api/v1/workspaces/${id}/content`,{},id).then(setSearchItems).catch(()=>setSearchItems([])).finally(()=>setSearchLoading(false));
 }

 useEffect(()=>{
  function onKey(e:KeyboardEvent){
   if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch()}
   if(e.key==='Escape'){setSearchOpen(false);setBellOpen(false)}
  }
  window.addEventListener('keydown',onKey);
  return ()=>window.removeEventListener('keydown',onKey);
 });

 async function logout(){await api('/api/v1/auth/logout',{method:'POST'}).catch(()=>undefined);location.href='/login'}

 const term=query.trim().toLowerCase();
 const results=term?searchItems.filter(x=>`${x.title??''} ${x.platform} ${x.format}`.toLowerCase().includes(term)):searchItems.slice(0,5);

 return <div className="app-shell">
  <ReleaseNotice/>
  <header className="topbar">
   <div className="top-left"><Link href="/app" className="brand"><span className="brand-mark" aria-hidden="true" />Contentra</Link>
    <div className="workspace-wrap">
     <button className="workspace" onClick={()=>setMenu(!menu)} aria-expanded={menu}>{workspace?.name??'Workspace'} <ChevronDown size={13}/></button>
     {menu&&<div className="workspace-menu">
      {me?.workspaces.map(x=><button key={x.workspace.id} onClick={()=>{setWorkspaceId(x.workspace.id);localStorage.setItem('contentra_workspace',x.workspace.id);setMenu(false);toast(`Switched to ${x.workspace.name}`,'success')}}>{x.workspace.name}<small>{x.role}</small></button>)}
      {(workspace?.type==='BUSINESS'||workspace?.type==='AGENCY')&&<Link href="/app/business/overview">Business OS</Link>}
      <Link href="/app/settings/workspaces">Manage workspaces</Link>
     </div>}
    </div>
   </div>
   <button className="mobile-menu-btn icon-btn" aria-label="Toggle navigation" aria-expanded={mobileOpen} onClick={()=>setMobileOpen(!mobileOpen)}><span>Menu</span></button>
   <nav className={`nav-pill ${mobileOpen?'mobile-open':''}`} aria-label="Main navigation">{nav.map(([label,href])=><Link onClick={()=>setMobileOpen(false)} className={active===label?'active':''} key={href} href={href}>{label}</Link>)}{navGroups.map(group=><div className="nav-group" key={group.label}><button type="button" className="nav-group-trigger"><span>{group.label}</span><small>{group.tier}</small><ChevronDown size={13}/></button><div className="nav-group-menu">{group.items.map(([label,href])=><Link onClick={()=>setMobileOpen(false)} key={href} href={href}>{label}</Link>)}</div></div>)}</nav>
   <div className="top-actions">
    <SearchButton onClick={openSearch}/>
    <button className="icon-btn" aria-label={`Notifications${unread?` (${unread} unread)`:''}`} onClick={()=>setBellOpen(!bellOpen)}><Bell size={16}/>{unread>0&&<span className="dot-badge">{unread}</span>}</button>
    <Link className="icon-btn" href="/app/settings/account" aria-label="Settings"><Settings size={16}/></Link>
    <button className="icon-btn" aria-label="Sign out" onClick={logout}><LogOut size={16}/></button>
   </div>
  </header>
  <main className="main"><div className="app-command-strip"><span className="app-status-dot"/>Workspace synced <span className="command-sep">·</span><span>{workspace?.name??'Workspace'}</span><button onClick={openSearch}><Search size={13}/> Quick search <kbd>⌘K</kbd></button></div>
   {loading?<div className="grid grid-2"><Skeleton className="skeleton-block"/><Skeleton className="skeleton-block"/></div>
    :authFailed?<div className="empty"><h3>You need to sign in</h3><p>Your session is no longer valid. Sign in to continue.</p><Link className="btn btn-primary" href="/login">Sign in</Link></div>
    :workspaceId?children
    :<div className="empty"><h3>No workspace selected</h3><p>Create or select a workspace to continue.</p><Link className="btn btn-secondary" href="/app/settings/workspaces">Manage workspaces</Link></div>}
  </main>
  {bellOpen&&<div className="modal-backdrop" onClick={()=>setBellOpen(false)}><div className="drawer card" onClick={e=>e.stopPropagation()} role="dialog" aria-label="Notifications">
   <div className="drawer-head"><div className="drawer-title"><h3>Notifications</h3>{unread>0&&<span className="drawer-badge">{unread}</span>}</div><button className="icon-btn" onClick={()=>setBellOpen(false)} aria-label="Close notifications"><X size={16}/></button></div>
   {notifError&&<p role="alert" style={{color:'var(--danger)'}}>{notifError}</p>}
   {!notifs?<p className="muted">Loading…</p>:notifs.length===0?<p className="muted">You're all caught up.</p>:<>
    <div className="card-actions"><button className="text-btn" onClick={()=>void markAllRead()}>Mark all read</button></div>
    {notifs.map(n=><div key={n.id} className={`notif ${n.readAt?'':'unread'}`}>
     <div className="notif-top"><Badge>{n.type.replaceAll('_',' ')}</Badge>{!n.readAt&&<button className="text-btn" onClick={()=>void markRead(n.id)}>Mark read</button>}</div>
     <strong>{n.title}</strong>
     {n.body&&<p className="muted">{n.body}</p>}
     {n.entityType==='content'&&n.entityId&&<Link className="text-btn" href={`/app/content/${n.entityId}`} onClick={()=>setBellOpen(false)}>Open content</Link>}
    </div>)}
   </>}
  </div></div>}
  {searchOpen&&<div className="modal-backdrop" onClick={()=>setSearchOpen(false)}><div className="search-modal card" onClick={e=>e.stopPropagation()} role="dialog" aria-label="Search content">
   <div className="search-head"><div className="search-title"><Search size={15}/><h2>Search</h2></div><kbd className="search-kbd"><Command size={12}/> K</kbd></div>
   <div className="search-input-row"><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search your content by title, platform, or format…" aria-label="Search your content"/><button className="icon-btn" onClick={()=>setSearchOpen(false)} aria-label="Close search"><X size={16}/></button></div>
   <div className="search-results">
    {searchLoading?<p className="muted" style={{padding:12}}>Loading content…</p>
     :results.length===0?<p className="muted" style={{padding:12}}>{term?`No content matches "${query}".`:'Nothing created yet. Start from Create.'}</p>
     :<div><span className="search-group-label">Content</span>{results.map(x=><Link key={x.id} href={`/app/content/${x.id}`} onClick={()=>setSearchOpen(false)} className="search-result"><span className="search-result-lead"><FileText size={15}/></span><span><strong>{x.title??'Untitled content'}</strong><small>{x.platform} · {x.format}</small></span><Badge>{x.status}</Badge></Link>)}</div>}
   </div>
   <div className="search-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
  </div></div>}
  <AIWidget/>
  <Toaster/>
 </div>;
}