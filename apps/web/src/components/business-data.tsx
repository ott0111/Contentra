'use client';
import { useEffect, useState } from 'react';
import { BusinessShell } from '@/components/business-shell';
import { EmptyState, PageHeader, Skeleton, Button, Card } from '@/components/ui';
import { api, ApiClientError } from '@/lib/api';

type Row = { id: string; externalId: string; integrationId: string; data: Record<string, unknown> };
type Kind = 'customers' | 'leads' | 'products' | 'orders' | 'conversions';

export function BusinessDataTable({ kind, title, description }: { kind: Kind; title: string; description: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const workspace = () => localStorage.getItem('contentra_workspace') ?? '';
  const load = () => {
    const id = workspace();
    if (!id) return;
    setRows(null); setError('');
    api<Row[]>(`/api/v1/business/${kind}?limit=100`, {}, id)
      .then(setRows)
      .catch(e => setError(e instanceof ApiClientError ? e.message : `${title} could not be loaded.`));
  };
  useEffect(load, []);
  return <BusinessShell><PageHeader eyebrow="Business OS" title={title} description={description} action={<Button variant="secondary" onClick={load}>Refresh</Button>} />
    <div className="grid grid-4"><Card><strong style={{ fontSize: 27 }}>{rows === null ? '…' : rows.length}</strong><br /><span className="muted">Synced {title.toLowerCase()}</span></Card>
      <Card><strong style={{ fontSize: 27 }}>{rows?.length ? new Set(rows.map(r => r.integrationId)).size : 0}</strong><br /><span className="muted">Source integrations</span></Card></div>
    {error ? <div className="section"><EmptyState title={`${title} are unavailable`} description={error} action={<Button onClick={load}>Retry</Button>} /></div>
      : rows === null ? <div className="section"><Skeleton className="skeleton-block" /></div>
      : rows.length === 0 ? <div className="section"><EmptyState title={`No ${title.toLowerCase()} yet`} description="Records appear here only when a supported business integration syncs real data." action={<Button href="/app/settings/integrations">Connect integration</Button>} /></div>
      : <div className="section"><Card style={{ overflow: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}><thead><tr><th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>External ID</th><th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Record</th><th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>Source</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}><td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}><code>{r.externalId}</code></td><td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>{JSON.stringify(r.data).slice(0, 120)}</td><td style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)' }}><code>{r.integrationId.slice(0, 8)}</code></td></tr>)}</tbody></table></Card></div>}
  </BusinessShell>;
}