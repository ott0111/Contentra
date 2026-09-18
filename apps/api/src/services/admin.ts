import { prisma } from "../db.js";
import crypto from "node:crypto";
import { randomToken, hashToken, timingSafeEqualHex } from "../security.js";
import { configuredEmailSender } from "./email.js";
import type { StaffMember, StaffRole } from "@prisma/client";

export class AdminAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 401,
  ) {
    super(message);
    this.name = "AdminAuthError";
  }
}

// Role hierarchy, lowest to highest. Management is the entry level; only
// Director and above can manage staff; Operations and above can read audit
// logs; only the protected root Owner can change the root Owner.
export const STAFF_RANK: Record<StaffRole, number> = {
  MANAGEMENT: 0,
  OPERATIONS: 1,
  DIRECTOR: 2,
  VICE_PRESIDENT: 3,
  EXECUTIVE_VICE_PRESIDENT: 4,
  CHIEF: 5,
  BOD: 6,
  OWNER: 7,
};

export const atLeast = (role: StaffRole, min: StaffRole) =>
  STAFF_RANK[role] >= STAFF_RANK[min];

export const CAN_MANAGE_STAFF: StaffRole = "DIRECTOR";
export const CAN_MANAGE_ENTITLEMENTS: StaffRole = "DIRECTOR";
export const CAN_VIEW_AUDIT: StaffRole = "OPERATIONS";
export const CAN_GRANT_OWNER: StaffRole = "OWNER";

const CODE_TTL_MS = 10 * 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const CODE_LENGTH = 6;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export function publicStaff(staff: StaffMember) {
  return {
    id: staff.id,
    displayName: staff.displayName,
    role: staff.role,
    isRoot: staff.isRoot,
  };
}

// Bootstraps the protected root Owner from ADMIN_ROOT_EMAIL (server-side env).
// Only runs when no OWNER exists yet, and only ever creates a single root.
let rootBootstrapped = false;
export async function ensureRootOwner() {
  const email = process.env.ADMIN_ROOT_EMAIL?.trim().toLowerCase();
  if (!email) return null;
  const existing = await prisma.staffMember.findFirst({
    where: { role: "OWNER" },
  });
  if (existing) return existing;
  const root = await prisma.staffMember.upsert({
    where: { email },
    update: {},
    create: {
      email,
      displayName: "Root Owner",
      role: "OWNER",
      isRoot: true,
    },
  });
  rootBootstrapped = true;
  await prisma.auditLog.create({
    data: {
      staffId: root.id,
      action: "staff.root_owner_bootstrapped",
      metadata: { email: root.email },
    },
  });
  return root;
}

async function staffByEmail(email?: string) {
  if (!email) return null;
  return prisma.staffMember.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
}

export async function requestStaffCode(email: string) {
  await ensureRootOwner();
  const staff = await staffByEmail(email);
  if (!staff || !staff.active)
    throw new AdminAuthError(
      "NOT_STAFF",
      "That address is not an active staff account.",
      403,
    );
  const sender = configuredEmailSender();
  if (!sender)
    throw new AdminAuthError(
      "ADMIN_EMAIL_NOT_CONFIGURED",
      "Admin email delivery is not configured.",
      503,
    );
  // Rotate: invalidate any prior unused codes so only one sign-in attempt is live.
  await prisma.adminCode.updateMany({
    where: { staffId: staff.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  const code = String(crypto.randomInt(0, 10 ** CODE_LENGTH)).padStart(
    CODE_LENGTH,
    "0",
  );
  await prisma.adminCode.create({
    data: {
      staffId: staff.id,
      codeHash: hashToken(code),
      purpose: "login",
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  await sender.send({
    to: staff.email,
    subject: "Your Contentra admin sign-in code",
    text: `Your Contentra admin sign-in code is ${code}. It expires in 10 minutes. If you did not request it, ignore this email.`,
  });
  return {
    delivered: true,
    role: staff.role,
    displayName: staff.displayName,
  };
}

export async function verifyStaffCode(
  email: string,
  code: string,
  ipAddress?: string,
  userAgent?: string,
) {
  await ensureRootOwner();
  const staff = await staffByEmail(email);
  if (!staff || !staff.active)
    throw new AdminAuthError("NOT_STAFF", "That address is not a staff account.", 403);
  const candidate = await prisma.adminCode.findFirst({
    where: { staffId: staff.id, usedAt: null, purpose: "login" },
    orderBy: { createdAt: "desc" },
  });
  if (!candidate || candidate.expiresAt <= new Date())
    throw new AdminAuthError(
      "INVALID_CODE",
      "That code is missing or expired. Request a new one.",
    );
  if (candidate.attempts >= CODE_MAX_ATTEMPTS) {
    await prisma.adminCode.update({
      where: { id: candidate.id },
      data: { usedAt: new Date() },
    });
    throw new AdminAuthError(
      "CODE_EXHAUSTED",
      "Too many attempts. Request a new code.",
    );
  }
  const provided = hashToken(code.trim());
  if (!timingSafeEqualHex(provided, candidate.codeHash)) {
    await prisma.adminCode.update({
      where: { id: candidate.id },
      data: { attempts: { increment: 1 } },
    });
    await prisma.auditLog.create({
      data: {
        staffId: staff.id,
        action: "staff.code_attempt_failed",
        metadata: { email: staff.email },
        ipAddress,
        userAgent,
      },
    });
    throw new AdminAuthError("INVALID_CODE", "That code is incorrect.");
  }
  await prisma.adminCode.update({
    where: { id: candidate.id },
    data: { usedAt: new Date() },
  });
  await prisma.staffMember.update({
    where: { id: staff.id },
    data: { lastLoginAt: new Date() },
  });
  const token = randomToken(32);
  await prisma.adminSession.create({
    data: {
      staffId: staff.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    },
  });
  await prisma.auditLog.create({
    data: {
      staffId: staff.id,
      action: "staff.login",
      metadata: { email: staff.email },
      ipAddress,
      userAgent,
    },
  });
  return { token, maxAgeSeconds: SESSION_TTL_MS / 1000, staff: publicStaff(staff) };
}

export async function getAdminSession(token?: string) {
  if (!token) return null;
  const session = await prisma.adminSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { staff: true },
  });
  if (
    !session ||
    !session.staff.active ||
    session.expiresAt <= new Date()
  )
    return null;
  return session.staff;
}

export async function endAdminSession(token?: string) {
  if (!token) return;
  await prisma.adminSession.deleteMany({
    where: { tokenHash: hashToken(token) },
  });
}

export async function writeAdminAudit(
  staff: StaffMember,
  action: string,
  entityType?: string,
  entityId?: string,
  metadata?: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string,
) {
  await prisma.auditLog.create({
    data: {
      staffId: staff.id,
      action,
      entityType,
      entityId,
      metadata: (metadata ?? {}) as never,
      ipAddress,
      userAgent,
    },
  });
}