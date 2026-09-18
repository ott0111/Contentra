import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { parseCookies, adminSessionCookie, clearAdminSessionCookie } from "../security.js";
import {
  AdminAuthError,
  STAFF_RANK,
  atLeast,
  CAN_MANAGE_STAFF,
  CAN_MANAGE_ENTITLEMENTS,
  CAN_GRANT_OWNER,
  CAN_VIEW_AUDIT,
  ensureRootOwner,
  getAdminSession,
  publicStaff,
  requestStaffCode,
  verifyStaffCode,
  endAdminSession,
  writeAdminAudit,
} from "../services/admin.js";
import type { StaffMember, StaffRole } from "@prisma/client";

const json = (reply: FastifyReply, data: unknown, status = 200) =>
  reply.status(status).send({ data, requestId: reply.request.id });
const fail = (
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
) =>
  reply.status(status).send({ error: { code, message }, requestId: reply.request.id });

const STAFF_ROLES = new Set<string>([
  "MANAGEMENT", "OPERATIONS", "DIRECTOR", "VICE_PRESIDENT",
  "EXECUTIVE_VICE_PRESIDENT", "CHIEF", "BOD", "OWNER",
]);

const OVERRIDE_PLANS = new Set<string>(["FREE", "PRO", "BUSINESS", "AGENCY"]);

