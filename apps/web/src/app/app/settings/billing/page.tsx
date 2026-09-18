'use client';
import { useEffect, useState } from 'react';
import { AppShell } from '@/components/app-shell';
import { SettingsShell } from '@/components/settings-shell';
import { ApiClientError, api } from '@/lib/api';
import { Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';

type Billing = {
  effectivePlanCode: string;
  override: { grantedBy: string | null; expiresAt: string | null; reason: string | null } | null;
  paddleConfigured: { checkout: boolean; webhooks: boolean };
  subscription: {
    status: string;
    plan?: { code: string; name: string; monthlyPriceCents: number; entitlements: Array<{ feature: string; limitValue: number | null }> } | null;
    currentPeriodEnd?: string | null;
  } | null;
} | null;
const plans = [
  { code: 'FREE', name: 'Free', price: '$0', description: 'A practical starting point for every workspace.' },
  { code: 'PRO', name: 'Pro', price: '$19.99/month', description: 'More room for content operations and AI.' },
  { code: 'BUSINESS', name: 'Business', price: '$49.99/month', description: 'Business workflows, attribution, and higher limits.' },
  { code: 'AGENCY', name: 'Agency', price: '$99.99/month', description: 'Teams and agencies: the highest workspaces, seats, and AI credits.' },
];
export default function BillingPage() {
  const [workspaceId, setWorkspaceId] = useState('');
  const [billing, setBilling] = useState<Billing>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const load = () => {
    const id = localStorage.getItem('contentra_workspace') ?? '';
    setWorkspaceId(id);
    if (!id) { setLoading(false); return; }
    setLoading(true);
    api<Billing>(`/api/v1/workspaces/${id}/billing`, {}, id)
      .then(setBilling)
      .catch((e) => setError(e instanceof ApiClientError ? e.message : 'Billing could not be loaded.'))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      setNotice('Subscription updated. It may take a moment for the new plan to apply.');
      window.history.replaceState({}, '', window.location.pathname);
      load();
    } else if (params.get('checkout') === 'cancel') {
      setNotice('Checkout was cancelled. You are still on your current plan.');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);
  async function checkout(plan: 'PRO' | 'BUSINESS' | 'AGENCY') {
    if (!workspaceId) return;
    setBusy(plan); setError(''); setNotice('');
    try {
      const result = await api<{ url: string }>(`/api/v1/workspaces/${workspaceId}/billing/checkout`, { method: 'POST', body: JSON.stringify({ plan }) }, workspaceId);
      window.location.assign(result.url);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : 'Checkout could not be started. Paddle credentials may be missing.');
    } finally { setBusy(''); }
  }
  const paddleReady = billing?.paddleConfigured.checkout;
  const effectiveCode = billing?.effectivePlanCode ?? 'FREE';
  const override = billing?.override;
  const isGranted = Boolean(override);
  return (
    <AppShell active="Settings">
      <SettingsShell active="billing">
        <PageHeader title="Billing" description="Your effective plan is applied across Contentra. Free is the default — payment runs through Paddle for paid plans." />
        {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {loading ? (
          <div className="grid grid-3">
            <Skeleton className="skeleton-block" />
            <Skeleton className="skeleton-block" />
            <Skeleton className="skeleton-block" />
          </div>
        ) : (
          <>
            <Card>
              <span className="eyebrow">Current plan</span>
              <h2>{effectiveCode}{isGranted ? ' (admin grant)' : ''}</h2>
              <p>
                {isGranted ? (
                  <>Granted by a Contentra admin{override?.reason ? ` — ${override.reason}` : ''}{override?.expiresAt ? ` · expires ${new Date(override.expiresAt).toLocaleDateString()}` : ''}.</>
                ) : (
                  billing?.subscription
                    ? <>Status: {billing.subscription.status}{billing.subscription.currentPeriodEnd ? ` · Renews ${new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()}` : ''}</>
                    : 'No Paddle record yet; the workspace is on Free.'
                )}
              </p>
              {billing?.subscription?.plan?.entitlements?.length ? (
                <div className="section">
                  <h3>Plan limits</h3>
                  {billing.subscription.plan.entitlements.map((limit) => (
                    <p key={limit.feature}>{limit.feature.replaceAll('_', ' ')}: {limit.limitValue ?? 'Included'}</p>
                  ))}
                </div>
              ) : null}
            </Card>
            <div className="section grid grid-3">
              {plans.map((plan) => (
                <Card key={plan.code}>
                  <span className="eyebrow">{plan.code}</span>
                  <h2>{plan.name}</h2>
                  <h3>{plan.price}</h3>
                  <p>{plan.description}</p>
                  {plan.code === 'FREE' ? (
                    <Button variant="secondary" disabled>Included</Button>
                  ) : (
                    <Button
                      onClick={() => void checkout(plan.code as 'PRO' | 'BUSINESS' | 'AGENCY')}
                      disabled={Boolean(busy) || !paddleReady}
                    >
                      {!paddleReady ? 'Paddle not configured' : busy === plan.code ? 'Opening checkout…' : 'Upgrade'}
                    </Button>
                  )}
                </Card>
              ))}
            </div>
            {!paddleReady && (
              <div className="section">
                <EmptyState
                  title="Paddle is not configured yet"
                  description="The app keeps working on Free. Once the operator adds Paddle credentials and price IDs, checkout opens for Pro, Business, and Agency without code changes."
                />
              </div>
            )}
          </>
        )}
      </SettingsShell>
    </AppShell>
  );
}