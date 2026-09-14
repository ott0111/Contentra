import {
  OAuthSocialAdapter,
  ProviderError,
  type OAuthProviderConfig,
  type SocialProfile,
  type SocialProvider,
  providerFrom,
} from "@contentra/integrations";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import {
  decryptSecret,
  encryptSecret,
  hashToken,
  randomToken,
  signOpaqueState,
  verifyOpaqueState,
} from "../security.js";
import { can } from "@contentra/core";
import { getMembership } from "./workspaces.js";

type OAuthState = {
  nonce: string;
  workspaceId: string;
  userId: string;
  sessionBinding: string;
  provider: SocialProvider;
  action: "connect";
  expiresAt: number;
};
const profile =
  (provider: SocialProvider) =>
  (payload: unknown): SocialProfile => {
    const value = payload as Record<string, any>;
    const data = value.data ?? value;
    if (provider === "youtube") {
      const item = Array.isArray(value.items) ? value.items[0] : undefined;
      return {
        externalId: String(item?.id ?? ""),
        username: item?.snippet?.customUrl,
        profile: {
          displayName: item?.snippet?.title,
          avatarUrl: item?.snippet?.thumbnails?.default?.url,
        },
      };
    }
    if (provider === "tiktok") {
      const user = data.user ?? data;
      return {
        externalId: String(user.open_id ?? user.union_id ?? ""),
        username: user.display_name,
        profile: { displayName: user.display_name, avatarUrl: user.avatar_url },
      };
    }
    return {
      externalId: String(data.id ?? data.user_id ?? ""),
      username: typeof data.username === "string" ? data.username : undefined,
      profile: {
        displayName: data.name ?? data.username,
        avatarUrl: data.profile_picture_url ?? data.profile_image_url,
        profileUrl: data.permalink_url,
      },
    };
  };
const environment = (provider: SocialProvider) => provider.toUpperCase();
export class SocialLifecycleError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}
export function socialAdapter(providerValue: string) {
  const provider = providerFrom(providerValue);
  if (!provider) throw new SocialLifecycleError("UNSUPPORTED_PROVIDER");
  const key = environment(provider);
  const clientId = process.env[`${key}_CLIENT_ID`];
  const clientSecret = process.env[`${key}_CLIENT_SECRET`];
  const authorizationEndpoint = process.env[`${key}_AUTHORIZATION_ENDPOINT`];
  const tokenEndpoint = process.env[`${key}_TOKEN_ENDPOINT`];
  const profileEndpoint = process.env[`${key}_PROFILE_ENDPOINT`];
  const revokeEndpoint = process.env[`${key}_REVOCATION_ENDPOINT`];
  const redirectUri =
    process.env[`${key}_REDIRECT_URI`] ??
    `${process.env.API_ORIGIN ?? "http://localhost:4000"}/api/v1/integrations/social/${provider}/callback`;
  if (
    !clientId ||
    !clientSecret ||
    !authorizationEndpoint ||
    !tokenEndpoint ||
    !profileEndpoint
  )
    throw new ProviderError(
      provider,
      "NOT_CONFIGURED",
      "This social provider is not configured.",
    );
  const capabilities = (process.env[`${key}_CAPABILITIES`] ?? "profile,refresh")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean) as OAuthProviderConfig["capabilities"];
  return new OAuthSocialAdapter({
    provider,
    clientId,
    clientSecret,
    redirectUri,
    authorizationEndpoint,
    tokenEndpoint,
    profileEndpoint,
    revokeEndpoint,
    postsEndpoint: process.env[`${key}_POSTS_ENDPOINT`],
    metricsEndpoint: process.env[`${key}_METRICS_ENDPOINT`],
    audienceEndpoint: process.env[`${key}_AUDIENCE_ENDPOINT`],
    publishEndpoint: process.env[`${key}_PUBLISH_ENDPOINT`],
    scopes: (process.env[`${key}_SCOPES`] ?? "").split(/[ ,]+/).filter(Boolean),
    capabilities,
    normalizeProfile: profile(provider),
  });
}

