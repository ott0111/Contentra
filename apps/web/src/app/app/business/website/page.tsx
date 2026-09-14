'use client';
import { useEffect, useState } from 'react';
import { BusinessShell } from '@/components/business-shell';
import { Button, Card, EmptyState, PageHeader } from '@/components/ui';
import { api, ApiClientError } from '@/lib/api';

type Website = { id: string; url: string; domain: string; scan?: { status: string; startedAt: string } | null };

export default function Page() {
  const [url, setUrl] = useState('');
  const [website, setWebsite] = useState<Website | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const workspace = () => localStorage.getItem('contentra_workspace') ?? '';
  const [stored, setStored] = useState<Website | null>(null);
  useEffect(() => { try { setStored(JSON.parse(sessionStorage.getItem('contentra_website') ?? 'null')); } catch { /* ignore */ } }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const id = workspace();
    if (!id || !url.trim()) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const created = await api<Website>(`/api/v1/workspaces/${id}/websites`, { method: 'POST', body: JSON.stringify({ url: url.trim() }) }, id);
      setWebsite(created);
      try { sessionStorage.setItem('contentra_website', JSON.stringify(created)); } catch { /* ignore */ }
      setUrl('');
      setMessage('Website added. A scan has been queued and results arrive as the backend processes it.');
    } catch (err) { setError(err instanceof ApiClientError ? err.message : 'Website could not be added.'); }
    finally { setBusy(false); }
  }

  const current = website ?? stored;
  return <BusinessShell><PageHeader eyebrow="Business OS" title="Website" description="Add a public website so Contentra can scan it as evidence for business context." />
    <Card><h3>Add a website</h3><form className="form" onSubmit={submit}>
      <label className="field"><span>Site URL</span><input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://example.com" type="url" required /></label>
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      {message && <p role="status">{message}</p>}
      <div className="card-actions"><Button type="submit" disabled={busy || !url.trim()}>{busy ? 'Adding…' : 'Add website'}</Button></div>
    </form></Card>
    {current && <div className="section"><Card><h3>{current.domain}</h3><p className="muted">{current.url}</p><p>Status: {current.scan?.status ?? 'PROCESSING'} · {current.scan?.startedAt ? new Date(current.scan.startedAt).toLocaleString() : 'Queued'}</p>
      <p className="muted">Scan output is streamed into business intelligence as the backend producer processes it. There is no fabricated site data in this environment.</p>
    </Card></div>}
    {!current && <div className="section"><EmptyState title="No website added" description="Add your site URL to start a real scan. Until providers sync, nothing is fabricated." /></div>}
  </BusinessShell>;
}