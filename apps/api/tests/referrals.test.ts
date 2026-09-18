import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../src/db.js';
import {
  claimReferral,
  completeReferralAndReward,
  DEFAULT_REWARD_AI_GENERATIONS,
  getOrCreateReferralCode,
  isInvalidError,
  listReferralStats,
  normalizeReferralCode,
  ReferralError,
} from '../src/services/referrals.js';

// The full lifecycle needs a live database (localhost:5050). Opt in with
// CONTENTRA_DB_TESTS=1 so the default `pnpm -r test` stays DB-free.
const ENABLED = process.env.CONTENTRA_DB_TESTS === '1';

describe('referral code helpers (pure)', () => {
  it('trims and uppercases codes', () => {
    expect(normalizeReferralCode('  ctra-abcd2345 ')).toBe('CTRA-ABCD2345');
  });

  it('defaults the reward to 10 AI generations', () => {
    expect(DEFAULT_REWARD_AI_GENERATIONS).toBe(10);
  });

  it('classifies only ReferralError as an invalid referral', () => {
    expect(isInvalidError(new ReferralError('REFERRAL_SELF', 'no'))).toBe(true);
    expect(isInvalidError(new Error('other'))).toBe(false);
  });
});

describe.skipIf(!ENABLED)('referrals lifecycle (integration)', () => {
  let referrerId = '';
  let referrerWs = '';
  let referredId = '';
  let referredWs = '';
  let code = '';

  beforeAll(async () => {
    const stamp = Date.now();
    const referrer = await prisma.user.create({
      data: { email: `referrer-${stamp}@example.com`, name: 'Referrer' },
    });
    referrerId = referrer.id;
    referrerWs = (
      await prisma.workspace.create({
        data: { name: 'Referrer WS', type: 'CREATOR', ownerId: referrer.id },
      })
    ).id;

    const referred = await prisma.user.create({
      data: { email: `referred-${stamp}@example.com`, name: 'Referred' },
    });
    referredId = referred.id;
    referredWs = (
      await prisma.workspace.create({
        data: { name: 'Referred WS', type: 'CREATOR', ownerId: referred.id },
      })
    ).id;

    code = (await getOrCreateReferralCode(referrerWs)).code;
  });

  afterAll(async () => {
    if (referredWs) {
      await prisma.entitlementAdjustment
        .deleteMany({ where: { workspaceId: referredWs } })
        .catch(() => undefined);
      await prisma.aICreditBalance
        .deleteMany({ where: { workspaceId: referredWs } })
        .catch(() => undefined);
    }
    await prisma.auditLog
      .deleteMany({ where: { userId: { in: [referrerId, referredId] } } })
      .catch(() => undefined);
    if (referrerWs) {
      await prisma.referralCode
        .deleteMany({ where: { workspaceId: referrerWs } })
        .catch(() => undefined);
    }
    if (referredWs) {
      await prisma.workspace
        .deleteMany({ where: { id: referredWs } })
        .catch(() => undefined);
    }
    if (referrerWs) {
      await prisma.workspace
        .deleteMany({ where: { id: referrerWs } })
        .catch(() => undefined);
    }
    await prisma.user
      .deleteMany({ where: { id: { in: [referrerId, referredId] } } })
      .catch(() => undefined);
  });

  it('creates exactly one immutable code per workspace', async () => {
    expect(code).toMatch(/^CTRA-[A-Z2-9]{8}$/);
    const again = await getOrCreateReferralCode(referrerWs);
    expect(again.code).toBe(code);
  });

  it('rejects unknown codes', async () => {
    await expect(
      claimReferral({
        workspaceId: referredWs,
        code: 'CTRA-NOPE2345',
        referredUserId: referredId,
        requesterUserId: referredId,
      }),
    ).rejects.toMatchObject({ code: 'REFERRAL_CODE_NOT_FOUND' });
  });

  it('rejects self-referral (referrer claiming their own code)', async () => {
    await expect(
      claimReferral({
        workspaceId: referrerWs,
        code,
        referredUserId: referrerId,
        requesterUserId: referrerId,
      }),
    ).rejects.toMatchObject({ code: 'REFERRAL_SELF' });
  });

  it('claims a referral as PENDING and rejects a duplicate claim', async () => {
    const claim = await claimReferral({
      workspaceId: referredWs,
      code,
      referredUserId: referredId,
      requesterUserId: referredId,
    });
    expect(claim.status).toBe('PENDING');
    await expect(
      claimReferral({
        workspaceId: referredWs,
        code,
        referredUserId: referredId,
        requesterUserId: referredId,
      }),
    ).rejects.toMatchObject({ code: 'REFERRAL_ALREADY_CLAIMED' });
  });

  it('completes once and rewards +10 AI generations additively', async () => {
    const before = await prisma.aICreditBalance.findUnique({
      where: { workspaceId: referredWs },
    });
    const result = await completeReferralAndReward({
      workspaceId: referredWs,
      referredUserId: referredId,
    });
    expect(result).toMatchObject({ ok: true, rewardAiGenerations: 10 });

    const after = await prisma.aICreditBalance.findUnique({
      where: { workspaceId: referredWs },
    });
    expect(after?.balance ?? 0).toBe((before?.balance ?? 0) + 10);

    const adjustments = await prisma.entitlementAdjustment.findMany({
      where: { workspaceId: referredWs, feature: 'ai_credits', kind: 'ALLOWANCE' },
    });
    expect(adjustments.some((row) => row.amount === 10)).toBe(true);
  });

  it('is idempotent — a second completion grants nothing', async () => {
    const result = await completeReferralAndReward({
      workspaceId: referredWs,
      referredUserId: referredId,
    });
    expect(result).toEqual({ ok: false, reason: 'NO_PENDING_REFERRAL' });

    const stats = await listReferralStats(referrerWs);
    expect(stats.sent).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.pending).toBe(0);
    expect(stats.deliveredGenerations).toBe(10);
  });

  it('never rewards an expired referral', async () => {
    const expiredUser = await prisma.user.create({
      data: { email: `expired-${Date.now()}@example.com`, name: 'Expired' },
    });
    const expiredWs = (
      await prisma.workspace.create({
        data: { name: 'Expired WS', type: 'CREATOR', ownerId: expiredUser.id },
      })
    ).id;
    try {
      const referralCode = await prisma.referralCode.findUniqueOrThrow({
        where: { workspaceId: referrerWs },
      });
      await prisma.referral.create({
        data: {
          codeId: referralCode.id,
          referredUserId: expiredUser.id,
          referredWorkspaceId: expiredWs,
          status: 'EXPIRED',
        },
      });
      const result = await completeReferralAndReward({
        workspaceId: expiredWs,
        referredUserId: expiredUser.id,
      });
      expect(result).toEqual({ ok: false, reason: 'NO_PENDING_REFERRAL' });
    } finally {
      await prisma.referral
        .deleteMany({ where: { referredUserId: expiredUser.id } })
        .catch(() => undefined);
      await prisma.workspace
        .deleteMany({ where: { id: expiredWs } })
        .catch(() => undefined);
      await prisma.user
        .deleteMany({ where: { id: expiredUser.id } })
        .catch(() => undefined);
    }
  });
});
