import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import crypto from "node:crypto";
import {
  createContentSchema,
  createWorkspaceSchema,
  emailVerificationSchema,
  funnelEventSchema,
  loginSchema,
  onboardingStateSchema,
  passwordResetRequestSchema,
  passwordResetSchema,
  signupSchema,
  updateCampaignSchema,
  updateContentSchema,
  updateProfileSchema,
  updateWorkspaceSchema,
  urlAnalyzeSchema,
} from "@contentra/validation";
import { can } from "@contentra/core";
import { prisma } from "../db.js";
import {
  clearSessionCookie,
  encryptSecret,
  generateApiKey,
  hashToken,
  parseCookies,
  sessionCookie,
} from "../security.js";
import {
  releaseForClient,
  type ReleasePlatform,
} from "../services/releases.js";
import { createNotification } from "../services/notifications.js";
import {
  createPasswordReset,
  createSession,
  destroySession,
  getSession,
  resetPassword,
  signup,
  verifyEmail,
  verifyPassword,
} from "../services/auth.js";
import { aiActionSchema } from "@contentra/validation";
import { GeminiProvider } from "@contentra/ai";
import { requiresConfirmation } from "@contentra/ai";
import {
  createDefaultWorkspace,
  createWorkspace,
  getMembership,
} from "../services/workspaces.js";
import {
  createContent,
  listContent,
  updateContent,
} from "../services/content.js";
import { getHome } from "../services/home.js";
import { configuredEmailSender } from "../services/email.js";
import {
  createPaddleCheckout,
  PaddleConfigError,
  priceIdForPlan,
  type PaddlePlan,
} from "../services/paddle.js";
import { assertFeature, assertLimit, effectivePlan, EntitlementError, getPlanScope } from "../services/entitlements.js";
import { fetchPublicPage, validatePublicHttpUrl } from "../services/website.js";
import {
  claimReferral,
  completeReferralAndReward,
  getOrCreateReferralCode,
  isInvalidError,
  listReferralStats,
} from "../services/referrals.js";
import {
  completeSocialConnection,
  disconnectSocialConnection,
  SocialLifecycleError,
  startSocialConnection,
  syncSocialAccount,
} from "../services/social.js";
import { ProviderError } from "@contentra/integrations";
import { Prisma } from "@prisma/client";
import type { ContentStatus, WorkspaceRole } from "@contentra/types";

type AnalyticsMetric = {
  capturedAt: Date;
  views: number | null;
  reach: number | null;
  engagementRate: number | null;
  socialAccount: { platform: string };
  socialPost: { content: { id: string; title: string | null; platform: string } | null } | null;
};

type SavedInspirationItem = {
  contentId: string;
  content: { title: string | null; description: string | null; platform: string };
};

function isInputJsonValue(value: unknown): value is Prisma.InputJsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isInputJsonValue);
  if (typeof value !== "object") return false;
  return Object.values(value).every(
    (entry) => entry === null || isInputJsonValue(entry),
  );
}

