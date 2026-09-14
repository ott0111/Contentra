'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, Card, PageHeader } from '@/components/ui';
import { api, ApiClientError } from '@/lib/api';

type Opportunity = { id: string; title: string; description: string; whyItMatters?: string | null; suggestedFormat?: string | null; suggestedPlatform?: string | null; status?: string };
type Trend = { id: string; topic: string; platform: string; momentum?: number | null; relevance?: number | null };

export default function CreateFormat({ params }: { params: Promise<{ format: string }> }) {
  const [format, setFormat] = useState('custom');
  const [topic, setTopic] = useState('');
  const [hook, setHook] = useState('');
  const [copy, setCopy] = useState('');
  const [platform, setPlatform] = useState('instagram');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [context, setContext] = useState('');

  useEffect(() => {
    params.then(value => setFormat(value.format)).catch(() => undefined);
  }, [params]);

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const opportunityId = search.get('opportunity');
    const trendId = search.get('trend');
    const workspaceId = localStorage.getItem('contentra_workspace');
    if (!workspaceId) return;
    if (opportunityId) {
      setContext(`From opportunity ${opportunityId}`);
      api<{ opportunities: Opportunity[] }>(`/api/v1/workspaces/${workspaceId}/home`, {}, workspaceId)
        .then(data => {
          const opportunity = data.opportunities.find(o => o.id === opportunityId);
          if (opportunity) {
            setTopic(opportunity.title);
            if (opportunity.suggestedPlatform) setPlatform(opportunity.suggestedPlatform);
          }
        }).catch(() => undefined);
    } else if (trendId) {
      setContext(`From trend ${trendId}`);
      api<Trend[]>(`/api/v1/workspaces/${workspaceId}/inspiration`, {}, workspaceId)
        .then(trends => {
          const trend = trends.find(t => t.id === trendId);
          if (trend) {
            setTopic(trend.topic);
            if (trend.platform) setPlatform(trend.platform);
          }
        }).catch(() => undefined);
    }
  }, []);

  async function generate() {
    const workspaceId = localStorage.getItem('contentra_workspace');
    if (!workspaceId || !topic.trim()) return;
    setBusy(true); setError('');
    try {
      const result = await api<{ output: string }>(`/api/v1/workspaces/${workspaceId}/ai/actions`, { method: 'POST', body: JSON.stringify({ type: 'create_content', input: { format, topic, hook, platform } }) }, workspaceId);
      setCopy(result.output);
    } catch (e) { setError(e instanceof ApiClientError ? e.message : 'AI could not generate content.'); }
    finally { setBusy(false); }
  }
  async function save() {
    const workspaceId = localStorage.getItem('contentra_workspace');
    if (!workspaceId || !topic.trim()) return;
    setBusy(true); setError('');
    try {
      const created = await api<{ id: string }>(`/api/v1/workspaces/${workspaceId}/content`, { method: 'POST', body: JSON.stringify({ title: topic, format, platform, caption: copy || hook, description: topic }) }, workspaceId);
      const opportunityId = new URLSearchParams(window.location.search).get('opportunity');
      if (opportunityId) {
        await api(`/api/v1/workspaces/${workspaceId}/opportunities/${opportunityId}`, { method: 'PATCH', body: JSON.stringify({ status: 'ACTED_ON' }) }, workspaceId).catch(() => undefined);
      }
      location.href = `/app/content/${created.id}`;
    } catch (e) { setError(e instanceof ApiClientError ? e.message : 'Content could not be saved.'); }
    finally { setBusy(false); }
  }
  return <AppShell active="Create"><PageHeader eyebrow="Create" title={format.replaceAll('-', ' ')} description="Create with real AI context, edit the result, then save it to the workspace." />{error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}{context && <p className="muted" role="status">{context} — inputs were prefilled from real workspace data.</p>}<div className="grid grid-3"><Card><h3>Content inputs</h3><div className="form"><label className="field"><span>Topic</span><input value={topic} onChange={e => setTopic(e.target.value)} placeholder="What is this about?" /></label><label className="field"><span>Platform</span><select value={platform} onChange={e => setPlatform(e.target.value)}><option>instagram</option><option>tiktok</option><option>youtube</option><option>x</option></select></label><label className="field"><span>Hook</span><input value={hook} onChange={e => setHook(e.target.value)} placeholder="Start with an idea…" /></label><Button disabled={busy || !topic.trim()} onClick={() => void generate()}>{busy ? 'Working…' : 'Generate with AI'}</Button></div></Card><Card><h3>Draft</h3><label className="field"><span>Script / caption</span><textarea rows={14} value={copy} onChange={e => setCopy(e.target.value)} placeholder="Generate or write your draft here…" /></label><div className="card-actions"><Button disabled={busy || !topic.trim()} onClick={() => void save()}>Save draft</Button><Button variant="secondary" href="/app/content">Cancel</Button></div></Card><Card><h3>Workflow</h3><p>AI generation uses the workspace backend and records usage only after a real provider response.</p><Badge>Context</Badge><p>Opportunity or trend links mark the source acted-on when you save.</p></Card></div></AppShell>;
}