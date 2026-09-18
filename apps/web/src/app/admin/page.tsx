'use client';
import { useCallback, useEffect, useState } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import Link from 'next/link';
import { apiUrl } from '@/lib/api';

type Staff = { id: string; displayName: string | null; role: string; isRoot: boolean };
type AuditRow = {
  id: string; action: string; entityType: string | null; entityId: string | null;
  metadata: Record<string, unknown> | null; ipAddress: string | null;
  userAgent: string | null; createdAt: string;
  staff: { id: string; email: string; role: string } | null;
};
type Entitlement = {
  id: string; workspaceId: string; plan: string; active: boolean; reason: string | null;
  expiresAt: string | null; updatedAt: string;
  workspace: { id: string; name: string } | null;
  staff: { id: string; email: string; role: string } | null;
};

async function adminApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  const response = await fetch(`${apiUrl}${path}`, { ...init, headers, credentials: 'include' });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiAdminError(response.status, error?.code ?? 'REQUEST_FAILED', error?.message ?? 'Request failed.');
  }
  return (body as { data: T }).data;
}
class ApiAdminError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); this.name = 'ApiAdminError'; }
}

const ROLE_COLOR: Record<string, string> = { OWNER: '#b42318', BOD: '#7a2e0e', CHIEF: '#7a2e0e', DIRECTOR: '#1e7a41', OPERATIONS: '#545e68' };

