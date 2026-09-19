'use client';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Button, Card, EmptyState, Metric, PageHeader, Badge, Skeleton } from '@/components/ui';
import { api, ApiClientError } from '@/lib/api';

type Opportunity={id:string;title:string;description:string;whyItMatters?:string|null;suggestedFormat?:string|null;suggestedPlatform?:string|null;relevanceScore?:number|null};
type ContentItem={id:string;title?:string|null;format:string;platform:string;status:string;updatedAt:string};
type HomeData={nba: {title:string;reason:string;type:string}|null; opportunities:Opportunity[]; recommendations:Array<{id:string;title:string;reason:string;priority:number}>; recentContent:ContentItem[]; upcomingCalendar:Array<{id:string;scheduledFor:string;status:string;platform?:string|null;content?:ContentItem|null}>; metrics:Array<{views?:number|null;reach?:number|null;followers?:number|null;engagementRate?:number|null}>};
function useWorkspace(){const [id,setId]=useState('');useEffect(()=>setId(localStorage.getItem('contentra_workspace')??''),[]);return id}
function fmt(n:number|undefined|null){return n==null?'—':new Intl.NumberFormat().format(n)}

export function Home(){
 const workspaceId=useWorkspace(); const [data,setData]=useState<HomeData|null>(null); const [error,setError]=useState('');
 const load=()=>{if(!workspaceId)return;setData(null);setError('');api<HomeData>(`/api/v1/workspaces/${workspaceId}/home`,{},workspaceId).then(setData).catch(e=>setError(e instanceof ApiClientError?e.message:'Your dashboard could not be loaded.'))};
 useEffect(load,[workspaceId]);
 const latest=data?.metrics?.[0]; const published=data?.recentContent?.filter(x=>x.status==='PUBLISHED').length??0; const first=data?.opportunities?.[0];
 return <AppShell active="Home"><div className="home-page">
  <PageHeader eyebrow="Workspace overview" title="Good to see you." description="Connect your business, see what matters, and know what to do next." action={<div className="home-header-actions"><Button variant="secondary" href="/creatos">Find an opportunity</Button><Button href="/app/create">Create content</Button></div>}/>
  {error?<EmptyState title="We couldn't load your dashboard" description={error} action={<Button onClick={load}>Retry</Button>}/>:
   data===null?<div className="home-loading-grid">{[1,2,3,4,5,6].map(x=><Skeleton key={x} className="skeleton-block"/>)}</div>:
   <>
    <section className="home-command-card"><div className="command-content"><span className="home-kicker">NEXT BEST ACTION</span><h2>{data.nba?.title??'Build your first content signal.'}</h2><p>{data.nba?.reason??'Complete your workspace context and Contentra will start surfacing personalized actions.'}</p><div className="command-meta"><span>Based on your workspace</span><span>Actionable recommendation</span></div></div><Button href={data.nba?'/creatos':'/app/create'}>{data.nba?'Take action':'Get started'}</Button></section>
    <section className="home-metric-grid">
      <Card className="home-metric-card featured"><span>Reach</span><strong>{fmt(latest?.reach)}</strong><small>Latest connected data</small></Card>
      <Card className="home-metric-card"><span>Views</span><strong>{fmt(latest?.views)}</strong><small>Latest connected data</small></Card>
      <Card className="home-metric-card"><span>Published</span><strong>{published}</strong><small>Recent workspace activity</small></Card>
      <Card className="home-metric-card"><span>Engagement</span><strong>{latest?.engagementRate==null?'—':`${(latest.engagementRate*100).toFixed(1)}%`}</strong><small>Latest connected data</small></Card>
    </section>
    <div className="home-section-head"><div><span className="home-kicker muted-kicker">CONTENT INTELLIGENCE</span><h2>What deserves your attention</h2></div><a className="text-btn" href="/creatos">View all</a></div>
    <section className="home-intelligence-grid">
      <Card className="home-opportunity-panel"><div className="panel-label">TOP OPPORTUNITY</div>{first?<><h3>{first.title}</h3><p>{first.description}</p>{first.whyItMatters&&<div className="home-why"><span>WHY IT MATTERS</span><p>{first.whyItMatters}</p></div>}<div className="home-panel-actions"><Button href={`/app/create/custom?opportunity=${first.id}`}>Create from this</Button><Button variant="secondary" href="/creatos">See more</Button></div></>:<EmptyState title="No opportunities yet" description="Contentra will surface opportunities as it learns from your workspace."/>}</Card>
      <Card className="home-insights-panel"><div className="panel-label">PERFORMANCE SIGNALS</div>{data.recommendations.length?data.recommendations.slice(0,4).map(r=><div className="home-insight" key={r.id}><span className="priority">{r.priority}</span><div><strong>{r.title}</strong><p>{r.reason}</p></div></div>):<EmptyState title="Insights are building" description="Connect more data to unlock recommendations."/>}</Card>
    </section>
    <div className="home-section-head compact"><div><span className="home-kicker muted-kicker">EXECUTION</span><h2>Keep moving</h2></div></div>
    <section className="home-execution-grid">
      <Card className="home-content-panel"><div className="panel-head"><div><h3>Recent content</h3><p>What you've been working on</p></div><a className="text-btn" href="/app/content">View library</a></div>{data.recentContent.length?data.recentContent.slice(0,5).map(x=><div className="home-content-row" key={x.id}><div className="home-content-thumb">{x.format.slice(0,1).toUpperCase()}</div><div><strong>{x.title??'Untitled content'}</strong><span>{x.platform} · {x.format}</span></div><Badge>{x.status}</Badge></div>):<EmptyState title="Your workspace is ready" description="Start with an opportunity or create content from scratch." action={<Button href="/app/create">Create content</Button>}/>}</Card>
      <Card className="home-calendar-panel"><div className="panel-head"><div><h3>Upcoming</h3><p>Your publishing queue</p></div><a className="text-btn" href="/app/calendar">Calendar</a></div>{data.upcomingCalendar.length?data.upcomingCalendar.slice(0,4).map(x=><div className="home-schedule-row" key={x.id}><div className="date-box"><b>{new Date(x.scheduledFor).getDate()}</b><span>{new Date(x.scheduledFor).toLocaleDateString(undefined,{month:'short'})}</span></div><div><strong>{x.content?.title??'Scheduled content'}</strong><span>{x.platform??x.content?.platform??'Platform'} · {new Date(x.scheduledFor).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</span></div><Badge>{x.status}</Badge></div>):<EmptyState title="Nothing scheduled" description="Build your publishing queue from Calendar." action={<Button variant="secondary" href="/app/calendar">Open calendar</Button>}/>}</Card>
    </section>
   </>}
 </div></AppShell>;
}

export function Create(){const formats=['Slideshow','Wall of Text','Cutting Fruit','On a Walk','Netflix Documentary','Video Hook & Demo','Speaking Hook & Demo','Talking Head UGC','Green Screen Meme','Talking Head Green Screen','Product Spokesperson','Green Screen Mobile with App','Claymation','Lego','Talking Objects','Felt','Skeleton','Street Interview','Character Swap','Custom'];return <AppShell active="Create"><PageHeader title="Create new content" description="Pick a format to get started. You can switch anytime."/><Card className="ambient"><span className="eyebrow">Recommended for you</span><h2 style={{margin:'9px 0 5px'}}>Recommendation comes from Contentra intelligence</h2><p>No format is fabricated when your workspace has insufficient evidence.</p><Button href="/app/create/custom">Start creating</Button></Card><div className="section"><div className="section-title"><h2>Format library</h2><span className="muted">Reusable creation infrastructure</span></div><div className="grid grid-4">{formats.map(x=><Card className="format-card" key={x}><div><div className="format-preview">{x}</div><h3>{x}</h3><p>Reusable creation inputs with contextual intelligence.</p></div><Button href={`/app/create/${x.toLowerCase().replaceAll(' ','-')}`} variant="secondary">Start</Button></Card>)}</div></div></AppShell>}
