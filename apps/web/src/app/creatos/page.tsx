'use client';
import { useEffect, useState } from 'react';
import { CalendarDays, Heart, RotateCcw, Sparkles, X, Zap, Target, WandSparkles } from 'lucide-react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { api, ApiClientError } from '@/lib/api';

type Opportunity = {
  id: string;
  title: string;
  description: string;
  suggestedFormat?: string | null;
  suggestedPlatform?: string | null;
  whyItMatters?: string | null;
};

type Home = { opportunities: Opportunity[] };

export default function CreatosPage() {
  const [items,setItems]=useState<Opportunity[]|null>(null); const [message,setMessage]=useState(''); const [busy,setBusy]=useState(''); const [direction,setDirection]=useState<'left'|'right'|''>('');
  const workspace=()=>localStorage.getItem('contentra_workspace')??'';
  const load=()=>{const id=workspace();if(!id)return;api<Home>(`/api/v1/workspaces/${id}/home`,{},id).then(d=>{setItems(d.opportunities);setMessage('')}).catch(e=>{setItems([]);setMessage(e instanceof ApiClientError?e.message:'Creatos could not be loaded.')})};
  useEffect(load,[]);
  async function act(item:Opportunity,value:'SAVED'|'SKIPPED'){const id=workspace();setBusy(item.id);setDirection(value==='SAVED'?'right':'left');setTimeout(()=>setItems(cur=>cur?.filter(x=>x.id!==item.id)??null),180);try{await api(`/api/v1/workspaces/${id}/opportunities/${item.id}`,{method:'PATCH',body:JSON.stringify({status:value})},id);setMessage(value==='SAVED'?'Kept.':'Skipped.')}catch(e){setMessage(e instanceof ApiClientError?e.message:'Action could not be saved.');await load()}finally{setTimeout(()=>{setBusy('');setDirection('')},220)}}
  async function reset(){await load()}
  const active=items?.[0]??null; const next=items?.[1]??null;
  return <AppShell active="Creatos"><PageHeader eyebrow="Fastlane" title="Creatos" description="Swipe through opportunities. Keep what fits, skip what doesn't, and turn the winners into content."/>
   <div className="creatos-control-bar"><div className="creatos-live"><i/>Live intelligence <span>·</span> personalized to your workspace</div><div className="creatos-stats"><span><strong>{items?.length??'—'}</strong> in queue</span><span><Zap size={12}/> Fast mode</span></div></div>
<div className="creatos-feature-row"><div><Target size={15}/><span><b>Signal-first</b> Opportunities are prioritized by relevance.</span></div><div><WandSparkles size={15}/><span><b>Actionable</b> Every card has a clear next step.</span></div><div><Heart size={15}/><span><b>Your taste</b> Keep or skip to shape recommendations.</span></div></div>
   {!items?<Skeleton className="skeleton-block"/>:!active?<div className="creatos-empty"><div className="creatos-empty-icon"><Sparkles size={22}/></div><h2>You're all caught up.</h2><p>New opportunities appear as Contentra learns from your workspace and connected data.</p><Button onClick={()=>void reset()}>Refresh</Button></div>:
   <div className="fastlane-wrap">
    <div className="fastlane-deck">
      {next&&<div className="fastlane-card back-card"><div className="fastlane-card-inner"><span>UP NEXT</span><h3>{next.title}</h3><p>{next.description}</p></div></div>}
      <article className={`fastlane-card front-card swipe-${direction}`}>
       <div className="fastlane-visual"><span>CONTENT OPPORTUNITY</span><div className="visual-orb"><Sparkles size={25}/></div><b>{active.suggestedFormat??'Content idea'}</b></div>
       <div className="fastlane-body"><div className="fastlane-meta"><Badge>HIGH SIGNAL</Badge><span>{active.suggestedPlatform??'Multi-platform'}</span></div><h2>{active.title}</h2><p>{active.description}</p>{active.whyItMatters&&<div className="why-card"><small>WHY THIS MATTERS</small><p>{active.whyItMatters}</p></div>}<div className="fastlane-footer"><span>{(items?.length??1)} in queue</span><span>Swipe or use the controls</span></div></div>
      </article>
    </div>
    <div className="fastlane-hint"><span>←</span> Skip <span>Swipe</span> Keep <span>→</span></div><div className="fastlane-actions">
      <button className="fastlane-action skip" aria-label="Skip opportunity" disabled={!!busy} onClick={()=>void act(active,'SKIPPED')}><X size={21}/></button>
      <button className="fastlane-action remix" aria-label="Remix opportunity" disabled={!!busy} onClick={()=>location.href=`/app/create/custom?opportunity=${active.id}`}><RotateCcw size={18}/></button>
      <button className="fastlane-action keep" aria-label="Keep opportunity" disabled={!!busy} onClick={()=>void act(active,'SAVED')}><Heart size={21}/></button>
    </div>
    <div className="fastlane-secondary"><Button variant="secondary" href={`/app/create/custom?opportunity=${active.id}`}>Remix / Edit</Button><Button variant="secondary" href="/app/calendar"><CalendarDays size={15}/> Schedule later</Button></div>
   </div>}
   {message&&<p className="fastlane-message" role="status">{message}</p>}
  </AppShell>;
}
