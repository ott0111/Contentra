import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import {
  verifyPaddleWebhookSignature,
  paddleEnvironment,
  priceIdForPlan,
  planForPriceId,
  PaddleConfigError,
  paddleStatusToLocal,
  supportedPaddleEvent,
} from '../src/services/paddle.js';
import { activePlan, effectivePlan, type PlanScope } from '../src/services/entitlements.js';
import { atLeast, CAN_MANAGE_ENTITLEMENTS } from '../src/services/admin.js';

const ORIGINAL_SECRET = process.env.PADDLE_WEBHOOK_SECRET;

function scope(partial: Partial<PlanScope> = {}): PlanScope {
  return {
    planCode: 'FREE',
    subscriptionStatus: 'ACTIVE',
    overridePlan: null,
    override: null,
    ...partial,
  };
}

function validHeader(rawBody: string, secret: string, skewSeconds = 0) {
  const ts = String(Math.floor(Date.now() / 1000) + skewSeconds);
  const h1 = crypto.createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest('hex');
  return `ts=${ts};h1=${h1}`;
}

describe('paddle webhook signature verification', () => {
  beforeEach(() => {
    process.env.PADDLE_WEBHOOK_SECRET = 'unit-test-secret';
    process.env.PADDLE_ENV = 'sandbox';
  });
  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.PADDLE_WEBHOOK_SECRET;
    else process.env.PADDLE_WEBHOOK_SECRET = ORIGINAL_SECRET;
    delete process.env.PADDLE_ENV;
  });

  it('accepts a valid ts;h1 signature over the raw body', () => {
    const body = JSON.stringify({ event_id: 'evt_1', event_type: 'subscription.activated' });
    expect(verifyPaddleWebhookSignature(body, validHeader(body, 'unit-test-secret'))).toBe(true);
  });

  it('rejects an attacker signature made with a different secret', () => {
    const body = JSON.stringify({ event_id: 'evt_1' });
    expect(verifyPaddleWebhookSignature(body, validHeader(body, 'attacker-secret'))).toBe(false);
  });

  it('rejects a tampered body (signature no longer matches)', () => {
    const body = JSON.stringify({ event_id: 'evt_1', event_type: 'subscription.activated' });
    const header = validHeader(body, 'unit-test-secret');
    const tampered = JSON.stringify({ event_id: 'evt_1', event_type: 'subscription.revoked' });
    expect(verifyPaddleWebhookSignature(tampered, header)).toBe(false);
  });

  it('rejects an expired timestamp beyond the 300s tolerance', () => {
    const body = JSON.stringify({ event_id: 'evt_1' });
    expect(verifyPaddleWebhookSignature(body, validHeader(body, 'unit-test-secret', -301))).toBe(false);
  });

  it('rejects a malformed or missing header', () => {
    const body = JSON.stringify({ event_id: 'evt_1' });
    expect(verifyPaddleWebhookSignature(body, undefined)).toBe(false);
    expect(verifyPaddleWebhookSignature(body, 'garbage')).toBe(false);
    expect(verifyPaddleWebhookSignature(body, 'h1=aaaa;ts=1')).toBe(false);
  });

  it('rejects when no webhook secret is configured (Free-only installs)', () => {
    delete process.env.PADDLE_WEBHOOK_SECRET;
    const body = JSON.stringify({ event_id: 'evt_1' });
    expect(verifyPaddleWebhookSignature(body, validHeader(body, 'unit-test-secret'))).toBe(false);
  });
});

