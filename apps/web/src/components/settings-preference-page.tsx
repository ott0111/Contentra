'use client';

import { useEffect, useState } from 'react';
import { AppShell } from './app-shell';
import { SettingsShell } from './settings-shell';
import { api, ApiClientError } from '@/lib/api';
import { Button, Card, PageHeader, Skeleton } from './ui';

type Props = { section: 'preferences' | 'privacy' | 'languages'; title: string; description: string; fields: Array<{ key: string; label: string; placeholder: string }> };
type Me = { preferences?: Record<string, unknown> | null };
export function SettingsPreferencePage({ section, title, description, fields }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { api<Me>('/api/v1/me').then(data => { const stored = (data.preferences?.[section] ?? {}) as Record<string, unknown>; setValues(Object.fromEntries(fields.map(field => [field.key, typeof stored[field.key] === 'string' ? stored[field.key] : ''])) as Record<string, string>); }).catch(error => setMessage(error instanceof ApiClientError ? error.message : 'Settings could not be loaded.')).finally(() => setLoading(false)); }, [section]);
  async function save() { setSaving(true); setMessage(''); try { const current = await api<Me>('/api/v1/me'); await api('/api/v1/me', { method: 'PATCH', body: JSON.stringify({ preferences: { ...(current.preferences ?? {}), [section]: values } }) }); setMessage('Saved.'); } catch (error) { setMessage(error instanceof ApiClientError ? error.message : 'Settings could not be saved.'); } finally { setSaving(false); } }
  return <AppShell active="Settings"><SettingsShell active={section}><PageHeader title={title} description={description} />{loading ? <Skeleton className="skeleton-block" /> : <Card><div className="form">{fields.map(field => <label className="field" key={field.key}><span>{field.label}</span><input value={values[field.key] ?? ''} onChange={event => setValues(current => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder} /></label>)}<Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save changes'}</Button>{message && <p role={message === 'Saved.' ? 'status' : 'alert'}>{message}</p>}</div></Card>}</SettingsShell></AppShell>;
}