// Public, no-auth landing analyzer. Returns only derived, non-persisted page
// metrics for the logged-out analyzer widget — never raw fetched content.
function analyzePublicHtml(url: string, html: string) {
  const clean = (value: string) => value.replace(/\s+/g, " ").trim();
  const title = clean(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  const description = clean(
    /<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html)?.[1] ??
      /<meta[^>]+content=["']([^"']*)["'][^>]*name=["']description["']/i.exec(html)?.[1] ??
      "",
  );
  const count = (pattern: RegExp) => (html.match(pattern) ?? []).length;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const wordCount = text ? text.split(" ").length : 0;
  return {
    url,
    title: title || null,
    description: description || null,
    wordCount,
    readMinutes: Math.max(1, Math.round(wordCount / 200)),
    headings: { h1: count(/<h1[\s>]/gi), h2: count(/<h2[\s>]/gi) },
    images: count(/<img[\s>]/gi),
    links: count(/<a[\s>]/gi),
    hasOpenGraph: /<meta[^>]+property=["']og:/i.test(html),
  };
}

const json = (reply: FastifyReply, data: unknown, status = 200) =>
  reply.status(status).send({ data, requestId: reply.request.id });
const fail = (
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) =>
  reply
    .status(status)
    .send({
      error: { code, message, ...(details ? { details } : {}) },
      requestId: reply.request.id,
    });

async function auth(request: FastifyRequest, reply: FastifyReply) {
  const session = await getSession(
    parseCookies(request.headers.cookie).contentra_session,
  );
  if (!session) {
    reply
      .status(401)
      .send({
        error: { code: "UNAUTHENTICATED", message: "Sign in required." },
        requestId: request.id,
      });
    return null;
  }
  return session;
}

async function workspaceAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  permission: `${string}.${string}`,
) {
  const session = await auth(request, reply);
  if (!session) return null;
  const workspaceId = String(
    (request.params as { workspaceId?: string }).workspaceId ??
      request.headers["x-workspace-id"] ??
      "",
  );
  if (!workspaceId) {
    reply
      .status(400)
      .send({
        error: {
          code: "WORKSPACE_REQUIRED",
          message: "Workspace context is required.",
        },
        requestId: request.id,
      });
    return null;
  }
  const membership = await getMembership(session.user.id, workspaceId);
  if (!membership || !can(membership.role, permission)) {
    reply
      .status(403)
      .send({
        error: {
          code: "FORBIDDEN",
          message: "You do not have permission for this action.",
        },
        requestId: request.id,
      });
    return null;
  }
  return { session, membership, workspaceId };
}

export async function registerRoutes(app: FastifyInstance) {
  app.post("/api/v1/auth/signup", async (request, reply) => {
    const input = signupSchema.parse(request.body);
    try {
      const result = await signup(input);
      const sender = configuredEmailSender();
      if (sender) {
        const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
        await sender.send({
          to: result.user.email,
          subject: "Verify your Contentra email",
          text: `Verify your email: ${origin}/verify-email?token=${encodeURIComponent(result.verificationToken)}`,
        });
      }
      const session = await createSession(result.user.id);
      reply.header("set-cookie", sessionCookie(session, 30 * 86400));
      // Every account is provisioned with a default workspace server-side so
      // clients never have to create one themselves.
      const workspace = await createDefaultWorkspace(
        result.user.id,
        result.user.name,
      );
      // A `ref` param at signup claims the PENDING referral so the reward can
      // be granted later, exactly once, when onboarding completes.
      if (input.ref) {
        try {
          await claimReferral({
            workspaceId: workspace.id,
            code: input.ref,
            referredUserId: result.user.id,
            requesterUserId: result.user.id,
          });
          await prisma.funnelEvent.create({
            data: {
              event: "referral.claimed_at_signup",
              clientId: null,
              ref: input.ref,
              meta: { workspaceId: workspace.id },
            },
          });
        } catch (error) {
          // A bad/self/duplicate code must never block account creation.
          if (!isInvalidError(error)) throw error;
        }
      }
      // Verification delivery is provider-dependent. Never expose a token through this API.
      return json(
        reply,
        {
          user: {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            emailVerified: false,
          },
          workspace: {
            id: workspace.id,
            name: workspace.name,
            type: workspace.type,
          },
          verificationDelivery: "pending",
        },
        201,
      );
    } catch (error) {
      if (error instanceof Error && error.message === "ACCOUNT_EXISTS")
        return fail(
          reply,
          409,
          "ACCOUNT_EXISTS",
          "Unable to create this account.",
        );
      throw error;
    }
  });

 app.post("/api/v1/auth/login", async (request, reply) => {
  const input = loginSchema.parse(request.body);
  const user = await verifyPassword(input.email, input.password);

  if (!user)
    return fail(
      reply,
      401,
      "INVALID_CREDENTIALS",
      "Email or password is incorrect.",
    );

  const session = await createSession(user.id);
  reply.header("set-cookie", sessionCookie(session, 30 * 86400));

  let memberships = await prisma.workspaceMember.findMany({
    where: { userId: user.id },
    include: { workspace: true },
  });

  if (memberships.length === 0) {
    const workspace = await createDefaultWorkspace(user.id, user.name);

    memberships = [
      {
        workspace,
      },
    ] as typeof memberships;
  }

  return json(reply, {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
    },
    workspace: {
      id: memberships[0].workspace.id,
      name: memberships[0].workspace.name,
      type: memberships[0].workspace.type,
    },
    workspaces: memberships.map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      type: membership.workspace.type,
    })),
  });
});

  app.post("/api/v1/auth/logout", async (request, reply) => {
    await destroySession(
      parseCookies(request.headers.cookie).contentra_session,
    );
    reply.header("set-cookie", clearSessionCookie());
    return json(reply, { ok: true });
  });
  app.get("/api/v1/auth/me", async (request, reply) => {
    const session = await auth(request, reply);
    if (!session) return;
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: session.user.id },
      include: {
        workspace: {
          include: {
            subscription: { include: { plan: true } },
            aiCreditBalance: true,
          },
        },
      },
    });
    return json(reply, {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        emailVerified: Boolean(session.user.emailVerifiedAt),
        preferences: session.user.preferences,
      },
      workspaces: memberships,
    });
  });
  app.post("/api/v1/auth/verify-email", async (request, reply) => {
    const { token } = emailVerificationSchema.parse(request.body);
    try {
      await verifyEmail(token);
      return json(reply, { verified: true });
    } catch {
      return fail(
        reply,
        400,
        "INVALID_VERIFICATION_TOKEN",
        "That verification link is invalid or expired.",
      );
    }
  });
  app.post("/api/v1/auth/forgot-password", async (request, reply) => {
    const { email } = passwordResetRequestSchema.parse(request.body);
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (user) {
      const token = await createPasswordReset(user.id);
      const sender = configuredEmailSender();
      if (sender) {
        const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
        await sender.send({
          to: user.email,
          subject: "Reset your Contentra password",
          text: `Reset your password: ${origin}/reset-password?token=${encodeURIComponent(token)}`,
        });
      }
    }
    return json(reply, { accepted: true });
  });
  app.post("/api/v1/auth/reset-password", async (request, reply) => {
    const input = passwordResetSchema.parse(request.body);
    try {
      await resetPassword(input.token, input.password);
      return json(reply, { reset: true });
    } catch {
      return fail(
        reply,
        400,
        "INVALID_RESET_TOKEN",
        "That reset link is invalid or expired.",
      );
    }
  });

  app.get("/api/v1/me", async (request, reply) => {
    const session = await auth(request, reply);
    if (!session) return;
    return json(reply, {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      preferences: session.user.preferences,
    });
  });
  app.patch("/api/v1/me", async (request, reply) => {
    const session = await auth(request, reply);
    if (!session) return;
    const input = updateProfileSchema.parse(request.body);
    const preferences = input.preferences;
    if (preferences !== undefined && !isInputJsonValue(preferences)) {
      return fail(reply, 400, "INVALID_PREFERENCES", "Preferences must be valid JSON.");
    }
    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { ...input, preferences },
    });
    return json(reply, user);
  });
  app.delete("/api/v1/me", async (request, reply) => {
    const session = await auth(request, reply);
    if (!session) return;
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.workspace.deleteMany({ where: { ownerId: session.user.id } });
      await tx.user.delete({ where: { id: session.user.id } });
    });
    reply.header("set-cookie", clearSessionCookie());
    return json(reply, { deleted: true });
  });

  app.post("/api/v1/workspaces", async (request, reply) => {
    const session = await auth(request, reply);
    if (!session) return;
    const input = createWorkspaceSchema.parse(request.body);
    const workspace = await createWorkspace(session.user.id, input);
    return json(reply, workspace, 201);
  });
  app.get("/api/v1/workspaces", async (request, reply) => {
    const session = await auth(request, reply);
    if (!session) return;
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: session.user.id },
      include: { workspace: true },
      orderBy: { createdAt: "asc" },
    });
    return json(reply, memberships);
  });
  app.get("/api/v1/workspaces/:workspaceId", async (request, reply) => {
    const ctx = await workspaceAuth(request, reply, "workspace.read");
    if (!ctx) return;
    return json(reply, ctx.membership.workspace);
  });
  app.patch("/api/v1/workspaces/:workspaceId", async (request, reply) => {
    const ctx = await workspaceAuth(request, reply, "workspace.update");
    if (!ctx) return;
    const input = updateWorkspaceSchema.parse(request.body);
    const workspace = await prisma.workspace.update({
      where: { id: ctx.workspaceId },
      data: {
        ...(input.name ? { name: input.name.trim() } : {}),
        ...(input.type ? { type: input.type } : {}),
      },
    });
    return json(reply, workspace);
  });
  app.delete("/api/v1/workspaces/:workspaceId", async (request, reply) => {
    const ctx = await workspaceAuth(request, reply, "workspace.delete");
    if (!ctx) return;
    if (ctx.membership.role !== "OWNER")
      return fail(
        reply,
        403,
        "OWNER_REQUIRED",
        "Only the workspace owner can delete this workspace.",
      );
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: ctx.workspaceId },
      select: { name: true },
    });
    const confirmation = (request.body as { confirmation?: string } | undefined)
      ?.confirmation;
    if (confirmation !== workspace.name)
      return fail(
        reply,
        400,
        "CONFIRMATION_REQUIRED",
        "Type the exact workspace name to delete it.",
      );
    await prisma.auditLog.create({
      data: {
        workspaceId: ctx.workspaceId,
        userId: ctx.session.user.id,
        action: "workspace.deletion.requested",
        entityType: "workspace",
        entityId: ctx.workspaceId,
      },
    });
    await prisma.workspace.delete({ where: { id: ctx.workspaceId } });
    return json(reply, { deleted: true });
  });
  app.get(
    "/api/v1/workspaces/:workspaceId/onboarding",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "workspace.read");
      if (!ctx) return;
      const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: ctx.workspaceId },
        select: { onboardingState: true, onboardedAt: true },
      });
      return json(reply, {
        state: workspace.onboardingState,
        completedAt: workspace.onboardedAt,
      });
    },
  );
  app.put(
    "/api/v1/workspaces/:workspaceId/onboarding",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "workspace.update");
      if (!ctx) return;
      const input = onboardingStateSchema.parse(request.body);
      const workspace = await prisma.workspace.update({
        where: { id: ctx.workspaceId },
        data: {
          ...(input.workspaceType ? { type: input.workspaceType } : {}),
          onboardingState: input as never,
          onboardedAt: input.completed ? new Date() : undefined,
        },
      });
      await prisma.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.session.user.id,
          action: input.completed ? "onboarding.completed" : "onboarding.saved",
          entityType: "workspace",
          entityId: ctx.workspaceId,
        },
      });
      // Granting the referral reward is idempotent (CAS on PENDING) and also
      // acts as the funnel "referral.completed" event for the referring side.
      if (input.completed) {
        await completeReferralAndReward({
          workspaceId: ctx.workspaceId,
          referredUserId: ctx.session.user.id,
        });
      }
      return json(reply, {
        state: workspace.onboardingState,
        completedAt: workspace.onboardedAt,
      });
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/referral",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "workspace.read");
      if (!ctx) return;
      const code = await getOrCreateReferralCode(ctx.workspaceId);
      const stats = await listReferralStats(ctx.workspaceId);
      return json(reply, { code: code.code, createdAt: code.createdAt, stats });
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/invites",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "members.invite");
      if (!ctx) return;
      try {
        // Team seats are a paid entitlement: Free includes 1 seat (the owner).
        const memberCount = await prisma.workspaceMember.count({
          where: { workspaceId: ctx.workspaceId },
        });
        await assertLimit(ctx.workspaceId, "team_members", memberCount + 1);
      } catch (error) {
        if (error instanceof EntitlementError)
          return fail(reply, 403, error.code, error.message);
        throw error;
      }
      const body = request.body as {
        email?: string;
      role?: WorkspaceRole;
      };
      const email = body.email?.trim().toLowerCase();
      if (!email)
        return fail(
          reply,
          400,
          "EMAIL_REQUIRED",
          "An email address is required.",
        );
      if (body.role === "OWNER")
        return fail(
          reply,
          400,
          "INVALID_ROLE",
          "Owner cannot be assigned by invitation.",
        );
      const token = crypto.randomBytes(32).toString("base64url");
      const invite = await prisma.workspaceInvite.create({
        data: {
          workspaceId: ctx.workspaceId,
          email,
          role: body.role ?? "MEMBER",
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 7 * 86400000),
        },
      });
      const sender = configuredEmailSender();
      if (sender) {
        const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
        await sender.send({
          to: email,
          subject: "Join a Contentra workspace",
          text: `Join the workspace: ${origin}/onboarding?invite=${encodeURIComponent(token)}`,
        });
      }
      return json(
        reply,
        {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          expiresAt: invite.expiresAt,
          delivery: sender ? "sent" : "pending",
        },
        201,
      );
    },
  );
  app.post("/api/v1/workspaces/invites/accept", async (request, reply) => {
    const session = await auth(request, reply);
    if (!session) return;
    const body = request.body as { token?: string };
    if (!body.token)
      return fail(
        reply,
        400,
        "TOKEN_REQUIRED",
        "Invitation token is required.",
      );
    const invite = await prisma.workspaceInvite.findUnique({
      where: { tokenHash: hashToken(body.token) },
    });
    if (
      !invite ||
      invite.acceptedAt ||
      invite.expiresAt <= new Date() ||
      invite.email !== session.user.email.toLowerCase()
    )
      return fail(
        reply,
        400,
        "INVALID_INVITE",
        "That invitation is invalid, expired, or belongs to another account.",
      );
  const member = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: invite.workspaceId,
            userId: session.user.id,
          },
        },
      });
      const created =
        existing ??
        (await tx.workspaceMember.create({
          data: {
            workspaceId: invite.workspaceId,
            userId: session.user.id,
            role: invite.role,
          },
        }));
      await tx.workspaceInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      return created;
    });
    return json(reply, member);
  });
  app.patch(
    "/api/v1/workspaces/:workspaceId/members/:memberId",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "members.remove");
      if (!ctx) return;
      if (ctx.membership.role !== "OWNER" && ctx.membership.role !== "ADMIN")
        return fail(
          reply,
          403,
          "FORBIDDEN",
          "Only workspace admins can change roles.",
        );
      const memberId = String(
        (request.params as { memberId: string }).memberId,
      );
  const role = (request.body as { role?: WorkspaceRole })
        .role;
      if (!role || role === "OWNER")
        return fail(
          reply,
          400,
          "INVALID_ROLE",
          "Role must be ADMIN, MEMBER, or VIEWER.",
        );
      const target = await prisma.workspaceMember.findFirst({
        where: { id: memberId, workspaceId: ctx.workspaceId },
      });
      if (!target || target.role === "OWNER")
        return fail(reply, 404, "MEMBER_NOT_FOUND", "Member was not found.");
      if (target.role === "ADMIN" && ctx.membership.role !== "OWNER")
        return fail(
          reply,
          403,
          "FORBIDDEN",
          "Only the owner can change an admin role.",
        );
      return json(
        reply,
        await prisma.workspaceMember.update({
          where: { id: memberId },
          data: { role },
        }),
      );
    },
  );
  app.delete(
    "/api/v1/workspaces/:workspaceId/members/:memberId",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "members.remove");
      if (!ctx) return;
      const memberId = String(
        (request.params as { memberId: string }).memberId,
      );
      const target = await prisma.workspaceMember.findFirst({
        where: { id: memberId, workspaceId: ctx.workspaceId },
      });
      if (!target)
        return fail(reply, 404, "MEMBER_NOT_FOUND", "Member was not found.");
      if (target.role === "OWNER")
        return fail(
          reply,
          400,
          "OWNER_PROTECTED",
          "The workspace owner cannot be removed.",
        );
      await prisma.workspaceMember.delete({ where: { id: target.id } });
      return json(reply, { removed: true });
    },
  );

  app.get("/api/v1/workspaces/:workspaceId/members", async (request, reply) => {
    const ctx = await workspaceAuth(request, reply, "members.read");
    if (!ctx) return;
    return json(
      reply,
      await prisma.workspaceMember.findMany({
        where: { workspaceId: ctx.workspaceId },
        include: {
          user: {
            select: { id: true, name: true, email: true, avatarUrl: true },
          },
        },
      }),
    );
  });

  app.get("/api/v1/workspaces/:workspaceId/home", async (request, reply) => {
    const ctx = await workspaceAuth(request, reply, "workspace.read");
    if (!ctx) return;
    return json(reply, await getHome(ctx.workspaceId));
  });
  app.patch(
    "/api/v1/workspaces/:workspaceId/opportunities/:id",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "analytics.read");
      if (!ctx) return;
      const id = String((request.params as { id: string }).id);
      const status = (
        request.body as {
          status?: "NEW" | "SAVED" | "SKIPPED" | "ACTED_ON" | "EXPIRED";
        }
      ).status;
      if (!status)
        return fail(
          reply,
          400,
          "STATUS_REQUIRED",
          "An opportunity status is required.",
        );
      const result = await prisma.opportunity.updateMany({
        where: { id, workspaceId: ctx.workspaceId },
        data: { status },
      });
      if (!result.count)
        return fail(
          reply,
          404,
          "OPPORTUNITY_NOT_FOUND",
          "Opportunity was not found.",
        );
      return json(reply, { status });
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/settings",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "workspace.read");
      if (!ctx) return;
      const workspace = await prisma.workspace.findUniqueOrThrow({
        where: { id: ctx.workspaceId },
        select: { settings: true, brandContext: true },
      });
      return json(reply, workspace);
    },
  );
  app.patch(
    "/api/v1/workspaces/:workspaceId/settings",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "workspace.update");
      if (!ctx) return;
      const body = request.body as {
        settings?: Record<string, unknown>;
        brandContext?: Record<string, unknown>;
      };
      const workspace = await prisma.workspace.update({
        where: { id: ctx.workspaceId },
        data: {
          ...(body.settings ? { settings: body.settings as never } : {}),
          ...(body.brandContext
            ? { brandContext: body.brandContext as never }
            : {}),
        },
        select: { settings: true, brandContext: true },
      });
      return json(reply, workspace);
    },
  );
  app.get("/api/v1/workspaces/:workspaceId/storage", async (request, reply) => {
    const ctx = await workspaceAuth(request, reply, "content.read");
    if (!ctx) return;
    const [assets, total] = await Promise.all([
      prisma.contentAsset.count({ where: { workspaceId: ctx.workspaceId } }),
      prisma.contentAsset.aggregate({
        where: { workspaceId: ctx.workspaceId },
        _sum: { sizeBytes: true },
      }),
    ]);
    return json(reply, {
      assets,
      bytesUsed: String(total._sum.sizeBytes ?? 0),
    });
  });
  app.get(
    "/api/v1/workspaces/:workspaceId/notification-preferences",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "workspace.read");
      if (!ctx) return;
      return json(
        reply,
        await prisma.notificationPreference.findMany({
          where: { workspaceId: ctx.workspaceId, userId: ctx.session.user.id },
        }),
      );
    },
  );
  app.put(
    "/api/v1/workspaces/:workspaceId/notification-preferences",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "workspace.read");
      if (!ctx) return;
      const body = request.body as {
        channel?: string;
        eventType?: string;
        enabled?: boolean;
      };
      if (
        !body.channel?.trim() ||
        !body.eventType?.trim() ||
        typeof body.enabled !== "boolean"
      )
        return fail(
          reply,
          400,
          "INVALID_NOTIFICATION_PREFERENCE",
          "Channel, event type, and enabled state are required.",
        );
      const preference = await prisma.notificationPreference.upsert({
        where: {
          workspaceId_userId_channel_eventType: {
            workspaceId: ctx.workspaceId,
            userId: ctx.session.user.id,
            channel: body.channel,
            eventType: body.eventType,
          },
        },
        update: { enabled: body.enabled },
        create: {
          workspaceId: ctx.workspaceId,
          userId: ctx.session.user.id,
          channel: body.channel,
          eventType: body.eventType,
          enabled: body.enabled,
        },
      });
      return json(reply, preference);
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/analytics",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "analytics.read");
      if (!ctx) return;
      const [metrics, accounts, audience, recommendations, nba] =
        await Promise.all([
          prisma.socialMetric.findMany({
            where: { workspaceId: ctx.workspaceId },
            orderBy: { capturedAt: "asc" },
            take: 1000,
            include: {
              socialAccount: { select: { platform: true } },
              socialPost: {
                include: {
                  content: {
                    select: { id: true, title: true, platform: true },
                  },
                },
              },
            },
          }),
          prisma.socialAccount.findMany({
            where: { workspaceId: ctx.workspaceId },
            select: { id: true, platform: true, username: true },
          }),
          prisma.socialAudienceSnapshot.findMany({
            where: { workspaceId: ctx.workspaceId },
            orderBy: { capturedAt: "desc" },
            take: 20,
          }),
          prisma.recommendation.findMany({
            where: { workspaceId: ctx.workspaceId, status: "NEW" },
            orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
            take: 10,
          }),
          prisma.nextBestAction.findFirst({
            where: { workspaceId: ctx.workspaceId, status: "NEW" },
            orderBy: { createdAt: "desc" },
          }),
        ]);
      const platform = Object.values(
        metrics.reduce((result: Record<string, { platform: string; views: number; reach: number; engagement: number; count: number }>, metric: AnalyticsMetric) => {
          const key = metric.socialAccount.platform;
          const row = (result[key] ??= {
            platform: key,
            views: 0,
            reach: 0,
            engagement: 0,
            count: 0,
          });
          row.views += metric.views ?? 0;
          row.reach += metric.reach ?? 0;
          row.engagement += metric.engagementRate ?? 0;
          row.count += 1;
          return result;
        }, {}),
      );
       const timeline = metrics.map((metric: AnalyticsMetric) => ({
        at: metric.capturedAt,
        platform: metric.socialAccount.platform,
        views: metric.views,
        reach: metric.reach,
        engagementRate: metric.engagementRate,
      }));
      const content = metrics
         .filter((metric: AnalyticsMetric) => metric.socialPost?.content)
         .map((metric: AnalyticsMetric) => ({
          contentId: metric.socialPost?.content?.id,
          title: metric.socialPost?.content?.title,
          platform: metric.socialPost?.content?.platform,
          views: metric.views,
          reach: metric.reach,
          engagementRate: metric.engagementRate,
          capturedAt: metric.capturedAt,
        }));
      return json(reply, {
        accounts,
        platform,
        timeline,
        content,
        audience,
        recommendations,
        nba,
      });
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/inspiration",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.read");
      if (!ctx) return;
      const query = String((request.query as { q?: string }).q ?? "").trim();
      const platform = String(
        (request.query as { platform?: string }).platform ?? "",
      ).trim();
      const trends = await prisma.trend.findMany({
        where: {
          OR: [{ workspaceId: ctx.workspaceId }, { workspaceId: null }],
          ...(query ? { topic: { contains: query, mode: "insensitive" } } : {}),
          ...(platform ? { platform } : {}),
        },
        orderBy: { detectedAt: "desc" },
        take: 100,
      });
      return json(reply, trends);
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/inspiration/saved",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.read");
      if (!ctx) return;
      const collection = await prisma.contentCollection.findUnique({
        where: {
          workspaceId_name: {
            workspaceId: ctx.workspaceId,
            name: "Inspiration",
          },
        },
        include: {
          items: { include: { content: true }, orderBy: { position: "asc" } },
        },
      });
      return json(
        reply,
        collection?.items.map((item: SavedInspirationItem) => ({
          contentId: item.contentId,
          title: item.content.title,
          description: item.content.description,
          platform: item.content.platform,
        })) ?? [],
      );
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/inspiration/:trendId/save",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.create");
      if (!ctx) return;
      const trendId = String((request.params as { trendId: string }).trendId);
      const trend = await prisma.trend.findFirst({
        where: {
          id: trendId,
          OR: [{ workspaceId: ctx.workspaceId }, { workspaceId: null }],
        },
      });
      if (!trend)
        return fail(
          reply,
          404,
          "INSPIRATION_NOT_FOUND",
          "Inspiration item was not found.",
        );
      const collection = await prisma.contentCollection.upsert({
        where: {
          workspaceId_name: {
            workspaceId: ctx.workspaceId,
            name: "Inspiration",
          },
        },
        update: {},
        create: {
          workspaceId: ctx.workspaceId,
          name: "Inspiration",
          description: "Saved inspiration for this workspace.",
        },
      });
      const marker = `inspiration:${trend.id}`;
      const existing = await prisma.content.findFirst({
        where: { workspaceId: ctx.workspaceId, description: marker },
      });
      const content =
        existing ??
        (await createContent(ctx.workspaceId, ctx.session.user.id, {
          title: trend.topic,
          description: marker,
          format: "inspiration",
          platform: trend.platform ?? "general",
          caption: trend.examples ? JSON.stringify(trend.examples) : undefined,
        }));
      await prisma.contentCollectionItem.upsert({
        where: {
          collectionId_contentId: {
            collectionId: collection.id,
            contentId: content.id,
          },
        },
        update: {},
        create: {
          collectionId: collection.id,
          contentId: content.id,
          position: await prisma.contentCollectionItem.count({
            where: { collectionId: collection.id },
          }),
        },
      });
      return json(
        reply,
        { contentId: content.id, collectionId: collection.id },
        201,
      );
    },
  );
  app.delete(
    "/api/v1/workspaces/:workspaceId/inspiration/saved/:contentId",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.update");
      if (!ctx) return;
      const contentId = String(
        (request.params as { contentId: string }).contentId,
      );
      const collection = await prisma.contentCollection.findUnique({
        where: {
          workspaceId_name: {
            workspaceId: ctx.workspaceId,
            name: "Inspiration",
          },
        },
      });
      if (!collection)
        return fail(
          reply,
          404,
          "INSPIRATION_NOT_SAVED",
          "Inspiration collection was not found.",
        );
      const result = await prisma.contentCollectionItem.deleteMany({
        where: { collectionId: collection.id, contentId },
      });
      if (!result.count)
        return fail(
          reply,
          404,
          "INSPIRATION_NOT_SAVED",
          "Saved inspiration was not found.",
        );
      return json(reply, { removed: true });
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/content/:contentId",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.read");
      if (!ctx) return;
      const id = String((request.params as { contentId: string }).contentId);
      const content = await prisma.content.findFirst({
        where: { id, workspaceId: ctx.workspaceId },
        include: {
          versions: { orderBy: { version: "desc" } },
          assets: true,
          publishAttempts: { orderBy: { createdAt: "desc" } },
          calendarItems: true,
          campaign: true,
          socialPosts: { include: { metrics: true } },
        },
      });
      if (!content)
        return fail(reply, 404, "CONTENT_NOT_FOUND", "Content was not found.");
      return json(reply, content);
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/content/:contentId/versions/:versionId/restore",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.update");
      if (!ctx) return;
      const contentId = String(
          (request.params as { contentId: string }).contentId,
        ),
        versionId = String((request.params as { versionId: string }).versionId);
      const content = await prisma.content.findFirst({
        where: { id: contentId, workspaceId: ctx.workspaceId },
      });
      if (!content)
        return fail(reply, 404, "CONTENT_NOT_FOUND", "Content was not found.");
      const version = await prisma.contentVersion.findFirst({
        where: { id: versionId, contentId },
      });
      if (!version)
        return fail(
          reply,
          404,
          "VERSION_NOT_FOUND",
          "Content version was not found.",
        );
  const restored = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const updated = await tx.content.update({
          where: { id: contentId },
          data: {
            title: version.title,
            caption: version.caption,
            script: version.script,
          },
        });
        const latest = await tx.contentVersion.findFirst({
          where: { contentId },
          orderBy: { version: "desc" },
        });
        return tx.contentVersion.create({
          data: {
            contentId,
            version: (latest?.version ?? 0) + 1,
            title: version.title,
            caption: version.caption,
            script: version.script,
            metadata: { restoredFrom: version.id },
            createdById: ctx.session.user.id,
          },
        });
      });
      await prisma.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.session.user.id,
          action: "content.version.restored",
          entityType: "content",
          entityId: contentId,
          metadata: {
            fromVersion: version.version,
            toVersion: restored.version,
          },
        },
      });
      return json(reply, { content, version: restored });
    },
  );
  app.get("/api/v1/workspaces/:workspaceId/content", async (request, reply) => {
    const ctx = await workspaceAuth(request, reply, "content.read");
    if (!ctx) return;
    const status = (request.query as { status?: string }).status;
    if (
      status !== undefined &&
      !["IDEA", "DRAFT", "READY", "SCHEDULED", "PUBLISHED", "FAILED", "ARCHIVED"].includes(
        status,
      )
    )
      return fail(reply, 400, "INVALID_STATUS", "Unknown content status.");
    return json(
      reply,
      await listContent(ctx.workspaceId, status as ContentStatus | undefined),
    );
  });
  app.post(
    "/api/v1/workspaces/:workspaceId/content",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.create");
      if (!ctx) return;
      const input = createContentSchema.parse(request.body);
      return json(
        reply,
        await createContent(ctx.workspaceId, ctx.session.user.id, input),
        201,
      );
    },
  );
  app.patch(
    "/api/v1/workspaces/:workspaceId/content/:contentId",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.update");
      if (!ctx) return;
      const input = updateContentSchema.parse(request.body);
      try {
        const content = await updateContent(
          ctx.workspaceId,
          String((request.params as { contentId: string }).contentId),
          input,
        );
        return json(reply, content);
      } catch (error) {
        if (error instanceof Error && error.message === "CONTENT_NOT_FOUND")
          return fail(
            reply,
            404,
            "CONTENT_NOT_FOUND",
            "Content was not found.",
          );
        throw error;
      }
    },
  );
  app.delete(
    "/api/v1/workspaces/:workspaceId/content/:contentId",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.delete");
      if (!ctx) return;
      const contentId = String(
        (request.params as { contentId: string }).contentId,
      );
      const result = await prisma.content.deleteMany({
        where: { id: contentId, workspaceId: ctx.workspaceId },
      });
      if (!result.count)
        return fail(reply, 404, "CONTENT_NOT_FOUND", "Content was not found.");
      return json(reply, { deleted: true });
    },
  );

  app.get(
    "/api/v1/workspaces/:workspaceId/library/collections",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.read");
      if (!ctx) return;
      const query = String((request.query as { q?: string }).q ?? "").trim();
      return json(
        reply,
        await prisma.contentCollection.findMany({
          where: {
            workspaceId: ctx.workspaceId,
            ...(query
              ? { name: { contains: query, mode: "insensitive" } }
              : {}),
          },
          include: {
            items: {
              orderBy: { position: "asc" },
              include: {
                content: { include: { assets: true, campaign: true } },
              },
            },
            _count: { select: { items: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
      );
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/library/collections",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.create");
      if (!ctx) return;
      const body = request.body as { name?: string; description?: string };
      const name = body.name?.trim();
      if (!name || name.length > 120)
        return fail(
          reply,
          400,
          "INVALID_COLLECTION_NAME",
          "A collection name of up to 120 characters is required.",
        );
      try {
        const collection = await prisma.contentCollection.create({
          data: {
            workspaceId: ctx.workspaceId,
            name,
            description: body.description?.trim().slice(0, 2000),
          },
        });
        return json(reply, collection, 201);
      } catch (error) {
        if ((error as { code?: string }).code === "P2002")
          return fail(
            reply,
            409,
            "COLLECTION_EXISTS",
            "A collection with that name already exists.",
          );
        throw error;
      }
    },
  );
  app.patch(
    "/api/v1/workspaces/:workspaceId/library/collections/:collectionId",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.update");
      if (!ctx) return;
      const body = request.body as {
        name?: string;
        description?: string | null;
      };
      const collectionId = String(
        (request.params as { collectionId: string }).collectionId,
      );
      const result = await prisma.contentCollection.updateMany({
        where: { id: collectionId, workspaceId: ctx.workspaceId },
        data: {
          ...(body.name ? { name: body.name.trim().slice(0, 120) } : {}),
          ...(body.description !== undefined
            ? { description: body.description?.trim().slice(0, 2000) ?? null }
            : {}),
        },
      });
      if (!result.count)
        return fail(
          reply,
          404,
          "COLLECTION_NOT_FOUND",
          "Collection was not found.",
        );
      return json(reply, { updated: true });
    },
  );
  app.delete(
    "/api/v1/workspaces/:workspaceId/library/collections/:collectionId",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.delete");
      if (!ctx) return;
      const result = await prisma.contentCollection.deleteMany({
        where: {
          id: String((request.params as { collectionId: string }).collectionId),
          workspaceId: ctx.workspaceId,
        },
      });
      if (!result.count)
        return fail(
          reply,
          404,
          "COLLECTION_NOT_FOUND",
          "Collection was not found.",
        );
      return json(reply, { deleted: true });
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/library/collections/:collectionId/items",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.update");
      if (!ctx) return;
      const collectionId = String(
        (request.params as { collectionId: string }).collectionId,
      );
      const contentId = String(
        (request.body as { contentId?: string }).contentId ?? "",
      );
      const [collection, content] = await Promise.all([
        prisma.contentCollection.findFirst({
          where: { id: collectionId, workspaceId: ctx.workspaceId },
        }),
        prisma.content.findFirst({
          where: { id: contentId, workspaceId: ctx.workspaceId },
        }),
      ]);
      if (!collection || !content)
        return fail(
          reply,
          404,
          "LIBRARY_ITEM_NOT_FOUND",
          "Collection or content was not found.",
        );
      const item = await prisma.contentCollectionItem.upsert({
        where: { collectionId_contentId: { collectionId, contentId } },
        update: {},
        create: {
          collectionId,
          contentId,
          position: await prisma.contentCollectionItem.count({
            where: { collectionId },
          }),
        },
      });
      return json(reply, item, 201);
    },
  );
  app.delete(
    "/api/v1/workspaces/:workspaceId/library/collections/:collectionId/items/:contentId",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.update");
      if (!ctx) return;
      const collectionId = String(
        (request.params as { collectionId: string }).collectionId,
      );
      const contentId = String(
        (request.params as { contentId: string }).contentId,
      );
      const removed = await prisma.contentCollectionItem.deleteMany({
        where: {
          collectionId,
          contentId,
          collection: { workspaceId: ctx.workspaceId },
        },
      });
      if (!removed.count)
        return fail(
          reply,
          404,
          "LIBRARY_ITEM_NOT_FOUND",
          "Saved item was not found.",
        );
      return json(reply, { removed: true });
    },
  );

  app.post(
    "/api/v1/workspaces/:workspaceId/websites",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "brand.update");
      if (!ctx) return;
      const body = request.body as { url?: string };
      if (!body.url)
        return fail(reply, 400, "URL_REQUIRED", "A website URL is required.");
      let url: URL;
      try {
        url = await validatePublicHttpUrl(body.url);
      } catch (error) {
        const code =
          error instanceof Error && error.message === "PRIVATE_URL"
            ? "URL_NOT_ALLOWED"
            : "INVALID_URL";
        return fail(reply, 400, code, "The website URL is not allowed.");
      }
      const website = await prisma.website.upsert({
        where: {
          workspaceId_url: {
            workspaceId: ctx.workspaceId,
            url: url.toString(),
          },
        },
        update: {},
        create: {
          workspaceId: ctx.workspaceId,
          url: url.toString(),
          domain: url.hostname,
        },
      });
      const scan = await prisma.websiteScan.create({
        data: {
          workspaceId: ctx.workspaceId,
          websiteId: website.id,
          status: "PROCESSING",
          startedAt: new Date(),
          sourceUrls: [url.toString()],
        },
      });
      try {
        const page = await fetchPublicPage(url.toString());
        const text = page.text
          .replace(/<script[\s\S]*?<\/script>/gi, " ")
          .replace(/<style[\s\S]*?<\/style>/gi, " ")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        await prisma.websitePage.upsert({
          where: { websiteId_url: { websiteId: website.id, url: page.url } },
          update: {
            contentText: text.slice(0, 100000),
            lastScannedAt: new Date(),
          },
          create: {
            workspaceId: ctx.workspaceId,
            websiteId: website.id,
            url: page.url,
            contentText: text.slice(0, 100000),
            lastScannedAt: new Date(),
          },
        });
        await prisma.websiteScan.update({
          where: { id: scan.id },
          data: {
            status: "SUCCEEDED",
            completedAt: new Date(),
            pagesScanned: 1,
          },
        });
        void createNotification({
          workspaceId: ctx.workspaceId,
          userId: ctx.session.user.id,
          type: "website_scan_completed",
          title: "Website analysis complete",
          body: `Contentra analyzed ${url.hostname} (${1} page${1 === 1 ? "" : "s"}).`,
          push: true,
        }).catch(() => undefined);
        return json(reply, { website, scanId: scan.id, pagesScanned: 1 }, 201);
      } catch (error) {
        await prisma.websiteScan.update({
          where: { id: scan.id },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            errors: [error instanceof Error ? error.message : "SCAN_FAILED"],
          },
        });
        void createNotification({
          workspaceId: ctx.workspaceId,
          userId: ctx.session.user.id,
          type: "website_scan_failed",
          title: "Website analysis failed",
          body: `Contentra could not scan ${url.hostname}.`,
          push: true,
        }).catch(() => undefined);
        return fail(
          reply,
          422,
          "WEBSITE_SCAN_FAILED",
          "The website could not be scanned.",
        );
      }
    },
  );

  app.post(
    "/api/v1/workspaces/:workspaceId/billing/checkout",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "billing.manage");
      if (!ctx) return;
      const body = request.body as { plan?: PaddlePlan };
      if (
        body.plan !== "PRO" &&
        body.plan !== "BUSINESS" &&
        body.plan !== "AGENCY"
      )
        return fail(reply, 400, "INVALID_PLAN", "Choose a paid plan to upgrade to.");
      if (!priceIdForPlan(body.plan))
        return fail(
          reply,
          503,
          "BILLING_NOT_CONFIGURED",
          `Paddle is not configured for the ${body.plan} plan.`,
        );
      try {
        const origin = process.env.WEB_ORIGIN ?? "http://localhost:3000";
        return json(
          reply,
          await createPaddleCheckout(
            ctx.workspaceId,
            body.plan,
            `${origin}/app/settings/billing?checkout=success`,
            `${origin}/app/settings/billing?checkout=cancel`,
          ),
        );
      } catch (error) {
        if (error instanceof PaddleConfigError)
          return fail(reply, 503, "BILLING_NOT_CONFIGURED", error.message);
        throw error;
      }
    },
  );

  app.get(
    "/api/v1/workspaces/:workspaceId/webhooks",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "api.manage");
      if (!ctx) return;
      return json(
        reply,
        await prisma.webhook.findMany({
          where: { workspaceId: ctx.workspaceId },
          select: {
            id: true,
            endpointUrl: true,
            eventTypes: true,
            active: true,
            lastDeliveryAt: true,
            failureCount: true,
          },
        }),
      );
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/webhooks",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "api.manage");
      if (!ctx) return;
      const body = request.body as {
        endpointUrl?: string;
        eventTypes?: string[];
        secret?: string;
      };
      let endpoint: URL;
      try {
        endpoint = new URL(body.endpointUrl ?? "");
        if (!["https:", "http:"].includes(endpoint.protocol)) throw new Error();
      } catch {
        return fail(
          reply,
          400,
          "INVALID_URL",
          "A valid webhook URL is required.",
        );
      }
      const secret =
        body.secret?.trim() || crypto.randomBytes(32).toString("base64url");
      const encryptionKey = process.env.ENCRYPTION_KEY;
      if (!encryptionKey)
        return fail(
          reply,
          503,
          "ENCRYPTION_NOT_CONFIGURED",
          "Webhook encryption is not configured.",
        );
      const webhook = await prisma.webhook.create({
        data: {
          workspaceId: ctx.workspaceId,
          endpointUrl: endpoint.toString(),
          eventTypes: body.eventTypes ?? [],
          secretEncrypted: encryptSecret(secret, encryptionKey),
        },
      });
      return json(
        reply,
        {
          id: webhook.id,
          endpointUrl: webhook.endpointUrl,
          eventTypes: webhook.eventTypes,
          secret,
        },
        201,
      );
    },
  );
  app.delete(
    "/api/v1/workspaces/:workspaceId/webhooks/:id",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "api.manage");
      if (!ctx) return;
      const id = String((request.params as { id: string }).id);
      await prisma.webhook.updateMany({
        where: { id, workspaceId: ctx.workspaceId },
        data: { active: false },
      });
      return json(reply, { disabled: true });
    },
  );

  app.get("/api/v1/workspaces/:workspaceId/billing", async (request, reply) => {
    const ctx = await workspaceAuth(request, reply, "billing.read");
    if (!ctx) return;
    const [subscription, scope] = await Promise.all([
      prisma.subscription.findUnique({
        where: { workspaceId: ctx.workspaceId },
        include: { plan: { include: { entitlements: true } } },
      }),
      getPlanScope(ctx.workspaceId),
    ]);
    return json(reply, {
      subscription,
      effectivePlanCode: effectivePlan(scope),
      override: scope.override,
      paddleConfigured: {
        checkout: Boolean(
          process.env.PADDLE_API_KEY &&
            priceIdForPlan("PRO") &&
            priceIdForPlan("BUSINESS") &&
            priceIdForPlan("AGENCY"),
        ),
        webhooks: Boolean(process.env.PADDLE_WEBHOOK_SECRET),
      },
    });
  });
  app.get(
    "/api/v1/workspaces/:workspaceId/ai-credits",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "workspace.read");
      if (!ctx) return;
      const balance = await prisma.aICreditBalance.findUnique({
        where: { workspaceId: ctx.workspaceId },
      });
      const transactions = balance
        ? await prisma.aICreditTransaction.findMany({
            where: { balanceId: balance.id },
            orderBy: { createdAt: "desc" },
            take: 100,
          })
        : [];
      return json(reply, { balance: balance?.balance ?? null, transactions });
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/brand-intelligence",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "brand.read");
      if (!ctx) return;
      const [profile, intelligence, audience, voice, dna] = await Promise.all([
        prisma.brandProfile.findUnique({
          where: { workspaceId: ctx.workspaceId },
        }),
        prisma.brandIntelligence.findMany({
          where: { workspaceId: ctx.workspaceId },
          orderBy: [{ key: "asc" }, { version: "desc" }],
        }),
        prisma.audienceProfile.findMany({
          where: { workspaceId: ctx.workspaceId },
          orderBy: { version: "desc" },
          take: 10,
        }),
        prisma.brandVoice.findMany({
          where: { workspaceId: ctx.workspaceId },
          orderBy: { version: "desc" },
          take: 10,
        }),
        prisma.contentDNA.findMany({
          where: { workspaceId: ctx.workspaceId },
          orderBy: { version: "desc" },
          take: 10,
        }),
      ]);
      return json(reply, { profile, intelligence, audience, voice, dna });
    },
  );

  app.get(
    "/api/v1/workspaces/:workspaceId/integrations",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "integrations.read");
      if (!ctx) return;
      const [social, business, websites] = await Promise.all([
        prisma.socialAccount.findMany({
          where: { workspaceId: ctx.workspaceId },
          select: {
            id: true,
            platform: true,
            externalId: true,
            username: true,
            profile: true,
            connection: {
              select: {
                status: true,
                expiresAt: true,
                scopes: true,
                lastSuccessfulSync: true,
                lastFailedSync: true,
                errorState: true,
              },
            },
          },
        }),
        prisma.businessIntegration.findMany({
          where: { workspaceId: ctx.workspaceId },
          select: {
            id: true,
            provider: true,
            status: true,
            scopes: true,
            lastSyncAt: true,
            errorState: true,
          },
        }),
        prisma.website.findMany({
          where: { workspaceId: ctx.workspaceId },
          include: { scans: { orderBy: { startedAt: "desc" }, take: 1 } },
        }),
      ]);
      return json(reply, { social, business, websites });
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/integrations/social/:provider/connect",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "integrations.manage");
      if (!ctx) return;
      try {
        const result = await startSocialConnection(
          ctx.workspaceId,
          ctx.session.user.id,
          ctx.session.id,
          String((request.params as { provider: string }).provider),
        );
        await prisma.auditLog.create({
          data: {
            workspaceId: ctx.workspaceId,
            userId: ctx.session.user.id,
            action: "integration.oauth.started",
            entityType: "social_provider",
            entityId: result.provider,
          },
        });
        return json(reply, result, 201);
      } catch (error) {
        const code =
          error instanceof SocialLifecycleError
            ? error.code
            : error instanceof ProviderError && error.code === "NOT_CONFIGURED"
              ? "PROVIDER_NOT_CONFIGURED"
              : "OAUTH_CONNECT_FAILED";
        return fail(
          reply,
          code === "UNSUPPORTED_PROVIDER" ? 400 : 503,
          code,
          "The provider connection could not be started.",
        );
      }
    },
  );
  app.get(
    "/api/v1/integrations/social/:provider/callback",
    async (request, reply) => {
      const session = await auth(request, reply);
      if (!session) return;
      const query = request.query as {
        state?: string;
        code?: string;
        error?: string;
      };
      if (query.error || !query.state || !query.code)
        return fail(
          reply,
          400,
          "OAUTH_CALLBACK_REJECTED",
          "The provider did not complete the authorization request.",
        );
      try {
        const result = await completeSocialConnection(
          String((request.params as { provider: string }).provider),
          query.state,
          query.code,
          session.user.id,
          session.id,
        );
        const account = await prisma.socialAccount.findUniqueOrThrow({
          where: { id: result.id },
          select: { workspaceId: true },
        });
        await prisma.auditLog.create({
          data: {
            workspaceId: account.workspaceId,
            userId: session.user.id,
            action: "integration.oauth.completed",
            entityType: "social_account",
            entityId: result.id,
            metadata: { provider: result.provider },
          },
        });
        return json(reply, result);
      } catch (error) {
        const code =
          error instanceof SocialLifecycleError
            ? error.code
            : "OAUTH_CALLBACK_FAILED";
        return fail(
          reply,
          code === "OAUTH_WORKSPACE_FORBIDDEN" ? 403 : 400,
          code,
          "The provider connection could not be completed.",
        );
      }
    },
  );
  app.delete(
    "/api/v1/workspaces/:workspaceId/integrations/social/:id",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "integrations.manage");
      if (!ctx) return;
      const id = String((request.params as { id: string }).id);
      const disconnected = await disconnectSocialConnection(
        ctx.workspaceId,
        id,
      );
      if (!disconnected)
        return fail(
          reply,
          404,
          "INTEGRATION_NOT_FOUND",
          "Integration was not found.",
        );
      await prisma.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.session.user.id,
          action: "integration.disconnected",
          entityType: "social_account",
          entityId: id,
        },
      });
      return json(reply, { disconnected: true });
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/integrations/social/:id/sync",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "integrations.manage");
      if (!ctx) return;
      const id = String((request.params as { id: string }).id);
      try {
        const result = await syncSocialAccount(ctx.workspaceId, id);
        await prisma.auditLog.create({
          data: {
            workspaceId: ctx.workspaceId,
            userId: ctx.session.user.id,
            action: "integration.social.synced",
            entityType: "social_account",
            entityId: id,
          },
        });
        void createNotification({
          workspaceId: ctx.workspaceId,
          userId: ctx.session.user.id,
          type: "social_sync_completed",
          title: "Social sync complete",
          body: "Your social account was refreshed with the latest posts and analytics.",
          push: true,
        }).catch(() => undefined);
        return json(reply, result);
      } catch (error) {
        const code =
          error instanceof SocialLifecycleError
            ? error.code
            : error instanceof ProviderError
              ? error.code
              : "SOCIAL_SYNC_FAILED";
        return fail(
          reply,
          400,
          code,
          "The social account could not be synchronized.",
        );
      }
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/integrations/social/:id/posts",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "integrations.read");
      if (!ctx) return;
      const id = String((request.params as { id: string }).id);
      return json(
        reply,
        await prisma.socialPost.findMany({
          where: { workspaceId: ctx.workspaceId, socialAccountId: id },
          orderBy: { publishedAt: "desc" },
          take: 100,
          include: { metrics: { orderBy: { capturedAt: "desc" }, take: 1 } },
        }),
      );
    },
  );
  app.get(
    "/api/v1/workspaces/:workspaceId/integrations/social/:id/audience",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "integrations.read");
      if (!ctx) return;
      const id = String((request.params as { id: string }).id);
      return json(
        reply,
        await prisma.socialAudienceSnapshot.findMany({
          where: { workspaceId: ctx.workspaceId, socialAccountId: id },
          orderBy: { capturedAt: "desc" },
          take: 100,
        }),
      );
    },
  );

  app.get(
    "/api/v1/workspaces/:workspaceId/campaigns",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "campaigns.manage");
      if (!ctx) return;
      try {
        await assertFeature(ctx.workspaceId, "campaigns");
      } catch (error) {
        if (error instanceof EntitlementError)
          return fail(reply, 403, error.code, error.message);
        throw error;
      }
      return json(
        reply,
        await prisma.campaign.findMany({
          where: { workspaceId: ctx.workspaceId },
          orderBy: { createdAt: "desc" },
          include: { contents: true, calendarItems: true },
        }),
      );
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/campaigns",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "campaigns.manage");
      if (!ctx) return;
      try {
        await assertFeature(ctx.workspaceId, "campaigns");
      } catch (error) {
        if (error instanceof EntitlementError)
          return fail(reply, 403, error.code, error.message);
        throw error;
      }
      const body = request.body as {
        name?: string;
        description?: string;
        goal?: string;
        platforms?: string[];
        startDate?: string;
        endDate?: string;
      };
      if (!body.name?.trim())
        return fail(reply, 400, "NAME_REQUIRED", "Campaign name is required.");
      const campaign = await prisma.campaign.create({
        data: {
          workspaceId: ctx.workspaceId,
          name: body.name.trim(),
          description: body.description,
          goal: body.goal,
          platforms: body.platforms ?? [],
          startDate: body.startDate ? new Date(body.startDate) : undefined,
          endDate: body.endDate ? new Date(body.endDate) : undefined,
          status: "DRAFT",
        },
      });
      return json(reply, campaign, 201);
    },
  );
  app.patch(
    "/api/v1/workspaces/:workspaceId/campaigns/:id",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "campaigns.manage");
      if (!ctx) return;
      try {
        await assertFeature(ctx.workspaceId, "campaigns");
      } catch (error) {
        if (error instanceof EntitlementError)
          return fail(reply, 403, error.code, error.message);
        throw error;
      }
      const id = String((request.params as { id: string }).id);
      const input = updateCampaignSchema.parse(request.body);
      const result = await prisma.campaign.updateMany({
        where: { id, workspaceId: ctx.workspaceId },
        data: input,
      });
      if (!result.count)
        return fail(
          reply,
          404,
          "CAMPAIGN_NOT_FOUND",
          "Campaign was not found.",
        );
      return json(reply, { updated: true });
    },
  );

  app.get(
    "/api/v1/workspaces/:workspaceId/recommendations",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "analytics.read");
      if (!ctx) return;
      const data = await prisma.recommendation.findMany({
        where: { workspaceId: ctx.workspaceId, status: "NEW" },
        orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
        take: 50,
      });
      return json(reply, data);
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/recommendations/:id/:action",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "analytics.read");
      if (!ctx) return;
      const action = String((request.params as { action: string }).action);
      const status = action === "dismiss" ? "DISMISSED" : "ACTED_ON";
      const id = String((request.params as { id: string }).id);
      const result = await prisma.recommendation.updateMany({
        where: { id, workspaceId: ctx.workspaceId },
        data: { status },
      });
      if (!result.count)
        return fail(
          reply,
          404,
          "RECOMMENDATION_NOT_FOUND",
          "Recommendation was not found.",
        );
      return json(reply, { status });
    },
  );

  app.get(
    "/api/v1/workspaces/:workspaceId/calendar",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.read");
      if (!ctx) return;
      const q = request.query as {
        search?: string;
        status?: string;
        platform?: string;
        campaignId?: string;
        contentId?: string;
        from?: string;
        to?: string;
        page?: string;
        limit?: string;
      };
      const limit = Math.min(Math.max(Number(q.limit ?? 50), 1), 100),
        page = Math.max(Number(q.page ?? 1), 1);
      if (q.from && Number.isNaN(Date.parse(q.from)))
        return fail(reply, 400, "INVALID_DATE", "The from date is invalid.");
      if (q.to && Number.isNaN(Date.parse(q.to)))
        return fail(reply, 400, "INVALID_DATE", "The to date is invalid.");
      const where = {
        workspaceId: ctx.workspaceId,
        ...(q.status ? { status: q.status } : {}),
        ...(q.platform ? { platform: q.platform } : {}),
        ...(q.campaignId ? { campaignId: q.campaignId } : {}),
        ...(q.contentId ? { contentId: q.contentId } : {}),
        ...(q.from || q.to
          ? {
              scheduledFor: {
                ...(q.from ? { gte: new Date(q.from) } : {}),
                ...(q.to ? { lte: new Date(q.to) } : {}),
              },
            }
          : {}),
        ...(q.search
          ? {
              OR: [
                {
                  content: {
                    title: { contains: q.search, mode: "insensitive" as const },
                  },
                },
                {
                  campaign: {
                    name: { contains: q.search, mode: "insensitive" as const },
                  },
                },
              ],
            }
          : {}),
      };
      const [data, total] = await Promise.all([
        prisma.calendarItem.findMany({
          where,
          orderBy: [{ scheduledFor: "asc" }, { id: "asc" }],
          skip: (page - 1) * limit,
          take: limit,
          include: { content: true, campaign: true },
        }),
        prisma.calendarItem.count({ where }),
      ]);
      return json(reply, {
        items: data,
        page,
        limit,
        total,
        hasMore: page * limit < total,
      });
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/calendar",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.create");
      if (!ctx) return;
      const { createCalendarItemSchema } =
        await import("@contentra/validation");
      const input = createCalendarItemSchema.parse(request.body);
      if (
        input.contentId &&
        !(await prisma.content.findFirst({
          where: { id: input.contentId, workspaceId: ctx.workspaceId },
        }))
      )
        return fail(reply, 404, "CONTENT_NOT_FOUND", "Content was not found.");
      if (
        input.campaignId &&
        !(await prisma.campaign.findFirst({
          where: { id: input.campaignId, workspaceId: ctx.workspaceId },
        }))
      )
        return fail(
          reply,
          404,
          "CAMPAIGN_NOT_FOUND",
          "Campaign was not found.",
        );
      const item = await prisma.calendarItem.create({
        data: { workspaceId: ctx.workspaceId, ...input },
      });
      await prisma.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.session.user.id,
          action: "calendar.scheduled",
          entityType: "calendar_item",
          entityId: item.id,
        },
      });
      return json(reply, item, 201);
    },
  );
  app.patch(
    "/api/v1/workspaces/:workspaceId/calendar/:id",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.update");
      if (!ctx) return;
      const body = request.body as {
        scheduledFor?: string;
        status?: string;
        platform?: string;
        contentId?: string | null;
        campaignId?: string | null;
      };
      const id = String((request.params as { id: string }).id);
      if (
        body.scheduledFor &&
        Number.isNaN(Date.parse(body.scheduledFor))
      )
        return fail(
          reply,
          400,
          "INVALID_DATE",
          "The scheduled date is invalid.",
        );
      if (
        body.contentId &&
        !(await prisma.content.findFirst({
          where: { id: body.contentId, workspaceId: ctx.workspaceId },
        }))
      )
        return fail(reply, 404, "CONTENT_NOT_FOUND", "Content was not found.");
      if (
        body.campaignId &&
        !(await prisma.campaign.findFirst({
          where: { id: body.campaignId, workspaceId: ctx.workspaceId },
        }))
      )
        return fail(
          reply,
          404,
          "CAMPAIGN_NOT_FOUND",
          "Campaign was not found.",
        );
      const result = await prisma.calendarItem.updateMany({
        where: { id, workspaceId: ctx.workspaceId },
        data: {
          ...(body.scheduledFor
            ? { scheduledFor: new Date(body.scheduledFor) }
            : {}),
          ...(body.status ? { status: body.status } : {}),
          ...(body.platform ? { platform: body.platform } : {}),
          ...(body.contentId !== undefined
            ? { contentId: body.contentId }
            : {}),
          ...(body.campaignId !== undefined
            ? { campaignId: body.campaignId }
            : {}),
        },
      });
      if (!result.count)
        return fail(
          reply,
          404,
          "CALENDAR_ITEM_NOT_FOUND",
          "Calendar item was not found.",
        );
      return json(reply, { updated: true });
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/calendar/:id/cancel",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.update");
      if (!ctx) return;
      const id = String((request.params as { id: string }).id);
      const result = await prisma.calendarItem.updateMany({
        where: {
          id,
          workspaceId: ctx.workspaceId,
          status: { not: "CANCELLED" },
        },
        data: { status: "CANCELLED" },
      });
      if (result.count)
        await prisma.auditLog.create({
          data: {
            workspaceId: ctx.workspaceId,
            userId: ctx.session.user.id,
            action: "calendar.cancelled",
            entityType: "calendar_item",
            entityId: id,
          },
        });
      return json(reply, { cancelled: true, alreadyCancelled: !result.count });
    },
  );

  app.get(
    "/api/v1/workspaces/:workspaceId/notifications",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "workspace.read");
      if (!ctx) return;
      return json(
        reply,
        await prisma.notification.findMany({
          where: {
            workspaceId: ctx.workspaceId,
            OR: [{ userId: ctx.session.user.id }, { userId: null }],
          },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
      );
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/notifications/:id/read",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "workspace.read");
      if (!ctx) return;
      const id = String((request.params as { id: string }).id);
      await prisma.notification.updateMany({
        where: {
          id,
          workspaceId: ctx.workspaceId,
          OR: [{ userId: ctx.session.user.id }, { userId: null }],
        },
        data: { readAt: new Date() },
      });
      return json(reply, { read: true });
    },
  );

  app.post(
    "/api/v1/workspaces/:workspaceId/ai/actions",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "content.create");
      if (!ctx) return;
      const input = aiActionSchema.parse(request.body);
      const confirm = requiresConfirmation(input.type);
      if (!process.env.GEMINI_API_KEY)
        return fail(
          reply,
          503,
          "AI_NOT_CONFIGURED",
          "Contentra AI is not configured in this environment.",
        );
      const balance = await prisma.aICreditBalance.findUnique({
        where: { workspaceId: ctx.workspaceId },
      });
      if (!balance || balance.balance <= 0)
        return fail(
          reply,
          429,
          "AI_CREDITS_EXHAUSTED",
          "This workspace has no AI credits left. Upgrade your plan to get more.",
        );
      const provider = new GeminiProvider(process.env.GEMINI_API_KEY);
      const result = await provider.generateText({
        model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
        input: JSON.stringify(input.input),
        context: { workspaceId: ctx.workspaceId, action: input.type },
      });
      const cost = Math.max(
        1,
        Math.ceil((result.inputUnits + result.outputUnits) / 1000),
      );
      const charged = Math.min(cost, balance.balance);
      await prisma.$transaction([
        prisma.aICreditBalance.update({
          where: { id: balance.id },
          data: { balance: { decrement: charged } },
        }),
        prisma.aICreditTransaction.create({
          data: {
            balanceId: balance.id,
            workspaceId: ctx.workspaceId,
            userId: ctx.session.user.id,
            amount: -charged,
            reason: `ai:${input.type}`,
          },
        }),
        prisma.aIUsage.create({
          data: {
            workspaceId: ctx.workspaceId,
            userId: ctx.session.user.id,
            operation: input.type,
            provider: result.provider,
            model: result.model,
            inputUnits: result.inputUnits,
            outputUnits: result.outputUnits,
            creditCost: cost,
          },
        }),
      ]);
      return json(reply, {
        output: result.output,
        requiresConfirmation: confirm,
        provider: result.provider,
        model: result.model,
        creditsCharged: charged,
      });
    },
  );

  app.get(
    "/api/v1/workspaces/:workspaceId/api-keys",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "api.manage");
      if (!ctx) return;
      return json(
        reply,
        await prisma.aPIKey.findMany({
          where: { workspaceId: ctx.workspaceId },
          select: {
            id: true,
            name: true,
            prefix: true,
            permissions: true,
            createdAt: true,
            lastUsedAt: true,
            revokedAt: true,
          },
          orderBy: { createdAt: "desc" },
        }),
      );
    },
  );
  app.post(
    "/api/v1/workspaces/:workspaceId/api-keys",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "api.manage");
      if (!ctx) return;
      const body = request.body as { name?: string; permissions?: string[] };
      if (!body.name?.trim())
        return fail(
          reply,
          400,
          "NAME_REQUIRED",
          "An API key name is required.",
        );
      const key = generateApiKey();
      const record = await prisma.aPIKey.create({
        data: {
          workspaceId: ctx.workspaceId,
          name: body.name.trim(),
          keyHash: key.hash,
          prefix: key.prefix,
          permissions: body.permissions ?? [],
        },
      });
      await prisma.auditLog.create({
        data: {
          workspaceId: ctx.workspaceId,
          userId: ctx.session.user.id,
          action: "api_key.created",
          entityType: "api_key",
          entityId: record.id,
        },
      });
      return json(
        reply,
        {
          id: record.id,
          name: record.name,
          prefix: record.prefix,
          permissions: record.permissions,
          createdAt: record.createdAt,
          secret: key.raw,
        },
        201,
      );
    },
  );
  app.delete(
    "/api/v1/workspaces/:workspaceId/api-keys/:id",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "api.manage");
      if (!ctx) return;
      const id = String((request.params as { id: string }).id);
      const result = await prisma.aPIKey.updateMany({
        where: { id, workspaceId: ctx.workspaceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count)
        await prisma.auditLog.create({
          data: {
            workspaceId: ctx.workspaceId,
            userId: ctx.session.user.id,
            action: "api_key.revoked",
            entityType: "api_key",
            entityId: id,
          },
        });
      return json(reply, { revoked: true, alreadyRevoked: !result.count });
    },
  );

  app.post(
    "/api/v1/workspaces/:workspaceId/devices",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "workspace.read");
      if (!ctx) return;
      const body = request.body as { token?: string; platform?: string };
      if (!body.token || !body.platform)
        return fail(
          reply,
          400,
          "INVALID_DEVICE",
          "A platform and push token are required.",
        );
      if (!["android", "ios"].includes(body.platform))
        return fail(
          reply,
          400,
          "INVALID_PLATFORM",
          "Push registration is supported only on Android and iOS.",
        );
       const encryptionKey = process.env.ENCRYPTION_KEY;
       if (!encryptionKey)
         return fail(reply, 503, "ENCRYPTION_NOT_CONFIGURED", "Push-token encryption is not configured.");
       const tokenHash = hashToken(body.token);
      const device = await prisma.deviceRegistration.upsert({
        where: { tokenHash },
        update: {
          workspaceId: ctx.workspaceId,
          userId: ctx.session.user.id,
          platform: body.platform,
          status: "ACTIVE",
          lastSeenAt: new Date(),
          tokenEncrypted: encryptSecret(body.token, encryptionKey),
        },
        create: {
          workspaceId: ctx.workspaceId,
          userId: ctx.session.user.id,
          platform: body.platform,
          tokenHash,
          tokenEncrypted: encryptSecret(body.token, encryptionKey),
          lastSeenAt: new Date(),
        },
      });
      return json(
        reply,
        {
          id: device.id,
          platform: device.platform,
          status: device.status,
          lastSeenAt: device.lastSeenAt,
        },
        201,
      );
    },
  );
  app.delete(
    "/api/v1/workspaces/:workspaceId/devices/:id",
    async (request, reply) => {
      const ctx = await workspaceAuth(request, reply, "workspace.read");
      if (!ctx) return;
      await prisma.deviceRegistration.updateMany({
        where: {
          id: String((request.params as { id: string }).id),
          workspaceId: ctx.workspaceId,
          userId: ctx.session.user.id,
        },
        data: { status: "REVOKED" },
      });
      return json(reply, { revoked: true });
    },
  );

  app.post("/api/v1/public/funnel-events", async (request, reply) => {
    const input = funnelEventSchema.parse(request.body);
    const header = request.headers["x-client-id"];
    const clientId =
      typeof header === "string" ? header.trim().slice(0, 120) || null : null;
    await prisma.funnelEvent.create({
      data: {
        event: input.event,
        clientId,
        ref: input.ref ?? null,
        meta: {
          ...(input.label ? { label: input.label } : {}),
          ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
          ...(isInputJsonValue(input.meta) ? input.meta : {}),
        } as Prisma.InputJsonValue,
      },
    });
    return json(reply, { recorded: true }, 201);
  });

  app.post("/api/v1/public/analyze-url", async (request, reply) => {
    const input = urlAnalyzeSchema.parse(request.body);
    let url: URL;
    try {
      url = await validatePublicHttpUrl(input.url);
    } catch (error) {
      const code =
        error instanceof Error && error.message === "PRIVATE_URL"
          ? "URL_NOT_ALLOWED"
          : "INVALID_URL";
      return fail(reply, 400, code, "That website URL is not allowed.");
    }
    try {
      const page = await fetchPublicPage(url.toString());
      return json(reply, analyzePublicHtml(page.url, page.text));
    } catch (error) {
      // Network egress or upstream failures surface honestly; the landing never
      // fabricates an analysis.
      request.log.warn({ err: error }, "public analyze-url failed");
      return fail(
        reply,
        503,
        "ANALYZER_UNAVAILABLE",
        "We couldn't analyze that page right now. Please try again shortly.",
      );
    }
  });

  app.get("/api/v1/releases/latest", async (request, reply) => {
    const q = request.query as {
      platform?: ReleasePlatform;
      version?: string;
      buildNumber?: string;
    };
    if (
      !q.platform ||
      !["web", "windows", "android", "ios"].includes(q.platform) ||
      !q.version
    )
      return fail(
        reply,
        400,
        "INVALID_UPDATE_CHECK",
        "Platform and current version are required.",
      );
    const release = await prisma.release.findFirst({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
    });
    if (!release)
      return json(reply, { updateAvailable: false, required: false });
    const result = releaseForClient(
      release,
      q.platform,
      q.version,
      q.buildNumber ? Number(q.buildNumber) : undefined,
    );
    return json(reply, result ?? { updateAvailable: false, required: false });
  });
}
