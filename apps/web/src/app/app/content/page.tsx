'use client';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton, Tabs } from '@/components/ui';
import { api, ApiClientError } from '@/lib/api';

type ContentItem = { id: string; title?: string | null; description?: string | null; format: string; platform: string; status: string; scheduledAt?: string | null; publishedAt?: string | null; updatedAt: string; campaign?: { name: string } | null };
const TABS = ['All', 'Drafts', 'Scheduled', 'Published', 'Failed', 'Archived'];
const STATUS: Record<string, string> = { Drafts: 'DRAFT', Scheduled: 'SCHEDULED', Published: 'PUBLISHED', Failed: 'FAILED', Archived: 'ARCHIVED' };

export default function ContentPage() {
  const [items, setItems] = useState<ContentItem[] | null>(null);
  const [tab, setTab] = useState('All');
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const workspace = () => localStorage.getItem('contentra_workspace') ?? '';
  const load = () => {
    const id = workspace();
    if (!id) return;
    setItems(null); setError('');
    api<ContentItem[]>(`/api/v1/workspaces/${id}/content`, {}, id).then(setItems)
      .catch(e => setError(e instanceof ApiClientError ? e.message : 'Content could not be loaded.'));
  };
  useEffect(load, []);
  const term = query.trim().toLowerCase();
  const filtered = (items ?? []).filter(item =>
    (tab === 'All' || item.status === STATUS[tab]) &&
    (!term || `${item.title ?? ''} ${item.platform} ${item.format} ${item.description ?? ''}`.toLowerCase().includes(term))
  );
  return <AppShell active="Content"><PageHeader title="Content" description="Manage what you're creating, scheduling, and publishing." action={<Button href="/app/create">Create</Button>} />
    <Tabs items={TABS} active={tab} onSelect={setTab} label="Filter content by status" />
    <Card><div className="card-actions" style={{ marginTop: 0 }}><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by title, platform, or format…" aria-label="Search content" style={{ flex: 1, border: '1px solid var(--border)', borderRadius: 11, padding: '10px 12px', outline: 'none' }} /></div></Card>
    {error ? <div className="section"><EmptyState title="Content could not be loaded" description={error} action={<Button onClick={load}>Retry</Button>} /></div>
      : items === null ? <div className="section grid grid-2"><Skeleton className="skeleton-block" /><Skeleton className="skeleton-block" /></div>
      : filtered.length ? <div className="section grid grid-2">{filtered.map(c => <Card key={c.id}><div className="card-top"><Badge>{c.status}</Badge>{c.campaign && <span className="muted">{c.campaign.name}</span>}</div><h3>{c.title ?? 'Untitled content'}</h3><p>{c.platform} · {c.format}{c.publishedAt ? ` · Published ${new Date(c.publishedAt).toLocaleDateString()}` : c.scheduledAt ? ` · Scheduled ${new Date(c.scheduledAt).toLocaleString()}` : ''}</p><div className="card-actions"><Button href={`/app/content/${c.id}`} variant="secondary">Open</Button></div></Card>)}</div>
      : <div className="section"><EmptyState title={tab === 'All' ? 'You haven\u2019t created anything yet' : `No ${tab.toLowerCase()} content`} description={tab === 'All' ? 'Start with a format or follow an opportunity. Your real content will appear here once created.' : `Nothing is currently ${tab.toLowerCase()}. Create content, then manage its status from the detail view.`} action={tab === 'All' ? <Button href="/app/create">Create your first piece</Button> : <Button href="/app/create">Create content</Button>} /></div>}
  </AppShell>;
}