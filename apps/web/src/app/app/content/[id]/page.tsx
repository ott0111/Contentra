'use client';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { api, ApiClientError } from '@/lib/api';

type Content = { id: string; title?: string | null; description?: string | null; format: string; platform: string; caption?: string | null; script?: string | null; status: string; scheduledAt?: string | null; publishedAt?: string | null; versions: Array<{ id: string; version: number; title?: string | null; caption?: string | null; script?: string | null; createdAt: string }>; assets: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: string }>; publishAttempts: Array<{ status: string; error?: string | null; createdAt: string }>; campaign?: { name: string } | null };
type Collection = { id: string; name: string; description?: string | null };
const toLocalInput = (iso: string) => { const d = new Date(iso); const pad = (n: number) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export default function ContentDetail({ params }: { params: Promise<{ id: string }> }) {
  const [id, setId] = useState('');
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftCaption, setDraftCaption] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleAt, setScheduleAt] = useState('');
  const [collectionsOpen, setCollectionsOpen] = useState(false);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selectedCollection, setSelectedCollection] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => { params.then(x => setId(x.id)).catch(() => undefined); }, [params]);
  const workspace = () => localStorage.getItem('contentra_workspace') ?? '';
  const load = () => {
    const w = workspace();
    if (!w || !id) return;
    setMessage('');
    api<Content>(`/api/v1/workspaces/${w}/content/${id}`, {}, w).then(data => {
      setContent(data); setDraftTitle(data.title ?? ''); setDraftCaption(data.caption ?? data.script ?? ''); setScheduleAt(data.scheduledAt ? toLocalInput(data.scheduledAt) : '');
    }).catch(e => setError(e instanceof ApiClientError ? e.message : 'Content could not be loaded.'));
  };
  useEffect(load, [id]);

  async function mutate(body: Record<string, unknown>) {
    const w = workspace();
    if (!w || !id) return;
    setBusy(true); setError(''); setMessage('');
    try { await api(`/api/v1/workspaces/${w}/content/${id}`, { method: 'PATCH', body: JSON.stringify(body) }, w); setEditing(false); load(); }
    catch (e) { setError(e instanceof ApiClientError ? e.message : 'Content could not be updated.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (!confirm('Delete this content permanently?')) return;
    const w = workspace();
    try { await api(`/api/v1/workspaces/${w}/content/${id}`, { method: 'DELETE' }, w); location.href = '/app/content'; }
    catch (e) { setError(e instanceof ApiClientError ? e.message : 'Content could not be deleted.'); }
  }
  async function restore(versionId: string) {
    const w = workspace();
    setBusy(true);
    try { await api(`/api/v1/workspaces/${w}/content/${id}/versions/${versionId}/restore`, { method: 'POST' }, w); setMessage('Version restored.'); load(); }
    catch (e) { setError(e instanceof ApiClientError ? e.message : 'Version could not be restored.'); }
    finally { setBusy(false); }
  }
  function openCollections() {
    setCollectionsOpen(true); setSelectedCollection(''); setMessage('');
    const w = workspace();
    if (w) api<Collection[]>(`/api/v1/workspaces/${w}/library/collections`, {}, w).then(setCollections).catch(() => setCollections([]));
  }
  async function addToCollection() {
    const w = workspace();
    if (!w || !selectedCollection) return;
    setBusy(true);
    try { await api(`/api/v1/workspaces/${w}/library/collections/${selectedCollection}/items`, { method: 'POST', body: JSON.stringify({ contentId: id }) }, w); setCollectionsOpen(false); setMessage('Saved to collection.'); }
    catch (e) { setError(e instanceof ApiClientError ? e.message : 'Item could not be saved to the collection.'); }
    finally { setBusy(false); }
  }

  return <AppShell active="Content"><PageHeader eyebrow="Content" title={content?.title ?? 'Content detail'} description="Review and update real workspace content." action={<div style={{ display: 'flex', gap: 8 }}>
    {content && <><Button variant="secondary" onClick={() => setEditing(v => !v)}>{editing ? 'Close editor' : 'Edit'}</Button><Button variant="secondary" onClick={openCollections}>Save to collection</Button><Button variant="danger" onClick={() => void remove()}>Delete</Button></>}
  </div>} />
    {error && !content && <EmptyState title="Content is unavailable" description={error} action={<Button onClick={load}>Retry</Button>} />}
    {error && content && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
    {message && <p role="status">{message}</p>}
    {!content && !error && <Skeleton className="skeleton-block" />}
    {content && <div className="grid grid-2">
      <Card><Badge>{content.status}</Badge><h3>Preview</h3>
        {editing
          ? <div className="form"><label className="field"><span>Title</span><input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} /></label><label className="field"><span>Caption / script</span><textarea rows={8} value={draftCaption} onChange={e => setDraftCaption(e.target.value)} /></label><Button disabled={busy} onClick={() => void mutate({ title: draftTitle, caption: draftCaption })}>{busy ? 'Saving…' : 'Save version'}</Button></div>
          : <p>{content.caption ?? content.script ?? content.description ?? 'No copy has been added yet.'}</p>}
      </Card>
      <Card><h3>Metadata</h3><p>{content.platform} · {content.format}</p><p>{content.campaign?.name ?? 'No campaign'}</p><p className="muted">Status: {content.status}</p><div className="card-actions">
        <Button disabled={busy || content.status === 'SCHEDULED' || content.status === 'PUBLISHED'} onClick={() => { setScheduleOpen(true); setScheduleAt(content.scheduledAt ? toLocalInput(content.scheduledAt) : ''); }}>Schedule</Button>
        <Button variant="secondary" disabled={busy || content.status === 'ARCHIVED'} onClick={() => void mutate({ status: 'ARCHIVED' })}>Archive</Button>
      </div></Card>
      <Card><h3>Assets</h3>{content.assets.length ? content.assets.map(a => <p key={a.id}>{a.fileName} · {a.mimeType}</p>) : <p className="muted">No assets attached.</p>}</Card>
      <Card><h3>Publishing</h3>{content.publishAttempts.length ? content.publishAttempts.map(a => <p key={a.createdAt}><Badge>{a.status}</Badge> {a.error ?? 'No error'}</p>) : <p className="muted">No publishing attempts.</p>}</Card>
      <Card><h3>Versions</h3>{content.versions.length ? content.versions.map(v => <div key={v.id} className="card-top" style={{ marginBottom: 8 }}><span><strong>Version {v.version}</strong><br /><small className="muted">{new Date(v.createdAt).toLocaleString()}</small></span><Button variant="secondary" disabled={busy} onClick={() => void restore(v.id)}>Restore</Button></div>) : <p className="muted">No saved versions.</p>}</Card>
    </div>}
    {content && scheduleOpen && <div className="modal-backdrop" onClick={() => setScheduleOpen(false)}><div className="modal-card card" onClick={e => e.stopPropagation()} role="dialog" aria-label="Schedule content">
      <h3 style={{ margin: 0 }}>Schedule content</h3>
      <label className="field"><span>Publish time</span><input type="datetime-local" value={scheduleAt} onChange={e => setScheduleAt(e.target.value)} /></label>
      <div className="card-actions"><Button disabled={busy || !scheduleAt} onClick={() => { void mutate({ status: 'SCHEDULED', scheduledAt: new Date(scheduleAt).toISOString() }); setScheduleOpen(false); }}>Schedule</Button><Button variant="secondary" onClick={() => setScheduleOpen(false)}>Cancel</Button></div>
    </div></div>}
    {content && collectionsOpen && <div className="modal-backdrop" onClick={() => setCollectionsOpen(false)}><div className="modal-card card" onClick={e => e.stopPropagation()} role="dialog" aria-label="Save to collection">
      <h3 style={{ margin: 0 }}>Save to collection</h3>
      {collections.length ? <><label className="field"><span>Collection</span><select value={selectedCollection} onChange={e => setSelectedCollection(e.target.value)}><option value="">Select a collection…</option>{collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><div className="card-actions"><Button disabled={busy || !selectedCollection} onClick={() => void addToCollection()}>Save</Button><Button variant="secondary" onClick={() => setCollectionsOpen(false)}>Cancel</Button></div></> : <p className="muted">No collections yet. Create one from the Library, then come back.</p>}
    </div></div>}
  </AppShell>;
}