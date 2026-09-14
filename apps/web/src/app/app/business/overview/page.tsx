'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BusinessShell } from '@/components/business-shell';
import { Button, Card, EmptyState, Metric, PageHeader, Skeleton } from '@/components/ui';
import { api, ApiClientError } from '@/lib/api';

type Row = { id: string; externalId: string; integrationId: string; data: Record<string, unknown> };
const KINDS = ['customers', 'leads', 'products', 'orders', 'conversions'] as const;

export default function Page() {
  const [data, setData] = useState<Record<string, Row[]> | null>(null);
  const [error, setError] = useState('');
  const workspace = () => localStorage.getItem('contentra_workspace') ?? '';
  const load = () => {
    const id = workspace();
    if (!id) return;
    setData(null); setError('');
    Promise.all(KINDS.map(async kind => {
      try { return [kind, await api<Row[]>(`/api/v1/business/${kind}?limit=100`, {}, id)] as const; }
      catch { return [kind, null] as const; }
    })).then(entries => {
      const map = Object.fromEntries(entries) as Record<string, Row[] | null>;
      if (KINDS.some(kind => map[kind] === null)) setError('Some business sources could not be loaded.');
      setData(map as Record<string, Row[]>);
    }).catch(() => setError('Business data could not be loaded.'));
  };
  useEffect(load, []);
  return <BusinessShell><PageHeader eyebrow="Business OS" title="Overview" description="Connect content to business outcomes without turning Contentra into a CRM." action={<Button variant="secondary" onClick={load}>Refresh</Button>} />
    <div className="grid grid-4">
      {KINDS.map(kind => <Card key={kind}><Metric label={kind[0].toUpperCase() + kind.slice(1)} value={data ? String(data[kind].length) : '—'} /></Card>)}
    </div>
    {error ? <div className="section"><EmptyState title="Business data is unavailable" description={error} action={<Button onClick={load}>Retry</Button>} /></div>
      : data === null ? <div className="section"><Skeleton className="skeleton-block" /></div>
      : KINDS.some(kind => data[kind].length) ? <div className="section"><Card><h3>Recently synced</h3>
        {KINDS.filter(kind => data[kind].length).map(kind => <div key={kind} style={{ margin: '10px 0' }}><Link className="text-btn" href={`/app/business/${kind}`}>{kind[0].toUpperCase() + kind.slice(1)} · {data[kind].length} records</Link><br /><small className="muted">{data[kind].slice(0, 2).map(r => r.externalId).join(', ')}</small></div>)}
      </Card></div>
      : <div className="section"><EmptyState title="No business data yet" description="This workspace has no synced customers, leads, products, orders, or conversions. Connect a supported integration and Contentra will surface real records here." action={<Button href="/app/settings/integrations">Connect integration</Button>} /></div>}
  </BusinessShell>;
}