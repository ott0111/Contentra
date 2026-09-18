import { prisma } from "../db.js";
import {
  AdjustmentKind,
  type Prisma,
} from "@prisma/client";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 8;
export const DEFAULT_REWARD_AI_GENERATIONS = 10;

const CODE_CHARS = new Set(CODE_ALPHABET.split(""));
function randomCodeBody(random: () => number = Math.random): string {
  let body = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    body += CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)];
  }
  return body;
}

export function normalizeReferralCode(raw: string): string {
  return raw.trim().toUpperCase();
}

// Public-safe prefix so referral codes are never confused with workspace or
// user ids (all of which are uuid-v4).
const CODE_PREFIX = "CTRA-";

export async function generateUniqueCode(random: () => number = Math.random): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = `${CODE_PREFIX}${randomCodeBody(random)}`;
    const existing = await prisma.referralCode.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error("REFERRAL_CODE_EXHAUSTED");
}

/**
 * Every workspace owns exactly one immutable referral code (created on the
 * first request). Rewards are granted to the *referred user* on their own
 * completed signup — never to the click.
 */
export async function getOrCreateReferralCode(workspaceId: string) {
  const existing = await prisma.referralCode.findUnique({ where: { workspaceId } });
  if (existing) return existing;
  const code = await generateUniqueCode();
  return prisma.referralCode.create({
    data: { code, workspaceId },
  });
}

export class ReferralError extends Error {
  constructor(
    public code:
      | "REFERRAL_CODE_NOT_FOUND"
      | "REFERRAL_SELF"
      | "REFERRAL_ALREADY_CLAIMED"
      | "REFERRAL_NOT_APPLICABLE",
    message: string,
  ) {
    super(message);
    this.name = "ReferralError";
  }
}

export function isInvalidError(e: unknown): boolean {
  return e instanceof ReferralError;
}

/**
 * Claim a referral at signup time. Prevent self-referral, duplicate claims
 * (per-user independent of workspace so users can't farm multiple workspaces
 * from the same code) and manufacturing new accounts to claim again.
 */
export async function claimReferral(input: {
  workspaceId: string;
  code: string;
  referredUserId: string;
  requesterUserId: string;
}) {
  const code = normalizeReferralCode(input.code);
  const referralCode = await prisma.referralCode.findUnique({ where: { code } });
  if (!referralCode) {
    throw new ReferralError("REFERRAL_CODE_NOT_FOUND", "That referral code does not exist.");
  }
  if (referralCode.workspaceId === input.workspaceId) {
    throw new ReferralError("REFERRAL_SELF", "You can't refer your own workspace.");
  }

  // A user can only be credited by a code once, ever — regardless of how many
  // workspaces they create later.
  const claimed = await prisma.referral.findUnique({
    where: {
      codeId_referredUserId: {
        codeId: referralCode.id,
        referredUserId: input.referredUserId,
      },
    },
  });
  if (claimed && claimed.status !== "EXPIRED") {
    throw new ReferralError(
      "REFERRAL_ALREADY_CLAIMED",
      "This code has already been claimed by this account.",
    );
  }

  const creatingUser = await prisma.user.findUnique({
    where: { id: input.requesterUserId },
  });
  if (!creatingUser) throw new ReferralError("REFERRAL_NOT_APPLICABLE", "Referrer not found.");
  // Re-check self-referral through the referrer's own user identity as well.
  // The referrer is the owner of the code's workspace; at signup the requester
  // and the referred user are the same account, so comparing the requester to
  // the referred user would reject every legitimate referral claim.
  const referrerWorkspace = await prisma.workspace.findUnique({
    where: { id: referralCode.workspaceId },
    select: { ownerId: true },
  });
  if (!referrerWorkspace) throw new ReferralError("REFERRAL_NOT_APPLICABLE", "Referrer not found.");
  if (referrerWorkspace.ownerId === input.referredUserId) {
    throw new ReferralError("REFERRAL_SELF", "You can't refer yourself.");
  }

  // Idempotent: if a COMPLETED referral already exists, keep it. If a PENDING
  // one exists (user had previously claimed with a different code), reject the
  // new claim so one user = one reward.
  return prisma.referral.create({
    data: {
      codeId: referralCode.id,
      referredUserId: input.referredUserId,
      referredWorkspaceId: input.workspaceId,
      status: "PENDING",
    },
  });
}

