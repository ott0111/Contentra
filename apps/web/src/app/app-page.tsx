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
 const workspaceId=useWorkspace();
 const [data,setData]=useState<HomeData|null>(null);
 const [error,setError]=useState('');
 const load=()=>{if(!workspaceId)return;setData(null);setError('');api<HomeData>(`/api/v1/workspaces/${workspaceId}/home`,{},workspaceId).then(setData).catch(e=>setError(e instanceof ApiClientError?e.message:'Your brief could not be loaded.'))};
 useEffect(load,[workspaceId]);
 return <AppShell active="Home"><PageHeader title="Good to see you." description="Here's what matters today." action={<Button href="/app/create">Create content</Button>}/>
  {error?<EmptyState title="We couldn't load your brief" description={error} action={<Button onClick={load}>Retry</Button>}/>
   :data===null?<><Card><Skeleton className="skeleton-block"/></Card><div className="section grid grid-4"><Skeleton className="skeleton-block"/><Skeleton className="skeleton-block"/><Skeleton className="skeleton-block"/><Skeleton className="skeleton-block"/></div></>
   :<>
    <Card><span className="eyebrow">Daily brief</span>{data.nba?<><h2 style={{margin:'10px 0 7px',fontSize:20}}>{data.nba.title}</h2><p>{data.nba.reason}</p><div className="card-actions"><Button href="/app/create">Act on it</Button></div></>:<><h2 style={{margin:'10px 0 7px',fontSize:20}}>Your brief is building.</h2><p>As Contentra gathers context from your workspace and connected data, this space will explain what matters and why.</p></>}</Card>
    <div className="section grid grid-4">
     <Card className="metric-card"><Metric label="Views" value={fmt(data.metrics?.[0]?.views)} detail="Latest normalized metric"/></Card>
     <Card className="metric-card"><Metric label="Reach" value={fmt(data.metrics?.[0]?.reach)} detail="Latest normalized metric"/></Card>
     <Card className="metric-card"><Metric label="Followers" value={fmt(data.metrics?.[0]?.followers)} detail="Latest normalized metric"/></Card>
     <Card className="metric-card"><Metric label="Engagement" value={data.metrics?.[0]?.engagementRate==null?'—':`${(data.metrics[0].engagementRate*100).toFixed(1)}%`} detail="Latest normalized metric"/></Card>
    </div>
    {data.nba&&<div className="section"><Card className="opportunity"><div className="card-top"><Badge>{data.nba.type}</Badge><span className="muted">Next best action</span></div><h3>{data.nba.title}</h3><p>{data.nba.reason}</p><div className="card-actions"><Button href="/app/create">Create</Button></div></Card></div>}
    <div className="section grid grid-2">
     <div><div className="section-title"><h2>Opportunities</h2></div>
      {data.opportunities.length?data.opportunities.slice(0,3).map(o=><Card key={o.id} className="opportunity" style={{marginBottom:14}}><Badge>Opportunity</Badge><h3>{o.title}</h3><p>{o.whyItMatters??o.description}</p><div className="card-actions"><Button href={`/app/create?opportunity=${o.id}`}>Create</Button></div></Card>):<EmptyState title="No opportunities yet" description="Contentra will show opportunities after enough context is available."/>}
     </div>
     <div><div className="section-title"><h2>What matters</h2><a href="/app/analytics" className="text-btn">View analytics</a></div>
      {data.recommendations.length?data.recommendations.slice(0,4).map(r=><Card key={r.id} style={{marginBottom:14}}><span className="muted">Priority {r.priority}</span><h3 style={{marginTop:4}}>{r.title}</h3><p>{r.reason}</p></Card>):<EmptyState title="No insights yet" description="Recommendations will appear once there is enough normalized history to explain performance."/>}
     </div>
    </div>
    <div className="section grid grid-2">
     <div><div className="section-title"><h2>Recent content</h2><a className="text-btn" href="/app/content">View all</a></div>
      {data.recentContent.length?data.recentContent.slice(0,5).map(c=><Card key={c.id} style={{marginBottom:14}}><Badge>{c.status}</Badge><h3>{c.title??'Untitled content'}</h3><p>{c.platform} · {c.format}</p><div className="card-actions"><Button href={`/app/content/${c.id}`} variant="secondary">Open</Button></div></Card>):<EmptyState title="You haven't created anything yet" description="Start with a format or an opportunity." action={<Button href="/app/create">Create your first piece</Button>}/>}
     </div>
     <div><div className="section-title"><h2>Upcoming</h2><a className="text-btn" href="/app/calendar">View calendar</a></div>
      {data.upcomingCalendar.length?data.upcomingCalendar.slice(0,5).map(x=><Card key={x.id} style={{marginBottom:14}}><Badge>{x.status}</Badge><h3>{x.content?.title??'Calendar item'}</h3><p>{new Date(x.scheduledFor).toLocaleString()} · {x.platform??x.content?.platform??'Platform not set'}</p></Card>):<EmptyState title="Nothing scheduled" description="Create content, then schedule it from the Calendar." action={<Button href="/app/calendar">Open calendar</Button>}/>}
     </div>
    </div>
   </>}
 </AppShell>;
}

export function Create(){const formats=['Slideshow','Wall of Text','Cutting Fruit','On a Walk','Netflix Documentary','Video Hook & Demo','Speaking Hook & Demo','Talking Head UGC','Green Screen Meme','Talking Head Green Screen','Product Spokesperson','Green Screen Mobile with App','Claymation','Lego','Talking Objects','Felt','Skeleton','Street Interview','Character Swap','Custom'];return <AppShell active="Create"><PageHeader title="Create new content" description="Pick a format to get started. You can switch anytime."/><Card><span className="eyebrow">Recommended for you</span><h2 style={{margin:'9px 0 5px'}}>Recommendation comes from Contentra intelligence</h2><p>No format is fabricated when your workspace has insufficient evidence.</p><Button href="/app/create/custom">Start creating</Button></Card><div className="section"><div className="section-title"><h2>Format library</h2><span className="muted">Reusable creation infrastructure</span></div><div className="grid grid-4">{formats.map(x=><Card className="format-card" key={x}><div><div className="format-preview">{x}</div><h3>{x}</h3><p>Reusable creation inputs with contextual intelligence.</p></div><Button href={`/app/create/${x.toLowerCase().replaceAll(' ','-')}`} variant="secondary">Start</Button></Card>)}</div></div></AppShell>}