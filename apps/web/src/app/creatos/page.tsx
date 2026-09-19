'use client';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { api, ApiClientError } from '@/lib/api';

type Opportunity={id:string;title:string;description:string;suggestedFormat?:string|null;suggestedPlatform?:string|null;whyItMatters?:string|null};
type Home={opportunities:Opportunity[]};

export default function CreatosPage(){
 const [items,setItems]=useState<Opportunity[]|null>(null); const [message,setMessage]=useState(''); const [busy,setBusy]=useState('');
 const workspace=()=>localStorage.getItem('contentra_workspace')??'';
 const load=()=>{const id=workspace();if(!id)return;api<Home>(`/api/v1/workspaces/${id}/home`,{},id).then(data=>{setItems(data.opportunities);setMessage('')}).catch(e=>{setItems([]);setMessage(e instanceof ApiClientError?e.message:'Creatos could not be loaded.')})};
 useEffect(load,[]);
 async function status(item:Opportunity,value:'SAVED'|'SKIPPED'){const id=workspace();setBusy(item.id);const before=items;setItems(current=>current?.filter(x=>x.id!==item.id)??null);try{await api(`/api/v1/workspaces/${id}/opportunities/${item.id}`,{method:'PATCH',body:JSON.stringify({status:value})},id);setMessage(value==='SAVED'?'Opportunity kept.':'Opportunity skipped.')}catch(e){setItems(before);setMessage(e instanceof ApiClientError?e.message:'Action could not be saved.')}finally{setBusy('')}}
 const active=items&&items.length?items[0]:null; const next=items&&items.length>1?items[1]:null; const total=items?.length??0;
 return <AppShell active="Creatos"><div className="home-page">
  <PageHeader eyebrow="Content intelligence" title="Creatos" description="A fast pass through the opportunities Contentra thinks are worth your attention."/>
  {message&&<p role="status" className="fastlane-message">{message}</p>}
  {!items?<div className="fastlane-wrap"><Skeleton className="skeleton-block"/></div>:!active?<div className="creatos-empty"><div className="creatos-empty-icon">✓</div><h2>You're all caught up</h2><p>No remaining opportunities right now. Add more business context or connect a platform to keep the feed moving.</p><Button onClick={()=>void load()}>Refresh opportunities</Button></div>:
   <><div className="creatos-control-bar"><div className="creatos-stats"><span><strong>{total}</strong> opportunities</span><span>Fast mode</span></div><span className="muted">Keep what matters. Skip what doesn't.</span></div>
    <div className="creatos-feature-row"><div><b>Signal-first</b><span>Evidence-backed ideas</span></div><div><b>Actionable</b><span>Ready to create</span></div><div><b>Your taste</b><span>Keep or skip to refine</span></div></div>
    <div className="fastlane-wrap">
      <div className="fastlane-deck">
       {next&&<Card className="fastlane-card back-card"><div className="fastlane-visual"><span>NEXT IN QUEUE</span><b>{next.suggestedFormat??'Content opportunity'}</b></div><div className="fastlane-body"><div className="fastlane-meta"><Badge>Up next</Badge><span>{next.suggestedPlatform??'Any platform'}</span></div><h2>{next.title}</h2></div></Card>}
       <Card className="fastlane-card front-card">
        <div className="fastlane-visual"><span>CONTENTRA SIGNAL</span><div className="visual-orb">C</div><b>{active.suggestedFormat??'Content opportunity'}</b></div>
        <div className="fastlane-body"><div className="fastlane-meta"><Badge>High signal</Badge><span>{active.suggestedPlatform??'Any platform'}</span></div><h2>{active.title}</h2><p>{active.description}</p>{active.whyItMatters&&<div className="why-card"><small>WHY THIS MATTERS</small><p>{active.whyItMatters}</p></div>}<div className="fastlane-footer"><span>{total} in queue</span><span>Swipe or choose an action</span></div></div>
       </Card>
      </div>
      <div className="fastlane-hint"><span>SKIP</span> or <span>KEEP</span> this opportunity to move through the queue</div>
      <div className="fastlane-actions">
       <button className="fastlane-action skip" disabled={busy===active.id} onClick={()=>void status(active,'SKIPPED')} aria-label="Skip opportunity">×</button>
       <Button variant="secondary" href={`/app/create/custom?opportunity=${active.id}`} ariaLabel="Remix opportunity"><span className="fastlane-action remix">↻</span></Button>
       <button className="fastlane-action keep" disabled={busy===active.id} onClick={()=>void status(active,'SAVED')} aria-label="Keep opportunity">✓</button>
      </div>
      <div className="fastlane-secondary"><Button variant="secondary" href={`/app/create/custom?opportunity=${active.id}`}>Remix / Edit</Button><Button variant="secondary" onClick={()=>void status(active,'SAVED')} disabled={busy===active.id}>Save for later</Button></div>
    </div></>}
 </div></AppShell>;
}