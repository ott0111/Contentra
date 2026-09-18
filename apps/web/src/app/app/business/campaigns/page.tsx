'use client';
import { useEffect, useState } from 'react';
import { BusinessShell } from '@/components/business-shell';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { api, ApiClientError } from '@/lib/api';
import { LockedGate } from '@/components/locked';

type Campaign = { id: string; name: string; description?: string | null; goal?: string | null; platforms: string[]; startDate?: string | null; endDate?: string | null; status: string; createdAt: string; contents: Array<{ id: string; title?: string | null }>; calendarItems: Array<{ id: string }> };

export default function Page() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('GROW_AUDIENCE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [errorCode, setErrorCode] = useState('');
  const [message, setMessage] = useState('');
  const workspace = () => localStorage.getItem('contentra_workspace') ?? '';
  const load = () => {
    const id = workspace();
    if (!id) return;
    setCampaigns(null); setError(''); setErrorCode(''); setMessage('');
    api<Campaign[]>(`/api/v1/workspaces/${id}/campaigns`, {}, id).then(setCampaigns)
      .catch(e => { setError(e instanceof ApiClientError ? e.message : 'Campaigns could not be loaded.'); if (e instanceof ApiClientError) setErrorCode(e.code); });
  };
  useEffect(load, []);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const id = workspace();
    if (!id || !name.trim()) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await api<Campaign>(`/api/v1/workspaces/${id}/campaigns`, { method: 'POST', body: JSON.stringify({ name: name.trim(), goal }) }, id);
      setMessage('Campaign created.'); setName(''); load();
    } catch (err) { setError(err instanceof ApiClientError ? err.message : 'Campaign could not be created.'); }
    finally { setBusy(false); }
  }
  return <BusinessShell><PageHeader eyebrow="Business OS" title="Campaigns" description="Workspace content campaigns tracked against real content and calendar items." />
    <Card><h3>Create a campaign</h3><form className="form" onSubmit={create}>
      <label className="field"><span>Name</span><input value={name} onChange={e => setName(e.target.value)} placeholder="Launch — spring drop" required /></label>
      <label className="field"><span>Goal</span><select value={goal} onChange={e => setGoal(e.target.value)}><option>GROW_AUDIENCE</option><option>DRIVE_ENGAGEMENT</option><option>GENERATE_LEADS</option><option>DRIVE_SALES</option><option>BUILD_AUTHORITY</option></select></label>
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="card-actions"><Button type="submit" disabled={busy || !name.trim()}>{busy ? 'Creating…' : 'Create campaign'}</Button></div>
    </form></Card>
    <div className="section">{errorCode ? <LockedGate code={errorCode} detail={error} /> : error && !campaigns ? <EmptyState title="Campaigns are unavailable" description={error} action={<Button onClick={load}>Retry</Button>} />
      : campaigns === null ? <Skeleton className="skeleton-block" />
      : campaigns.length ? <div className="grid grid-2">{campaigns.map(c => <Card key={c.id}><div className="card-top"><Badge>{c.status}</Badge><span className="muted">{new Date(c.createdAt).toLocaleDateString()}</span></div><h3>{c.name}</h3><p>{c.goal ?? 'No goal set'}{c.description ? ` — ${c.description}` : ''}</p><p className="muted">{c.platforms.join(', ') || 'All platforms'}{c.startDate ? ` · ${new Date(c.startDate).toLocaleDateString()}` : ''}{c.endDate ? ` → ${new Date(c.endDate).toLocaleDateString()}` : ''} · {c.contents.length} content · {c.calendarItems.length} scheduled</p></Card>)}</div>
      : <EmptyState title="No campaigns yet" description="Create a campaign to group content and scheduled items around a goal." />}</div>
  </BusinessShell>;
}