// In-memory admin request limiter (per-IP + email + step). Restarts reset the
// window; a distributed limiter is expected at the edge in production.
const limits = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 5;
const WINDOW_MS = 5 * 60 * 1000;
function limited(ip: string, email: string, step: string) {
  prune();
  const now = Date.now();
  const key = `${ip}|${email}|${step}`;
  const current = limits.get(key);
  if (!current || current.resetAt <= now) {
    limits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  if (++current.count > LIMIT) return true;
  return false;
}
function prune() {
  if (limits.size < 2048) return;
  const now = Date.now();
  for (const [key, value] of limits) if (value.resetAt <= now) limits.delete(key);
}

const cookieOf = (request: FastifyRequest) =>
  parseCookies(request.headers.cookie).contentra_admin;

async function staffSession(
  request: FastifyRequest,
  reply: FastifyReply,
  min: StaffRole,
): Promise<StaffMember | null> {
  await ensureRootOwner();
  const staff = await getAdminSession(cookieOf(request));
  if (!staff || !atLeast(staff.role, min)) {
    fail(reply, 401, "ADMIN_SESSION_REQUIRED", "A valid admin session is required.");
    return null;
  }
  return staff;
}

export async function registerAdminRoutes(app: FastifyInstance) {
  app.post("/api/v1/admin/request-code", async (request, reply) => {
    const body = request.body as { email?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email)
      return fail(reply, 400, "EMAIL_REQUIRED", "An email address is required.");
    const ip = request.ip;
    if (limited(ip, email, "request"))
      return fail(reply, 429, "RATE_LIMITED", "Too many admin code requests. Try again shortly.");
    try {
      const result = await requestStaffCode(email);
      return json(reply, result);
    } catch (error) {
      if (error instanceof AdminAuthError)
        return fail(reply, error.status, error.code, error.message);
      throw error;
    }
  });

  app.post("/api/v1/admin/verify-code", async (request, reply) => {
    const body = request.body as { email?: string; code?: string };
    const email = body.email?.trim().toLowerCase();
    const code = body.code?.trim();
    if (!email || !code)
      return fail(reply, 400, "INVALID_CODE", "Email and code are required.");
    const ip = request.ip;
    if (limited(ip, email, "verify"))
      return fail(reply, 429, "RATE_LIMITED", "Too many attempts. Try again shortly.");
    try {
      const result = await verifyStaffCode(
        email,
        code,
        ip,
        String(request.headers["user-agent"] ?? "").slice(0, 300),
      );
      reply.header(
        "set-cookie",
        adminSessionCookie(result.token, result.maxAgeSeconds),
      );
      return json(reply, { staff: result.staff });
    } catch (error) {
      if (error instanceof AdminAuthError)
        return fail(reply, error.status, error.code, error.message);
      throw error;
    }
  });

  app.post("/api/v1/admin/logout", async (request, reply) => {
    await endAdminSession(cookieOf(request));
    reply.header("set-cookie", clearAdminSessionCookie());
    return json(reply, { loggedOut: true });
  });

  app.get("/api/v1/admin/me", async (request, reply) => {
    const staff = await staffSession(request, reply, "MANAGEMENT");
    if (!staff) return;
    return json(reply, publicStaff(staff));
  });

  app.get("/api/v1/admin/staff", async (request, reply) => {
    const actor = await staffSession(request, reply, CAN_MANAGE_STAFF);
    if (!actor) return;
    const members = await prisma.staffMember.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        isRoot: true,
        active: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });
    return json(reply, members);
  });

  app.post("/api/v1/admin/staff", async (request, reply) => {
    const actor = await staffSession(request, reply, CAN_MANAGE_STAFF);
    if (!actor) return;
    const body = request.body as { email?: string; role?: string; displayName?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email)
      return fail(reply, 400, "EMAIL_REQUIRED", "An email address is required.");
    if (!body.role || !STAFF_ROLES.has(body.role))
      return fail(reply, 400, "INVALID_ROLE", "A valid staff role is required.");
    const role = body.role as StaffRole;
    if (role === "OWNER" && !actor.isRoot)
      return fail(reply, 403, "FORBIDDEN", "Only the root Owner can grant the Owner role.");
    const existing = await prisma.staffMember.findUnique({ where: { email } });
    if (existing)
      return fail(reply, 409, "ALREADY_STAFF", "That address is already staff.");
    const created = await prisma.staffMember.create({
      data: { email, role, displayName: body.displayName?.slice(0, 80) || null },
    });
    await writeAdminAudit(
      actor,
      "staff.created",
      "StaffMember",
      created.id,
      { email, role },
      request.ip,
      String(request.headers["user-agent"] ?? "").slice(0, 300),
    );
    return json(reply, publicStaff(created), 201);
  });

  app.patch("/api/v1/admin/staff/:id", async (request, reply) => {
    const actor = await staffSession(request, reply, CAN_MANAGE_STAFF);
    if (!actor) return;
    const id = String((request.params as { id: string }).id);
    const body = request.body as { role?: string; displayName?: string; active?: boolean };
    const target = await prisma.staffMember.findUnique({ where: { id } });
    if (!target)
      return fail(reply, 404, "STAFF_NOT_FOUND", "That staff member was not found.");
    if ((body.role && !STAFF_ROLES.has(body.role)))
      return fail(reply, 400, "INVALID_ROLE", "A valid staff role is required.");
    const role = body.role as StaffRole | undefined;
    if (role === "OWNER" && !actor.isRoot)
      return fail(reply, 403, "FORBIDDEN", "Only the root Owner can grant the Owner role.");
    if (target.isRoot && !actor.isRoot)
      return fail(reply, 403, "FORBIDDEN", "The root Owner cannot be modified by a delegated account.");
    if (target.id === actor.id && body.active === false)
      return fail(reply, 400, "SELF_DEACTIVATION", "You cannot deactivate your own account.");
    if (target.id === actor.id && role) {
      if (STAFF_RANK[role] < STAFF_RANK[target.role])
        return fail(reply, 400, "SELF_DEMOTION", "You cannot demote your own account.");
    }
    const updated = await prisma.staffMember.update({
      where: { id },
      data: {
        ...(role ? { role } : {}),
        ...(body.displayName !== undefined
          ? { displayName: body.displayName.slice(0, 80) || null }
          : {}),
        ...(body.active === true || body.active === false
          ? { active: body.active }
          : {}),
      },
    });
    await writeAdminAudit(
      actor,
      "staff.updated",
      "StaffMember",
      id,
      { role, displayName: body.displayName, active: body.active },
      request.ip,
      String(request.headers["user-agent"] ?? "").slice(0, 300),
    );
    return json(reply, publicStaff(updated));
  });

  app.get("/api/v1/admin/entitlements", async (request, reply) => {
    const actor = await staffSession(request, reply, CAN_MANAGE_ENTITLEMENTS);
    if (!actor) return;
    const overrides = await prisma.entitlementOverride.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        workspace: { select: { id: true, name: true } },
        staff: { select: { id: true, email: true, role: true } },
      },
    });
    return json(reply, overrides);
  });

  app.post("/api/v1/admin/entitlements", async (request, reply) => {
    const actor = await staffSession(request, reply, CAN_MANAGE_ENTITLEMENTS);
    if (!actor) return;
    const body = request.body as {
      workspaceId?: string;
      plan?: string;
      reason?: string;
      expiresAt?: string | null;
    };
    if (!body.workspaceId)
      return fail(reply, 400, "WORKSPACE_REQUIRED", "workspaceId is required.");
    if (!body.plan || !OVERRIDE_PLANS.has(body.plan))
      return fail(reply, 400, "INVALID_PLAN", "plan must be FREE, PRO, BUSINESS or AGENCY.");
    const workspace = await prisma.workspace.findUnique({
      where: { id: body.workspaceId },
      select: { id: true, name: true },
    });
    if (!workspace)
      return fail(reply, 404, "WORKSPACE_NOT_FOUND", "That workspace was not found.");
    let expiresAt: Date | null = null;
    if (body.expiresAt) {
      const parsed = new Date(body.expiresAt);
      if (Number.isNaN(parsed.getTime()))
        return fail(reply, 400, "INVALID_EXPIRY", "expiresAt must be an ISO date.");
      expiresAt = parsed;
    }
    // Internal entitlement override only: this must NEVER create Paddle records
    // or pretend a payment happened. Paddle stays the source of truth for
    // actual subscription state.
    const saved = await prisma.entitlementOverride.upsert({
      where: { workspaceId: body.workspaceId },
      create: {
        workspaceId: body.workspaceId,
        plan: body.plan,
        grantedBy: actor.id,
        reason: body.reason?.slice(0, 500) || null,
        expiresAt,
      },
      update: {
        plan: body.plan,
        grantedBy: actor.id,
        reason: body.reason?.slice(0, 500) || null,
        expiresAt,
        active: true,
      },
    });
    await writeAdminAudit(
      actor,
      "entitlement.granted",
      "Workspace",
      workspace.id,
      { plan: saved.plan, workspaceName: workspace.name, reason: saved.reason, expiresAt: saved.expiresAt?.toISOString() ?? null },
      request.ip,
      String(request.headers["user-agent"] ?? "").slice(0, 300),
    );
    return json(reply, saved, 200);
  });

  app.delete("/api/v1/admin/entitlements/:workspaceId", async (request, reply) => {
    const actor = await staffSession(request, reply, CAN_MANAGE_ENTITLEMENTS);
    if (!actor) return;
    const workspaceId = String((request.params as { workspaceId: string }).workspaceId);
    const existing = await prisma.entitlementOverride.findUnique({
      where: { workspaceId },
    });
    if (!existing)
      return fail(reply, 404, "OVERRIDE_NOT_FOUND", "No entitlement override exists for that workspace.");
    const revoked = await prisma.entitlementOverride.update({
      where: { workspaceId },
      data: { active: false },
    });
    await writeAdminAudit(
      actor,
      "entitlement.revoked",
      "Workspace",
      workspaceId,
      { plan: revoked.plan },
      request.ip,
      String(request.headers["user-agent"] ?? "").slice(0, 300),
    );
    return json(reply, { revoked: true, plan: revoked.plan });
  });

  app.get("/api/v1/admin/entitlements/:workspaceId/adjustments", async (request, reply) => {
    const actor = await staffSession(request, reply, CAN_MANAGE_ENTITLEMENTS);
    if (!actor) return;
    const workspaceId = String(
      (request.params as { workspaceId: string }).workspaceId,
    );
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });
    if (!workspace)
      return fail(
        reply,
        404,
        "WORKSPACE_NOT_FOUND",
        "That workspace was not found.",
      );
    const rows = await prisma.entitlementAdjustment.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      include: {
        staff: { select: { id: true, email: true, role: true } },
      },
    });
    return json(reply, rows);
  });

  app.post("/api/v1/admin/entitlements/:workspaceId/adjustments", async (request, reply) => {
    const actor = await staffSession(request, reply, CAN_MANAGE_ENTITLEMENTS);
    if (!actor) return;
    const workspaceId = String(
      (request.params as { workspaceId: string }).workspaceId,
    );
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true, name: true },
    });
    if (!workspace)
      return fail(
        reply,
        404,
        "WORKSPACE_NOT_FOUND",
        "That workspace was not found.",
      );
    const body = request.body as {
      kind?: string;
      feature?: string;
      amount?: number;
      expiresAt?: string | null;
      reason?: string;
    };
    const kind = body.kind === "ACCESS" ? "ACCESS" : "ALLOWANCE";
    const feature = String(body.feature ?? "ai_credits").trim();
    if (!feature) return fail(reply, 400, "FEATURE_REQUIRED", "feature is required.");
    if (body.amount !== undefined && (!Number.isInteger(body.amount) || body.amount < 1))
      return fail(reply, 400, "INVALID_AMOUNT", "amount must be a positive integer.");
    if (body.expiresAt) {
      const parsed = new Date(body.expiresAt);
      if (Number.isNaN(parsed.getTime()))
        return fail(reply, 400, "INVALID_EXPIRY", "expiresAt must be an ISO date.");
    }
    // Granular additive allowance/access. KEEP the additive contract from the
    // entitlements service: these rows inflate effective limits/tiers, they
    // never overwrite the base plan, an admin override, or Paddle truth.
    const saved = await prisma.entitlementAdjustment.create({
      data: {
        workspaceId,
        kind,
        feature,
        amount: kind === "ALLOWANCE" ? body.amount ?? 1 : null,
        active: true,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        reason: body.reason?.slice(0, 500) || null,
        grantedBy: actor.id,
      },
    });
    await writeAdminAudit(
      actor,
      "entitlement.adjustment.granted",
      "Workspace",
      workspaceId,
      {
        kind: saved.kind,
        feature: saved.feature,
        amount: saved.amount,
        workspaceName: workspace.name,
        reason: saved.reason,
        expiresAt: saved.expiresAt?.toISOString() ?? null,
      },
      request.ip,
      String(request.headers["user-agent"] ?? "").slice(0, 300),
    );
    return json(reply, saved, 201);
  });

  app.delete("/api/v1/admin/entitlements/:workspaceId/adjustments/:adjustmentId", async (request, reply) => {
    const actor = await staffSession(request, reply, CAN_MANAGE_ENTITLEMENTS);
    if (!actor) return;
    const { workspaceId, adjustmentId } = request.params as {
      workspaceId: string;
      adjustmentId: string;
    };
    const existing = await prisma.entitlementAdjustment.findUnique({
      where: { id: adjustmentId },
    });
    if (!existing || existing.workspaceId !== workspaceId)
      return fail(reply, 404, "ADJUSTMENT_NOT_FOUND", "That adjustment was not found.");
    const revoked = await prisma.entitlementAdjustment.update({
      where: { id: adjustmentId },
      data: { active: false },
    });
    await writeAdminAudit(
      actor,
      "entitlement.adjustment.revoked",
      "Workspace",
      workspaceId,
      { kind: revoked.kind, feature: revoked.feature, amount: revoked.amount },
      request.ip,
      String(request.headers["user-agent"] ?? "").slice(0, 300),
    );
    return json(reply, { revoked: true, active: revoked.active });
  });

  app.get("/api/v1/admin/audit-logs", async (request, reply) => {
    const actor = await staffSession(request, reply, CAN_VIEW_AUDIT);
    if (!actor) return;
    const query = request.query as { action?: string; staffId?: string; limit?: string; offset?: string };
    const limit = Math.min(Number(query.limit ?? 100), 500);
    const offset = Math.max(Number(query.offset ?? 0), 0);
    const logs = await prisma.auditLog.findMany({
      where: {
        ...(query.action ? { action: query.action } : {}),
        ...(query.staffId ? { staffId: query.staffId } : {}),
        staffId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      include: { staff: { select: { id: true, email: true, role: true } } },
    });
    return json(reply, logs);
  });
}