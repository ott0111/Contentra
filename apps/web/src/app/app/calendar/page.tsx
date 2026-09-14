'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { api, ApiClientError } from '@/lib/api';

type CalendarItem = { id: string; scheduledFor: string; status: string; platform?: string | null; content?: { id: string; title?: string | null; format: string; platform: string } | null; campaign?: { id: string; name: string } | null };
type ContentItem = { id: string; title?: string | null; format: string; platform: string; status: string };

const pad = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toLocalInput = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

export default function CalendarPage() {
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [items, setItems] = useState<CalendarItem[] | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [reschedule, setReschedule] = useState('');
  const [busy, setBusy] = useState(false);
  const [schedOpen, setSchedOpen] = useState(false);
  const [schedDay, setSchedDay] = useState('');
  const [schedContent, setSchedContent] = useState('');
  const [schedPlatform, setSchedPlatform] = useState('instagram');
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [createBusy, setCreateBusy] = useState(false);
  const [message, setMessage] = useState('');

  const workspace = () => localStorage.getItem('contentra_workspace') ?? '';
  const load = () => {
    const id = workspace();
    if (!id) return;
    setItems(null); setError(''); setMessage('');
    const from = new Date(month.getFullYear(), month.getMonth(), 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59).toISOString();
    api<{ items: CalendarItem[] }>(`/api/v1/workspaces/${id}/calendar?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=100`, {}, id)
      .then(x => setItems(x.items))
      .catch(e => setError(e instanceof ApiClientError ? e.message : 'Calendar could not be loaded.'));
  };
  useEffect(load, [month]);

  const cells = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const leading = first.getDay();
    return Array.from({ length: leading + daysInMonth }, (_, i) => i < leading ? null : i - leading + 1);
  }, [month]);

  const byDay = useMemo(() => {
    const map: Record<string, CalendarItem[]> = {};
    for (const item of items ?? []) {
      const key = dateKey(new Date(item.scheduledFor));
      (map[key] ??= []).push(item);
    }
    return map;
  }, [items]);
  const todayKey = dateKey(new Date());

  function openDay(day: number) {
    setSchedDay(`${month.getFullYear()}-${pad(month.getMonth() + 1)}-${pad(day)}`);
    setSchedContent(''); setSchedPlatform('instagram'); setMessage('');
    setContentItems([]);
    setSchedOpen(true);
    const id = workspace();
    if (id) api<ContentItem[]>(`/api/v1/workspaces/${id}/content`, {}, id).then(setContentItems).catch(() => setContentItems([]));
  }

  async function createSchedule(e: React.FormEvent) {
    e.preventDefault();
    const id = workspace();
    if (!id || !schedContent) return;
    setCreateBusy(true); setMessage('');
    try {
      await api<CalendarItem>(`/api/v1/workspaces/${id}/calendar`, { method: 'POST', body: JSON.stringify({ contentId: schedContent, platform: schedPlatform, scheduledFor: `${schedDay}T09:00:00.000Z` }) }, id);
      setSchedOpen(false); load();
    } catch (err) { setMessage(err instanceof ApiClientError ? err.message : 'Schedule could not be created.'); }
    finally { setCreateBusy(false); }
  }

  async function cancelItem() {
    if (!selected || !confirm('Cancel this scheduled item?')) return;
    const id = workspace();
    setBusy(true);
    try { await api(`/api/v1/workspaces/${id}/calendar/${selected.id}`, { method: 'DELETE' }, id); setSelected(null); load(); }
    catch (err) { setMessage(err instanceof ApiClientError ? err.message : 'Item could not be cancelled.'); }
    finally { setBusy(false); }
  }

  async function applyReschedule() {
    if (!selected || !reschedule) return;
    const id = workspace();
    setBusy(true);
    try { await api(`/api/v1/workspaces/${id}/calendar/${selected.id}`, { method: 'PATCH', body: JSON.stringify({ scheduledFor: new Date(reschedule).toISOString(), status: 'SCHEDULED' }) }, id); setSelected(null); load(); }
    catch (err) { setMessage(err instanceof ApiClientError ? err.message : 'Schedule could not be updated.'); }
    finally { setBusy(false); }
  }

  return <AppShell active="Calendar"><PageHeader title="Calendar" description="Plan, schedule, and review your publishing workflow." action={<Button onClick={() => openDay(new Date().getDate())}>Schedule content</Button>} />
    {message && <p role="alert" style={{ color: 'var(--danger)' }}>{message}</p>}
    {error ? <Card style={{ marginRight: 0 }}><EmptyState title="Calendar could not be loaded" description={error} action={<Button onClick={load}>Retry</Button>} /></Card>
      : items === null ? <Skeleton className="skeleton-block" />
      : <>
        <Card><div className="cal-toolbar">
          <Button variant="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Previous month">{'\u2039'} Previous</Button>
          <h2 style={{ margin: 0, fontSize: 20 }}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
          <Button variant="secondary" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Next month">Next {'\u203A'}</Button>
        </div>
        <div className="cal-grid">{[...Array(7)].map((_, i) => <div className="cal-head" key={i}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][i]}</div>)}
          {cells.map((day, index) => day === null ? <div className="cal-day other" key={`e-${index}`} /> : <div className={`cal-day ${dateKey(new Date(month.getFullYear(), month.getMonth(), day)) === todayKey ? 'today' : ''}`} key={day}>
            <span className="cal-num">{day}</span>
            {(byDay[dateKey(new Date(month.getFullYear(), month.getMonth(), day))] ?? []).slice(0, 3).map(item => <button key={item.id} className={`cal-item ${item.status.toLowerCase()}`} onClick={() => { setSelected(item); setReschedule(toLocalInput(item.scheduledFor)); }}>{item.content?.title ?? 'Untitled'} · {String(item.scheduledFor.slice(11, 16))}</button>)}
            {((byDay[dateKey(new Date(month.getFullYear(), month.getMonth(), day))] ?? []).length > 3) && <span className="cal-num">+{(byDay[dateKey(new Date(month.getFullYear(), month.getMonth(), day))] ?? []).length - 3} more</span>}
            <button className="text-btn" onClick={() => openDay(day)}>+ Add</button>
          </div>)}
        </div>
        <div className="cal-legend"><span><i style={{ background: 'var(--accent2)' }} />Scheduled</span><span><i style={{ background: '#eef4ff' }} />... pending</span><span>Click an item to open, reschedule, or cancel it.</span></div></Card>
      </>}
    <div className="section"><Card><h3>Upcoming</h3>{(items ?? []).filter(x => new Date(x.scheduledFor) >= new Date()).slice(0, 5).length ? (items ?? []).filter(x => new Date(x.scheduledFor) >= new Date()).slice(0, 5).map(x => <p key={x.id}><Badge>{x.status}</Badge> {x.content?.title ?? 'Untitled'} · {new Date(x.scheduledFor).toLocaleString()}</p>) : <p className="muted">No upcoming scheduled items this month.</p>}</Card></div>
    {selected && <div className="modal-backdrop" onClick={() => setSelected(null)}><div className="modal-card card" onClick={e => e.stopPropagation()} role="dialog" aria-label="Calendar item">
      <div><Badge>{selected.status}</Badge><h3 style={{ margin: '10px 0 5px' }}>{selected.content?.title ?? 'Untitled content'}</h3><p className="muted">{selected.content?.platform ?? selected.platform ?? 'Platform not set'}{selected.campaign ? ` · ${selected.campaign.name}` : ''}</p></div>
      {selected.content && <Link className="text-btn" href={`/app/content/${selected.content.id}`}>Open content</Link>}
      <div className="card-actions" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <label className="field"><span>Reschedule to</span><input type="datetime-local" value={reschedule} onChange={e => setReschedule(e.target.value)} aria-label="Reschedule to" /></label>
        <div style={{ display: 'flex', gap: 10 }}>
          <Button disabled={busy || !reschedule} onClick={() => void applyReschedule()}>{busy ? 'Saving…' : 'Save new time'}</Button>
          <Button variant="danger" disabled={busy} onClick={() => void cancelItem()}>Cancel item</Button>
          <Button variant="secondary" onClick={() => setSelected(null)}>Close</Button>
        </div>
      </div>
    </div></div>}
    {schedOpen && <div className="modal-backdrop" onClick={() => setSchedOpen(false)}><div className="modal-card card" onClick={e => e.stopPropagation()} role="dialog" aria-label="Schedule content">
      <h3 style={{ margin: 0 }}>Schedule content</h3>
      <form className="form" onSubmit={createSchedule}>
        <label className="field"><span>Date</span><input type="date" value={schedDay} onChange={e => setSchedDay(e.target.value)} required /></label>
        <label className="field"><span>Content</span><select value={schedContent} onChange={e => setSchedContent(e.target.value)} required><option value="">Select content…</option>{contentItems.map(c => <option key={c.id} value={c.id}>{c.title ?? 'Untitled'} ({c.platform})</option>)}</select></label>
        <label className="field"><span>Platform</span><select value={schedPlatform} onChange={e => setSchedPlatform(e.target.value)}><option>instagram</option><option>tiktok</option><option>youtube</option><option>x</option></select></label>
        <div className="card-actions" style={{ marginTop: 4 }}>
          <Button type="submit" disabled={createBusy || !schedContent || !schedDay}>{createBusy ? 'Scheduling…' : 'Schedule'}</Button>
          <Button variant="secondary" onClick={() => setSchedOpen(false)}>Cancel</Button>
        </div>
      </form>
    </div></div>}
  </AppShell>;
}