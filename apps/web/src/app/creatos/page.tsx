'use client';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { Badge, Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { api, ApiClientError } from '@/lib/api';

type Opportunity = {
  id: string;
  title: string;
  description: string;
  suggestedFormat?: string | null;
  suggestedPlatform?: string | null;
  whyItMatters?: string | null;
};

type Home = { opportunities: Opportunity[] };

export default function CreatosPage() {
  const [items, setItems] = useState<Opportunity[] | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  const workspace = () => localStorage.getItem('contentra_workspace') ?? '';

  const load = () => {
    const id = workspace();
    if (!id) return;
    api<Home>(`/api/v1/workspaces/${id}/home`, {}, id)
      .then((data) => {
        setItems(data.opportunities);
        setMessage('');
      })
      .catch((e) => {
        setItems([]);
        setMessage(
          e instanceof ApiClientError
            ? e.message
            : 'Creatos could not be loaded.',
        );
      });
  };

  useEffect(load, []);

  async function status(item: Opportunity, value: 'SAVED' | 'SKIPPED') {
    const id = workspace();
    setBusy(item.id);
    const before = items;
    setItems(
      (current) =>
        current?.filter((entry) => entry.id !== item.id) ?? null,
    );
    try {
      await api(
        `/api/v1/workspaces/${id}/opportunities/${item.id}`,
        { method: 'PATCH', body: JSON.stringify({ status: value }) },
        id,
      );
      setMessage(
        value === 'SAVED'
          ? 'Opportunity kept.'
          : 'Opportunity skipped.',
      );
    } catch (e) {
      setItems(before);
      setMessage(
        e instanceof ApiClientError
          ? e.message
          : 'Action could not be saved.',
      );
    } finally {
      setBusy('');
    }
  }

  async function save(item: Opportunity, schedule = false) {
    const id = workspace();
    setBusy(item.id);
    try {
      const content = await api<{ id: string }>(
        `/api/v1/workspaces/${id}/content`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: item.title,
            description: item.description,
            format: item.suggestedFormat ?? 'custom',
            platform: item.suggestedPlatform ?? 'general',
          }),
        },
        id,
      );
      await api(
        `/api/v1/workspaces/${id}/opportunities/${item.id}`,
        { method: 'PATCH', body: JSON.stringify({ status: 'ACTED_ON' }) },
        id,
      );
      if (schedule) {
        const date = prompt(
          'Schedule for (ISO date/time)',
          new Date(Date.now() + 86400000).toISOString(),
        );
        if (date)
          await api(
            `/api/v1/workspaces/${id}/calendar`,
            {
              method: 'POST',
              body: JSON.stringify({
                contentId: content.id,
                platform: item.suggestedPlatform,
                scheduledFor: date,
              }),
            },
            id,
          );
      }
      setMessage(
        schedule
          ? 'Draft saved and scheduled.'
          : 'Draft saved to Content.',
      );
      await load();
    } catch (e) {
      setMessage(
        e instanceof ApiClientError
          ? e.message
          : 'Draft could not be saved.',
      );
    } finally {
      setBusy('');
    }
  }

  const active = items && items.length ? items[0] : null;
  const total = items?.length ?? 0;

  return (
    <AppShell active="Creatos">
      <PageHeader
        eyebrow="Rapid workflow"
        title="Creatos"
        description="Keep, skip, remix, or schedule evidence-backed opportunities in one fast pass."
      />
      {message && (
        <p role="status" style={{ marginBottom: 14 }}>
          {message}{' '}
          {total === 0 && (
            <button className="text-btn" onClick={load}>
              Reload
            </button>
          )}
        </p>
      )}
      {!items ? (
        <Skeleton className="skeleton-block" />
      ) : !active ? (
        <EmptyState
          title="All caught up"
          description="No remaining opportunities. Connect a platform or add workspace context to surface evidence-backed opportunities."
          action={
            <Button onClick={() => void load()}>Refresh</Button>
          }
        />
      ) : (
        <div className="creatos">
          <div className="creatos-count">
            {total} {total === 1 ? 'opportunity' : 'opportunities'} remaining
          </div>
          <Card className="opportunity creatos-card" key={active.id}>
            <div className="card-top">
              <Badge>Opportunity</Badge>
              <span className="muted">
                {active.suggestedFormat ?? 'Format open'}
              </span>
            </div>
            <h3>{active.title}</h3>
            <p>{active.description}</p>
            {active.whyItMatters && (
              <div className="creatos-note">
                <strong>Why it matters</strong>
                <p>{active.whyItMatters}</p>
              </div>
            )}
            {active.suggestedPlatform && (
              <span className="creatos-chip">
                {active.suggestedPlatform}
              </span>
            )}
          </Card>
          <div className="creatos-actions">
            <Button
              variant="secondary"
              disabled={busy === active.id}
              onClick={() => void status(active, 'SKIPPED')}
            >
              Skip
            </Button>
            <Button
              disabled={busy === active.id}
              onClick={() => void status(active, 'SAVED')}
            >
              Keep
            </Button>
            <Button
              variant="secondary"
              href={`/app/create/custom?opportunity=${active.id}`}
            >
              Remix / Edit
            </Button>
            <Button
              variant="secondary"
              disabled={busy === active.id}
              onClick={() => void save(active)}
            >
              Save
            </Button>
            <Button
              variant="secondary"
              disabled={busy === active.id}
              onClick={() => void save(active, true)}
            >
              Schedule
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}