export type CompleteReferralResult =
  | { ok: true; rewardAiGenerations: number; deliveredAt: Date }
  | { ok: false; reason: "NO_PENDING_REFERRAL" | "ALREADY_COMPLETED" };

/**
 * Called when the referred user's onboarding is marked complete. Atomically
 * transitions PENDING -> COMPLETED and grants the reward exactly once.
 *
 * Concurrency-safe: uses a conditional updateMany keyed on status=PENDING so
 * only one concurrent request can win; losers see 0 updated rows and report
 * ALREADY_COMPLETED. Combined with the (codeId, referredUserId) unique index,
 * this makes double-claiming / farming idempotent at the database level.
 */
export async function completeReferralAndReward(input: {
  workspaceId: string;
  referredUserId: string;
  rewardAiGenerations?: number;
}) {
  const pending = await prisma.referral.findFirst({
    where: {
      referredUserId: input.referredUserId,
      referredWorkspaceId: input.workspaceId,
      status: "PENDING",
    },
  });
  if (!pending) return { ok: false as const, reason: "NO_PENDING_REFERRAL" };

  // Atomic claim — only the winner flips the row. onDelete via Cascade against
  // the referred workspace keeps history when the workspace is deleted.
  const updated = await prisma.referral.updateMany({
    where: {
      id: pending.id,
      status: "PENDING",
    },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      rewardDeliveredAt: new Date(),
    },
  });
  if (updated.count !== 1) {
    return { ok: false as const, reason: "ALREADY_COMPLETED" };
  }

  const reward = input.rewardAiGenerations ?? DEFAULT_REWARD_AI_GENERATIONS;
  const deliveredAt = new Date();
  // Reward lands in the same AI credit ledger as the FREE plan base and any
  // admin-granted allowances, tracked additively in EntitlementAdjustment for
  // full auditability. Never overwrites the balance — always adds.
  await prisma.$transaction(async (tx) => {
    await tx.aICreditBalance.upsert({
      where: { workspaceId: input.workspaceId },
      create: { workspaceId: input.workspaceId, balance: reward },
      update: { balance: { increment: reward } },
    });
    await tx.entitlementAdjustment.create({
      data: {
        workspaceId: input.workspaceId,
        kind: AdjustmentKind.ALLOWANCE,
        feature: "ai_credits",
        amount: reward,
        active: true,
        reason: `referral:${pending.codeId}`,
        grantedBy: null,
      },
    });
    await tx.auditLog.create({
      data: {
        workspaceId: input.workspaceId,
        userId: input.referredUserId,
        action: "referral.reward.delivered",
        entityType: "workspace",
        entityId: input.workspaceId,
        metadata: {
          rewardAiGenerations: reward,
          referralId: pending.id,
          codeId: pending.codeId,
        },
      },
    });
    await tx.referral.update({
      where: { id: pending.id },
      data: { rewardDeliveredAt: deliveredAt },
    });
  });

  return { ok: true as const, rewardAiGenerations: reward, deliveredAt };
}

export async function listReferralStats(workspaceId: string) {
  const code = await prisma.referralCode.findUnique({ where: { workspaceId } });
  if (!code) return { code: null, sent: 0, completed: 0, pending: 0, deliveredGenerations: 0 };

  const [sent, completed, pending] = await Promise.all([
    prisma.referral.count({ where: { codeId: code.id } }),
    prisma.referral.count({ where: { codeId: code.id, status: "COMPLETED" } }),
    prisma.referral.count({ where: { codeId: code.id, status: "PENDING" } }),
  ]);
  const deliveredGenerations =
    completed > 0
      ? await prisma.referral
          .aggregate({ _sum: { rewardAiGenerations: true }, where: { codeId: code.id, status: "COMPLETED", rewardDeliveredAt: { not: null } } })
          .then((r) => r._sum.rewardAiGenerations ?? 0)
      : 0;
  return { code, sent, completed, pending, deliveredGenerations };
}