export async function syncSocialAccount(
  workspaceId: string,
  socialAccountId: string,
) {
  const account = await prisma.socialAccount.findFirst({
    where: { id: socialAccountId, workspaceId },
    include: { connection: true },
  });
  if (
    !account ||
    !account.connection ||
    account.connection.status !== "CONNECTED"
  )
    throw new SocialLifecycleError("CONNECTION_NOT_AVAILABLE");
  const adapter = socialAdapter(account.platform);
  const token = await serverAccessToken(workspaceId, socialAccountId);
  const tokens = {
    accessToken: token,
    scopes: account.connection.scopes,
    expiresAt: account.connection.expiresAt ?? undefined,
  };
  try {
    if (adapter.supports("profile")) {
      const normalized = await adapter.getProfile(tokens);
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          externalId: normalized.externalId,
          username: normalized.username,
          profile: normalized.profile as never,
        },
      });
    }
    if (adapter.supports("content.read")) {
      let cursor: string | undefined;
      do {
        const page = await adapter.getPosts(tokens, cursor);
        for (const post of page.items)
          await prisma.socialPost.upsert({
            where: {
              socialAccountId_externalId: {
                socialAccountId: account.id,
                externalId: post.externalId,
              },
            },
            update: { publishedAt: post.publishedAt, rawData: post as never },
            create: {
              workspaceId,
              socialAccountId: account.id,
              externalId: post.externalId,
              publishedAt: post.publishedAt,
              rawData: post as never,
            },
          });
        cursor = page.nextCursor;
      } while (cursor);
    }
    if (adapter.supports("metrics.read")) {
      const page = await adapter.getPostMetrics(tokens);
      for (const metric of page.items)
        await prisma.socialMetric.create({
          data: {
            workspaceId,
            socialAccountId: account.id,
            capturedAt: metric.capturedAt ?? new Date(),
            views: metric.views,
            reach: metric.reach,
            likes: metric.likes,
            comments: metric.comments,
            shares: metric.shares,
            saves: metric.saves,
            clicks: metric.clicks,
            followers: metric.followers,
            watchTimeSeconds: metric.watchTimeSeconds,
            engagementRate: metric.engagementRate,
            rawData: metric as never,
          },
        });
    }
    if (adapter.supports("audience.read")) {
      const audience = await adapter.getAudience(tokens);
      await prisma.socialAudienceSnapshot.create({
        data: {
          workspaceId,
          socialAccountId: account.id,
          capturedAt: audience.capturedAt ?? new Date(),
          data: audience as never,
        },
      });
    }
    await prisma.socialConnection.update({
      where: { id: account.connection.id },
      data: {
        lastSuccessfulSync: new Date(),
        lastFailedSync: null,
        errorState: null,
      },
    });
    return { id: account.id, status: "SYNCED" };
  } catch (error) {
    await prisma.socialConnection.update({
      where: { id: account.connection.id },
      data: {
        lastFailedSync: new Date(),
        errorState: error instanceof ProviderError ? error.code : "SYNC_FAILED",
      },
    });
    throw error;
  }
}

export async function startSocialConnection(
  workspaceId: string,
  userId: string,
  sessionId: string,
  providerValue: string,
) {
  const adapter = socialAdapter(providerValue);
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new SocialLifecycleError("SESSION_SECRET_NOT_CONFIGURED");
  const nonce = randomToken();
  const expiresAt = Date.now() + 10 * 60_000;
  const sessionBinding = hashToken(sessionId);
  await prisma.integrationEvent.create({
    data: {
      workspaceId,
      provider: adapter.config.provider,
      eventType: "oauth.state",
      externalId: nonce,
      payload: {
        workspaceId,
        userId,
        sessionBinding,
        provider: adapter.config.provider,
        action: "connect",
        expiresAt,
      },
    },
  });
  return {
    provider: adapter.config.provider,
    authorizationUrl: adapter.authorizationUrl(
      signOpaqueState(
        {
          nonce,
          workspaceId,
          userId,
          sessionBinding,
          provider: adapter.config.provider,
          action: "connect",
          expiresAt,
        },
        secret,
      ),
    ),
    expiresAt: new Date(expiresAt),
  };
}

