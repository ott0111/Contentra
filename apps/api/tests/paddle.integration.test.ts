import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { prisma } from '../src/db.js';
import {
  processPaddleEvent,
  verifyPaddleWebhookSignature,
  type PaddleEvent,
} from '../src/services/paddle.js';
import {
  assertFeature,
  assertLimit,
  effectivePlan,
  getEffectivePlan,
  getPlanScope,
  EntitlementError,
} from '../src/services/entitlements.js';

// Requires a live database (locally localhost:5050). Opt-in so the default
// `pnpm -r test` stays DB-free: run with PADDLE_INTEGRATION=1.
const ENABLED = process.env.PADDLE_INTEGRATION === '1';

const ORIG = {
  pro: process.env.PADDLE_PRO_PRICE_ID,
  secret: process.env.PADDLE_WEBHOOK_SECRET,
  env: process.env.PADDLE_ENV,
};

function validHeader(rawBody: string, secret: string) {
  const ts = String(Math.floor(Date.now() / 1000));
  const h1 = crypto.createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex');
  return `ts=${ts};h1=${h1}`;
}

describe.skipIf(!ENABLED)('paddle billing integration', () => {
  let userId = '';
  let workspaceId = '';
  const events: string[] = [];

  function event(partial: Partial<PaddleEvent>): PaddleEvent {
    return {
      event_id: `evt_test_${events.length}`,
      event_type: 'subscription.activated',
      occurred_at: new Date().toISOString(),
      data: {},
      ...partial,
    };
  }

  beforeAll(async () => {
    process.env.PADDLE_ENV = 'sandbox';
    process.env.PADDLE_PRO_PRICE_ID = 'pri_pro_integration';
    process.env.PADDLE_WEBHOOK_SECRET = 'integration-webhook-secret';
    const user = await prisma.user.create({
      data: { email: `paddle-it-${Date.now()}@example.com`, name: 'Paddle IT' },
    });
    userId = user.id;
    const ws = await prisma.workspace.create({
      data: { name: 'Paddle IT Workspace', type: 'CREATOR', ownerId: user.id },
    });
    workspaceId = ws.id;
  });

  afterAll(async () => {
    if (userId) {
      await prisma.integrationEvent.deleteMany({ where: { provider: 'paddle', externalId: { in: events } } });
      if (workspaceId) {
        await prisma.entitlementOverride.deleteMany({ where: { workspaceId } }).catch(() => {});
        await prisma.subscription.deleteMany({ where: { workspaceId } }).catch(() => {});
        await prisma.workspace.deleteMany({ where: { id: workspaceId } }).catch(() => {});
      }
      await prisma.user.deleteMany({ where: { id: userId } }).catch(() => {});
    }
    for (const [k, v] of Object.entries(ORIG)) {
      if (v === undefined) delete (process.env as Record<string, string | undefined>)[
        k === 'pro' ? 'PADDLE_PRO_PRICE_ID' : k === 'secret' ? 'PADDLE_WEBHOOK_SECRET' : 'PADDLE_ENV'
      ];
      else (process.env as Record<string, string>)[
        k === 'pro' ? 'PADDLE_PRO_PRICE_ID' : k === 'secret' ? 'PADDLE_WEBHOOK_SECRET' : 'PADDLE_ENV'
      ] = v;
    }
  });

  it('applies an activated subscription from custom_data into a PRO entitlement', async () => {
    const evt = event({
      event_id: 'evt_it_sub_activated',
      data: {
        id: 'sub_it_pro',
        status: 'active',
        customer_id: 'cus_it_pro',
        items: [{ price: { id: 'pri_pro_integration' } }],
        current_billing_period: { starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 86400000).toISOString() },
        custom_data: { workspaceId },
      },
    });
    events.push(evt.event_id);
    const result = await processPaddleEvent(evt);
    expect(result.duplicate).toBe(false);
    expect(result.workspaceId).toBe(workspaceId);
    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
    expect(sub?.provider).toBe('paddle');
    expect(sub?.externalSubscriptionId).toBe('sub_it_pro');
    expect(sub?.externalCustomerId).toBe('cus_it_pro');
    expect(sub?.status).toBe('ACTIVE');
    expect(await getEffectivePlan(workspaceId)).toBe('PRO');
  });

  it('treats a repeated event with the same id as a duplicate (idempotent)', async () => {
    const evt = event({
      event_id: 'evt_it_sub_activated',
      data: { id: 'sub_it_pro', status: 'active', customer_id: 'cus_it_pro', items: [{ price: { id: 'pri_pro_integration' } }], custom_data: { workspaceId } },
    });
    for (let i = 0; i < 3; i += 1) {
      const result = await processPaddleEvent(evt);
      expect(result.duplicate).toBe(true);
    }
    const rows = await prisma.integrationEvent.count({
      where: { provider: 'paddle', externalId: 'evt_it_sub_activated' },
    });
    expect(rows).toBe(1);
  });

  it('resolves a transaction event by subscription_id and keeps the paid plan', async () => {
    const evt = event({
      event_id: 'evt_it_trans_paid',
      event_type: 'transaction.paid',
      data: {
        id: 'txn_it_1',
        subscription_id: 'sub_it_pro',
        status: 'paid',
        current_billing_period: { starts_at: new Date().toISOString(), ends_at: new Date(Date.now() + 86400000).toISOString() },
      },
    });
    events.push(evt.event_id);
    const result = await processPaddleEvent(evt);
    expect(result.duplicate).toBe(false);
    expect(result.workspaceId).toBe(workspaceId);
    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
    expect(sub?.status).toBe('ACTIVE');
    expect(await getEffectivePlan(workspaceId)).toBe('PRO');
  });

  it('handles the full billing lifecycle through revocation (back to FREE)', async () => {
    const revoked = event({
      event_id: 'evt_it_sub_revoked',
      event_type: 'subscription.revoked',
      data: { id: 'sub_it_pro', status: 'revoked', customer_id: 'cus_it_pro', items: [{ price: { id: 'pri_pro_integration' } }], custom_data: { workspaceId } },
    });
    events.push(revoked.event_id);
    await processPaddleEvent(revoked);
    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
    expect(sub?.status).toBe('REVOKED');
    expect(await getEffectivePlan(workspaceId)).toBe('FREE');
  });

  it('locks Business features on FREE but unlocks them with an override', async () => {
    const scope = await getPlanScope(workspaceId);
    expect(effectivePlan(scope)).toBe('FREE');
    await expect(assertFeature(workspaceId, 'business_intelligence')).rejects.toMatchObject({ code: 'FEATURE_LOCKED' });
    const override = await prisma.entitlementOverride.upsert({
      where: { workspaceId },
      create: { workspaceId, plan: 'BUSINESS', grantedBy: null, reason: 'integration test' },
      update: { plan: 'BUSINESS', active: true, expiresAt: null, reason: 'integration test' },
    });
    expect(override.plan).toBe('BUSINESS');
    expect(await assertFeature(workspaceId, 'business_intelligence')).toBe('BUSINESS');
    expect(await getEffectivePlan(workspaceId)).toBe('BUSINESS');
  });

  it('reverts to the Paddle entitlement after an override expires or is revoked', async () => {
    const expired = await prisma.entitlementOverride.update({
      where: { workspaceId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(expired.expiresAt && expired.expiresAt <= new Date()).toBe(true);
    expect(await getEffectivePlan(workspaceId)).toBe('FREE');

    const active = await prisma.entitlementOverride.update({
      where: { workspaceId },
      data: { plan: 'BUSINESS', expiresAt: null, active: true },
    });
    expect(active.plan).toBe('BUSINESS');
    expect(await getEffectivePlan(workspaceId)).toBe('BUSINESS');

    const revoked = await prisma.entitlementOverride.update({
      where: { workspaceId },
      data: { active: false },
    });
    expect(revoked.active).toBe(false);
    expect(await getEffectivePlan(workspaceId)).toBe('FREE');
  });

  it('enforces plan limits from the effective entitlement', async () => {
    await expect(assertLimit(workspaceId, 'team_members', 5)).rejects.toBeInstanceOf(EntitlementError);
    const override = await prisma.entitlementOverride.update({
      where: { workspaceId },
      data: { plan: 'AGENCY', active: true, expiresAt: null },
    });
    expect(override.plan).toBe('AGENCY');
    await expect(assertLimit(workspaceId, 'team_members', 5)).resolves.toBe('AGENCY');
  });

  it('rejects a client-forged webhook without the configured secret', async () => {
    const body = JSON.stringify({ event_id: 'evt_evil', event_type: 'subscription.activated', data: { id: 'sub_evil', status: 'active', items: [{ price: { id: 'pri_pro_integration' } }], custom_data: { workspaceId } } });
    expect(verifyPaddleWebhookSignature(body, validHeader(body, 'attacker-secret'))).toBe(false);
    expect(verifyPaddleWebhookSignature(body, undefined)).toBe(false);
    expect(await prisma.integrationEvent.count({ where: { provider: 'paddle', externalId: 'evt_evil' } })).toBe(0);
  });

  it('never lets a client grant itself a plan through the event path', async () => {
    // No admin override and no configured AGENCY price: a forged event cannot
    // mint AGENCY for the workspace. It only records what Paddle sent.
    await prisma.entitlementOverride.update({ where: { workspaceId }, data: { active: false } });
    const forged = event({
      event_id: 'evt_it_forged_agency',
      data: { id: 'sub_it_forged', status: 'active', items: [{ price: { id: 'pri_agency_unknown' } }], custom_data: { workspaceId } },
    });
    events.push(forged.event_id);
    const result = await processPaddleEvent(forged);
    expect(result.workspaceId).toBe(workspaceId);
    const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
    // Unmapped price id maps to FREE; the designed path cannot mint AGENCY.
    expect(sub?.status).toBe('ACTIVE');
    expect(sub?.planId ? (await prisma.plan.findUnique({ where: { id: sub.planId } }))?.code : 'FREE').toBe('FREE');
    expect(await getEffectivePlan(workspaceId)).toBe('FREE');
  });
});