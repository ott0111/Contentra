import { describe, it, expect, vi, beforeEach } from 'vitest';

type AdjustmentRow = {
  kind: 'ALLOWANCE' | 'ACCESS';
  feature: string;
  amount: number | null;
  active: boolean;
  expiresAt: Date | null;
};

const state = vi.hoisted(() => ({ adjustments: [] as AdjustmentRow[] }));

vi.mock('../src/db.js', () => ({
  prisma: {
    subscription: { findUnique: vi.fn(async () => null) },
    entitlementOverride: { findUnique: vi.fn(async () => null) },
    entitlementAdjustment: {
      findMany: vi.fn(async ({ where }: { where: { feature: string } }) =>
        state.adjustments.filter(
          (row) => row.feature === where.feature && row.active,
        ),
      ),
    },
  },
}));

import {
  assertFeature,
  assertLimit,
  EntitlementError,
} from '../src/services/entitlements.js';

beforeEach(() => {
  state.adjustments.length = 0;
});

describe('granular entitlement adjustments', () => {
  it('uses the plan limit when there are no adjustments (FREE ai_credits = 100)', async () => {
    await expect(assertLimit('ws', 'ai_credits', 100)).resolves.toBe('FREE');
    await expect(assertLimit('ws', 'ai_credits', 101)).rejects.toMatchObject({
      code: 'PLAN_LIMIT_REACHED',
    });
  });

  it('adds an ALLOWANCE adjustment to the plan limit additively', async () => {
    state.adjustments.push({
      kind: 'ALLOWANCE',
      feature: 'ai_credits',
      amount: 10,
      active: true,
      expiresAt: null,
    });
    await expect(assertLimit('ws', 'ai_credits', 110)).resolves.toBe('FREE');
    await expect(assertLimit('ws', 'ai_credits', 111)).rejects.toBeInstanceOf(
      EntitlementError,
    );
  });

  it('sums multiple active allowances without overwriting the base', async () => {
    state.adjustments.push(
      { kind: 'ALLOWANCE', feature: 'ai_credits', amount: 10, active: true, expiresAt: null },
      { kind: 'ALLOWANCE', feature: 'ai_credits', amount: 5, active: true, expiresAt: null },
    );
    await expect(assertLimit('ws', 'ai_credits', 115)).resolves.toBe('FREE');
    await expect(assertLimit('ws', 'ai_credits', 116)).rejects.toMatchObject({
      code: 'PLAN_LIMIT_REACHED',
    });
  });

  it('ignores expired and inactive allowances', async () => {
    state.adjustments.push(
      { kind: 'ALLOWANCE', feature: 'ai_credits', amount: 10, active: true, expiresAt: new Date(Date.now() - 1000) },
      { kind: 'ALLOWANCE', feature: 'ai_credits', amount: 5, active: false, expiresAt: null },
    );
    await expect(assertLimit('ws', 'ai_credits', 100)).resolves.toBe('FREE');
    await expect(assertLimit('ws', 'ai_credits', 101)).rejects.toBeInstanceOf(
      EntitlementError,
    );
  });

  it('unlocks a locked feature via an active ACCESS adjustment', async () => {
    await expect(assertFeature('ws', 'campaigns')).rejects.toMatchObject({
      code: 'FEATURE_LOCKED',
    });
    state.adjustments.push({
      kind: 'ACCESS',
      feature: 'campaigns',
      amount: null,
      active: true,
      expiresAt: null,
    });
    await expect(assertFeature('ws', 'campaigns')).resolves.toBe('FREE');
  });

  it('ignores an expired ACCESS adjustment', async () => {
    state.adjustments.push({
      kind: 'ACCESS',
      feature: 'campaigns',
      amount: null,
      active: true,
      expiresAt: new Date(Date.now() - 1000),
    });
    await expect(assertFeature('ws', 'campaigns')).rejects.toMatchObject({
      code: 'FEATURE_LOCKED',
    });
  });
});