export async function completeSocialConnection(
  providerValue: string,
  state: string,
  code: string,
  userId: string,
  sessionId: string,
) {
  const secret = process.env.SESSION_SECRET;
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!secret || secret.length < 32)
    throw new SocialLifecycleError("SESSION_SECRET_NOT_CONFIGURED");
  if (!encryptionKey)
    throw new SocialLifecycleError("ENCRYPTION_NOT_CONFIGURED");
  const decoded = verifyOpaqueState<OAuthState>(state, secret);
  const provider = providerFrom(providerValue);
  if (
    !decoded ||
    !provider ||
    decoded.provider !== provider ||
    decoded.action !== "connect" ||
    decoded.userId !== userId ||
    decoded.sessionBinding !== hashToken(sessionId) ||
    decoded.expiresAt < Date.now()
  )
    throw new SocialLifecycleError("INVALID_OAUTH_STATE");
  const membership = await getMembership(userId, decoded.workspaceId);
  if (!membership || !can(membership.role, "integrations.manage"))
    throw new SocialLifecycleError("OAUTH_WORKSPACE_FORBIDDEN");
  const claimed = await prisma.integrationEvent.updateMany({
    where: {
      workspaceId: decoded.workspaceId,
      provider,
      eventType: "oauth.state",
      externalId: decoded.nonce,
      processedAt: null,
    },
    data: { processedAt: new Date() },
  });
  if (!claimed.count) throw new SocialLifecycleError("INVALID_OAUTH_STATE");
  try {
    const adapter = socialAdapter(provider);
    const tokens = await adapter.exchangeCode(code);
    const account = await adapter.getProfile(tokens);
  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const social = await tx.socialAccount.upsert({
        where: {
          workspaceId_platform_externalId: {
            workspaceId: decoded.workspaceId,
            platform: provider,
            externalId: account.externalId,
          },
        },
        update: {
          username: account.username,
          profile: account.profile as never,
        },
        create: {
          workspaceId: decoded.workspaceId,
          platform: provider,
          externalId: account.externalId,
          username: account.username,
          profile: account.profile as never,
        },
      });
      const connection = await tx.socialConnection.upsert({
        where: { socialAccountId: social.id },
        update: {
          status: "CONNECTED",
          accessTokenEncrypted: encryptSecret(
            tokens.accessToken,
            encryptionKey,
          ),
          refreshTokenEncrypted: tokens.refreshToken
            ? encryptSecret(tokens.refreshToken, encryptionKey)
            : null,
          expiresAt: tokens.expiresAt,
          scopes: tokens.scopes,
          errorState: null,
        },
        create: {
          socialAccountId: social.id,
          status: "CONNECTED",
          accessTokenEncrypted: encryptSecret(
            tokens.accessToken,
            encryptionKey,
          ),
          refreshTokenEncrypted: tokens.refreshToken
            ? encryptSecret(tokens.refreshToken, encryptionKey)
            : undefined,
          expiresAt: tokens.expiresAt,
          scopes: tokens.scopes,
        },
      });
      return { social, connection };
    });
    return {
      id: result.social.id,
      provider,
      username: result.social.username,
      profile: result.social.profile,
      status: result.connection.status,
      expiresAt: result.connection.expiresAt,
      scopes: result.connection.scopes,
    };
  } catch (error) {
    const failure =
      error instanceof ProviderError ? error.code : "OAUTH_FAILED";
    await Promise.all([
      prisma.integrationEvent.updateMany({
        where: {
          workspaceId: decoded.workspaceId,
          provider,
          eventType: "oauth.state",
          externalId: decoded.nonce,
        },
        data: { error: failure },
      }),
      prisma.auditLog
        .create({
          data: {
            workspaceId: decoded.workspaceId,
            userId,
            action: "integration.oauth.failed",
            entityType: "social_provider",
            entityId: provider,
            metadata: { code: failure },
          },
        })
        .catch(() => undefined),
    ]);
    throw error;
  }
}

export async function disconnectSocialConnection(
  workspaceId: string,
  socialAccountId: string,
) {
  const connection = await prisma.socialConnection.findFirst({
    where: {
      socialAccountId,
      socialAccount: { workspaceId },
      status: "CONNECTED",
    },
    include: { socialAccount: true },
  });
  if (!connection) return false;
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (encryptionKey) {
    try {
      await socialAdapter(connection.socialAccount.platform).revoke(
        decryptSecret(connection.accessTokenEncrypted, encryptionKey),
      );
    } catch {
      /* Local credential removal must not be blocked by provider revocation failures. */
    }
  }
  await prisma.socialConnection.update({
    where: { id: connection.id },
    data: {
      status: "DISCONNECTED",
      accessTokenEncrypted: "",
      refreshTokenEncrypted: null,
      expiresAt: null,
      errorState: null,
    },
  });
  return true;
}

export async function serverAccessToken(
  workspaceId: string,
  socialAccountId: string,
) {
  const connection = await prisma.socialConnection.findFirst({
    where: { socialAccountId, socialAccount: { workspaceId } },
    include: { socialAccount: true },
  });
  if (!connection || connection.status !== "CONNECTED")
    throw new Error("CONNECTION_NOT_AVAILABLE");
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("ENCRYPTION_NOT_CONFIGURED");
  if (connection.expiresAt && connection.expiresAt <= new Date()) {
    if (!connection.refreshTokenEncrypted) {
      await prisma.socialConnection.update({
        where: { id: connection.id },
        data: { status: "REAUTH_REQUIRED", errorState: "TOKEN_EXPIRED" },
      });
      throw new Error("REAUTH_REQUIRED");
    }
    try {
      const adapter = socialAdapter(connection.socialAccount.platform);
      const refreshed = await adapter.refresh(
        decryptSecret(connection.refreshTokenEncrypted, encryptionKey),
      );
      await prisma.socialConnection.update({
        where: { id: connection.id },
        data: {
          accessTokenEncrypted: encryptSecret(
            refreshed.accessToken,
            encryptionKey,
          ),
          refreshTokenEncrypted: refreshed.refreshToken
            ? encryptSecret(refreshed.refreshToken, encryptionKey)
            : connection.refreshTokenEncrypted,
          expiresAt: refreshed.expiresAt,
          scopes: refreshed.scopes,
          lastSuccessfulSync: new Date(),
          errorState: null,
        },
      });
      return refreshed.accessToken;
    } catch (error) {
      await prisma.socialConnection.update({
        where: { id: connection.id },
        data: {
          status: "REAUTH_REQUIRED",
          lastFailedSync: new Date(),
          errorState:
            error instanceof ProviderError
              ? error.code
              : "TOKEN_REFRESH_FAILED",
        },
      });
      throw error;
    }
  }
  return decryptSecret(connection.accessTokenEncrypted, encryptionKey);
}
