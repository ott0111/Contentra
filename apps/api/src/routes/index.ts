import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
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
        select: {
          onboardingState: true,
          onboardedAt: true,
        },
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
      const ctx = await workspaceAuth(
        request,
        reply,
        "workspace.update",
      );
      if (!ctx) return;

      try {
        const input = onboardingStateSchema.parse(request.body);

        const workspace = await prisma.workspace.update({
          where: { id: ctx.workspaceId },
          data: {
            ...(input.workspaceType
              ? { type: input.workspaceType }
              : {}),
            onboardingState: input as Prisma.InputJsonValue,
            onboardedAt: input.completed
              ? new Date()
              : undefined,
          },
          select: {
            onboardingState: true,
            onboardedAt: true,
          },
        });

        try {
          await prisma.auditLog.create({
            data: {
              workspaceId: ctx.workspaceId,
              userId: ctx.session.user.id,
              action: input.completed
                ? "onboarding.completed"
                : "onboarding.saved",
              entityType: "workspace",
              entityId: ctx.workspaceId,
            },
          });
        } catch (error) {
          request.log.warn(
            {
              err: error,
              workspaceId: ctx.workspaceId,
            },
            "onboarding audit log failed",
          );
        }

        if (input.completed) {
          try {
            await completeReferralAndReward({
              workspaceId: ctx.workspaceId,
              referredUserId: ctx.session.user.id,
            });
          } catch (error) {
            request.log.warn(
              {
                err: error,
                workspaceId: ctx.workspaceId,
              },
              "onboarding referral completion failed",
            );
          }
        }

        return json(reply, {
          state: workspace.onboardingState,
          completedAt: workspace.onboardedAt,
        });
      } catch (error) {
        request.log.error(
          {
            err: error,
            workspaceId: ctx.workspaceId,
          },
          "onboarding save failed",
        );

        if (error instanceof ZodError) {
          return fail(
            reply,
            400,
            "VALIDATION_ERROR",
            "One or more onboarding fields are invalid.",
            error.flatten(),
          );
        }

        return fail(
          reply,
          500,
          "ONBOARDING_SAVE_FAILED",
          "We could not save your onboarding progress.",
        );
      }
    },
  );

  app.get(
    "/api/v1/workspaces/:workspaceId/referral",
    async (request, reply) => {
      const ctx = await workspaceAuth(
        request,
        reply,
        "workspace.read",
      );
      if (!ctx) return;

      const code = await getOrCreateReferralCode(
        ctx.workspaceId,
      );

      const stats = await listReferralStats(
        ctx.workspaceId,
      );

      return json(reply, {
        code: code.code,
        createdAt: code.createdAt,
        stats,
      });
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