describe('paddle status and plan mapping', () => {
  it('maps Paddle statuses to local statuses', () => {
    expect(paddleStatusToLocal('active')).toBe('ACTIVE');
    expect(paddleStatusToLocal('trialing')).toBe('TRIALING');
    expect(paddleStatusToLocal('past_due')).toBe('PAST_DUE');
    expect(paddleStatusToLocal('paused')).toBe('PAUSED');
    expect(paddleStatusToLocal('canceled')).toBe('CANCELED');
    expect(paddleStatusToLocal('cancelled')).toBe('CANCELED');
    expect(paddleStatusToLocal('revoked')).toBe('REVOKED');
    expect(paddleStatusToLocal('completed')).toBe('ACTIVE');
    expect(paddleStatusToLocal('paid')).toBe('ACTIVE');
    expect(paddleStatusToLocal('payment_failed')).toBe('PAYMENT_FAILED');
    expect(paddleStatusToLocal('something_else')).toBe('UNKNOWN');
  });

  it('only supports known subscription and transaction events', () => {
    expect(supportedPaddleEvent('subscription.created')).toBe(true);
    expect(supportedPaddleEvent('subscription.activated')).toBe(true);
    expect(supportedPaddleEvent('subscription.canceled')).toBe(true);
    expect(supportedPaddleEvent('subscription.revoked')).toBe(true);
    expect(supportedPaddleEvent('transaction.completed')).toBe(true);
    expect(supportedPaddleEvent('transaction.payment_failed')).toBe(true);
    expect(supportedPaddleEvent('subscription.price_updated')).toBe(false);
    expect(supportedPaddleEvent('invoice.available')).toBe(false);
  });

  it('maps configured price ids to plans and unknown ids to FREE', () => {
    process.env.PADDLE_PRO_PRICE_ID = 'pri_pro';
    process.env.PADDLE_BUSINESS_PRICE_ID = 'pri_business';
    process.env.PADDLE_AGENCY_PRICE_ID = 'pri_agency';
    expect(priceIdForPlan('PRO')).toBe('pri_pro');
    expect(priceIdForPlan('AGENCY')).toBe('pri_agency');
    expect(priceIdForPlan('FREE')).toBeUndefined();
    expect(planForPriceId('pri_pro')).toBe('PRO');
    expect(planForPriceId('pri_business')).toBe('BUSINESS');
    expect(planForPriceId('pri_agency')).toBe('AGENCY');
    expect(planForPriceId('pri_unknown')).toBe('FREE');
    expect(planForPriceId(undefined)).toBe('FREE');
    delete process.env.PADDLE_PRO_PRICE_ID;
    delete process.env.PADDLE_BUSINESS_PRICE_ID;
    delete process.env.PADDLE_AGENCY_PRICE_ID;
  });

  it('reports the configured Paddle environment', () => {
    process.env.PADDLE_ENV = 'sandbox';
    expect(paddleEnvironment()).toBe('sandbox');
    process.env.PADDLE_ENV = 'production';
    expect(paddleEnvironment()).toBe('production');
    delete process.env.PADDLE_ENV;
    expect(paddleEnvironment()).toBe('production');
  });

  it('PaddleConfigError maps to 503 PADDLE_NOT_CONFIGURED', () => {
    const error = new PaddleConfigError('nope');
    expect(error.status).toBe(503);
    expect(error.code).toBe('PADDLE_NOT_CONFIGURED');
  });
});

describe('effective entitlement precedence', () => {
  it('defaults to FREE with no subscription and no override', () => {
    expect(effectivePlan(scope())).toBe('FREE');
  });

  it('uses the Paddle plan while the subscription status is entitled', () => {
    expect(effectivePlan(scope({ planCode: 'PRO', subscriptionStatus: 'ACTIVE' }))).toBe('PRO');
    expect(effectivePlan(scope({ planCode: 'BUSINESS', subscriptionStatus: 'TRIALING' }))).toBe('BUSINESS');
    expect(effectivePlan(scope({ planCode: 'AGENCY', subscriptionStatus: 'PAST_DUE' }))).toBe('AGENCY');
  });

  it('falls back to FREE when billing lapses (canceled/paused/revoked)', () => {
    for (const status of ['CANCELED', 'PAUSED', 'REVOKED', 'PAYMENT_FAILED', 'UNKNOWN']) {
      expect(activePlan(scope({ planCode: 'PRO', subscriptionStatus: status }))).toBe('FREE');
      expect(effectivePlan(scope({ planCode: 'PRO', subscriptionStatus: status }))).toBe('FREE');
    }
  });

  it('admin override wins over the Paddle entitlement', () => {
    const s = scope({ planCode: 'FREE', subscriptionStatus: 'ACTIVE', overridePlan: 'BUSINESS' });
    expect(effectivePlan(s)).toBe('BUSINESS');
    const paidButOverridden = scope({ planCode: 'PRO', subscriptionStatus: 'CANCELED', overridePlan: 'AGENCY' });
    expect(effectivePlan(paidButOverridden)).toBe('AGENCY');
  });

  it('admin override still applies when Paddle reports cancellation (internal grant)', () => {
    const s = scope({ planCode: 'FREE', subscriptionStatus: 'REVOKED', overridePlan: 'AGENCY' });
    expect(effectivePlan(s)).toBe('AGENCY');
  });
});

describe('admin entitlement gate', () => {
  it('grants entitlement management only at Director and above', () => {
    expect(atLeast('DIRECTOR', CAN_MANAGE_ENTITLEMENTS)).toBe(true);
    expect(atLeast('VICE_PRESIDENT', CAN_MANAGE_ENTITLEMENTS)).toBe(true);
    expect(atLeast('OWNER', CAN_MANAGE_ENTITLEMENTS)).toBe(true);
    expect(atLeast('OPERATIONS', CAN_MANAGE_ENTITLEMENTS)).toBe(false);
    expect(atLeast('MANAGEMENT', CAN_MANAGE_ENTITLEMENTS)).toBe(false);
  });
});