export default function AdminPage() {
  const [session, setSession] = useState<Staff | null | 'loading'>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [audit, setAudit] = useState<AuditRow[] | null>(null);
  const [staff, setStaff] = useState<(Staff & { email: string; active: boolean; lastLoginAt: string | null; createdAt: string })[] | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlement[] | null>(null);
  const [grantWs, setGrantWs] = useState('');
  const [grantPlan, setGrantPlan] = useState('BUSINESS');
  const [grantReason, setGrantReason] = useState('');

  const load = useCallback(() => {
    adminApi<Staff>('/api/v1/admin/me')
      .then(setSession)
      .catch(() => setSession(null));
  }, []);

  useEffect(load, [load]);

  const requestCode = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await adminApi<{ delivered: boolean; role: string }>('/api/v1/admin/request-code', {
        method: 'POST', body: JSON.stringify({ email }),
      });
      setNotice(`A one-time code is on its way to ${email}.`);
      setStep('code');
      void result;
    } catch (e) {
      setError(e instanceof ApiAdminError ? e.message : 'Code could not be requested.');
    } finally { setBusy(false); }
  };

  const verifyCode = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await adminApi<{ staff: Staff }>('/api/v1/admin/verify-code', {
        method: 'POST', body: JSON.stringify({ email, code }),
      });
      setSession(result.staff);
      setStep('email'); setCode('');
    } catch (e) {
      setError(e instanceof ApiAdminError ? e.message : 'Code could not be verified.');
    } finally { setBusy(false); }
  };

  const logout = async () => {
    await adminApi('/api/v1/admin/logout', { method: 'POST' }).catch(() => undefined);
    setSession(null); setStaff(null); setAudit(null);
  };

  useEffect(() => {
    if (session === 'loading' || !session) return;
    const canViewAudit = ['OPERATIONS', 'DIRECTOR', 'VICE_PRESIDENT', 'EXECUTIVE_VICE_PRESIDENT', 'CHIEF', 'BOD', 'OWNER'].includes(session.role);
    const canManage = ['DIRECTOR', 'VICE_PRESIDENT', 'EXECUTIVE_VICE_PRESIDENT', 'CHIEF', 'BOD', 'OWNER'].includes(session.role);
    if (canViewAudit) adminApi<AuditRow[]>('/api/v1/admin/audit-logs?limit=100').then(setAudit).catch(() => setAudit([]));
    if (canManage) adminApi<(Staff & { email: string; active: boolean; lastLoginAt: string | null; createdAt: string })[]>('/api/v1/admin/staff').then(setStaff).catch(() => setStaff([]));
    if (canManage) adminApi<Entitlement[]>('/api/v1/admin/entitlements').then(setEntitlements).catch(() => setEntitlements([]));
  }, [session]);

  const grantEntitlement = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const saved = await adminApi<Entitlement>('/api/v1/admin/entitlements', {
        method: 'POST', body: JSON.stringify({ workspaceId: grantWs.trim(), plan: grantPlan, reason: grantReason || null }),
      });
      setNotice(`Granted ${saved.plan} to ${grantWs.trim()}.`);
      setGrantWs(''); setGrantReason('');
      adminApi<Entitlement[]>('/api/v1/admin/entitlements').then(setEntitlements).catch(() => undefined);
    } catch (e) {
      setError(e instanceof ApiAdminError ? e.message : 'Grant could not be saved.');
    } finally { setBusy(false); }
  };

  const revokeEntitlement = async (id: string) => {
    setBusy(true); setError('');
    try {
      await adminApi(`/api/v1/admin/entitlements/${id}`, { method: 'DELETE' });
      setNotice('Entitlement override revoked; the workspace returns to its Paddle-paid plan or Free.');
      adminApi<Entitlement[]>('/api/v1/admin/entitlements').then(setEntitlements).catch(() => undefined);
    } catch (e) {
      setError(e instanceof ApiAdminError ? e.message : 'Revoke failed.');
    } finally { setBusy(false); }
  };

  if (session === 'loading') return <Shell><p className="muted">Loading admin session…</p></Shell>;
  if (!session) return <Shell>
    <h1 style={{ fontSize: 32, letterSpacing: '-.04em', margin: '0 0 4px' }}>Internal admin</h1>
    <p className="muted">Restricted to provisioned staff. Sign in with the email address on file; a one-time code is delivered by email.</p>
    {error && <p role="alert" style={{ color: 'var(--danger)', margin: '12px 0 0' }}>{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {step === 'email' ? (
      <div style={{ display: 'grid', gap: 10, maxWidth: 380, marginTop: 18 }}>
        <input aria-label="Staff email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" style={field} />
        <button disabled={!email.trim() || busy} onClick={requestCode} style={primary}>{busy ? 'Sending…' : 'Send sign-in code'}</button>
      </div>
    ) : (
      <div style={{ display: 'grid', gap: 10, maxWidth: 380, marginTop: 18 }}>
        <label className="muted">Check your inbox for the 6-digit code.</label>
        <input aria-label="Sign-in code" value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" placeholder="000000" style={field} maxLength={6} />
        <button disabled={code.length !== 6 || busy} onClick={verifyCode} style={primary}>{busy ? 'Verifying…' : 'Verify code'}</button>
        <button className="text-btn" onClick={() => { setStep('email'); setNotice(''); }}>Use a different email</button>
      </div>
    )}
    <p style={{ marginTop: 28 }}><Link href="/" className="text-btn">← Back to Contentra</Link></p>
  </Shell>;

  return <Shell>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ fontSize: 28, letterSpacing: '-.03em', margin: 0 }}>Internal admin</h1>
        <p className="muted" style={{ margin: '4px 0 0' }}>{session.displayName ?? session.id} · <strong style={{ color: ROLE_COLOR[session.role] ?? 'var(--text)', textTransform: 'uppercase', letterSpacing: '.05em', fontSize: 11 }}>{session.role}</strong>{session.isRoot ? ' · protected root' : ''}</p>
      </div>
      <button onClick={logout} style={{ ...quietBtn }}>Sign out</button>
    </div>
    <div className="section">
      <section className="panel" style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 16, background: '#fff' }}>
        <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>Audit log</h2>
        {!audit ? <Skeleton />
          : !audit.length ? <p className="muted">No admin activity yet.</p>
          : <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {audit.map(row => <li key={row.id} style={{ fontSize: 13, display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <code style={{ fontFamily: 'ui-monospace,monospace', fontSize: 12 }}>{row.action}</code>
              <span className="muted">{row.staff?.email ?? 'system'}</span>
              <span className="muted">{new Date(row.createdAt).toLocaleString()}</span>
              {row.ipAddress && <span className="muted">{row.ipAddress}</span>}
            </li>)}
          </ul>}
      </section>
    </div>
    <div className="section">
      <section className="panel" style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 16, background: '#fff' }}>
        <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>Staff</h2>
        {!staff ? <Skeleton />
          : !staff.length ? <p className="muted">No staff records yet.</p>
          : <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {staff.map(member => <li key={member.id} style={{ fontSize: 13, display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <strong>{member.email}</strong>
              <span style={{ color: ROLE_COLOR[member.role] ?? 'var(--text)', textTransform: 'uppercase', letterSpacing: '.04em', fontSize: 11 }}>{member.role}</span>
              {member.isRoot && <span className="muted">root</span>}
              {!member.active && <span style={{ color: 'var(--danger)', fontSize: 11, textTransform: 'uppercase' }}>inactive</span>}
              <span className="muted">{member.displayName ?? ''}</span>
            </li>)}
          </ul>}
      </section>
    </div>
    <div className="section">
      <section className="panel" style={{ padding: 20, border: '1px solid var(--border)', borderRadius: 16, background: '#fff' }}>
        <h2 style={{ fontSize: 15, margin: '0 0 12px' }}>Entitlement overrides</h2>
        <p className="muted" style={{ margin: '0 0 14px' }}>Applies the chosen plan regardless of Paddle (never modifies Paddle). Effective plan = override {'>'} Paddle {'>'} Free.</p>
        <div style={{ display: 'grid', gap: 10, marginBottom: 16 }}>
          <input aria-label="Workspace id" value={grantWs} onChange={e => setGrantWs(e.target.value)} placeholder="workspace id" style={field} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <select aria-label="Plan" value={grantPlan} onChange={e => setGrantPlan(e.target.value)} style={field}>
              {['FREE', 'PRO', 'BUSINESS', 'AGENCY'].map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <input aria-label="Reason" value={grantReason} onChange={e => setGrantReason(e.target.value)} placeholder="reason (optional)" style={{ ...field, flex: 1 }} />
            <button disabled={!grantWs.trim() || busy} onClick={() => void grantEntitlement()} style={primary}>{busy ? 'Saving…' : 'Grant plan'}</button>
          </div>
        </div>
        {!entitlements ? <Skeleton />
          : !entitlements.length ? <p className="muted">No overrides yet.</p>
          : <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }}>
            {entitlements.map(row => <li key={row.id} style={{ fontSize: 13, display: 'flex', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ ...chip, color: ROLE_COLOR[row.plan] ?? 'var(--text)' }}>{row.plan}</span>
              <strong>{row.workspace?.name ?? row.workspaceId}</strong>
              <span className="muted">{row.staff?.email ?? 'system'}</span>
              {row.reason && <span className="muted">“{row.reason}”</span>}
              {row.expiresAt && <span className="muted">expires {new Date(row.expiresAt).toLocaleDateString()}</span>}
              {!row.active && <span style={{ color: 'var(--danger)', fontSize: 11, textTransform: 'uppercase' }}>revoked</span>}
              {row.active && <button className="text-btn" style={{ marginLeft: 'auto', color: 'var(--danger)' }} onClick={() => void revokeEntitlement(row.workspaceId)}>Revoke</button>}
            </li>)}
          </ul>}
      </section>
    </div>
    <p style={{ marginTop: 28 }}><Link href="/" className="text-btn">← Back to Contentra</Link></p>
  </Shell>;
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', padding: '56px 28px', maxWidth: 980, margin: '0 auto', color: 'var(--text)' }}>
      {children}
    </main>
  );
}
const field: CSSProperties = { width: '100%', padding: '11px 12px', borderRadius: 11, border: '1px solid var(--border)', background: '#fff', color: 'var(--text)' };
const primary: CSSProperties = { background: 'var(--accent)', color: '#fff', border: 0, borderRadius: 11, padding: '11px 15px', fontWeight: 650, cursor: 'pointer' };
const chip: CSSProperties = { border: '1px solid var(--border)', borderRadius: 99, padding: '2px 9px', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase' };
const quietBtn: CSSProperties = { background: '#fff', border: '1px solid var(--border)', borderRadius: 11, padding: '9px 13px', color: 'var(--text)', cursor: 'pointer', fontWeight: 600 };
function Skeleton() { return <p className="muted">Loading…</p>; }