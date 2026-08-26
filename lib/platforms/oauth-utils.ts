/**
 * Platform OAuth Utilities
 * Handles secure token management and Supabase integration.
 * All operations are server-side only.
 */

import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "crypto";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import type { NextResponse } from "next/server";
import type { YouTubeOAuthConfig } from "./youtube";

const STATE_COOKIE_NAME = "contentra_youtube_oauth_state";
const SOCIAL_STATE_COOKIE_NAME = "contentra_social_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;

const stateStore = new Map<string, { userId: string; platform: string; expiresAt: Date }>();

function getTokenEncryptionKey() {
  const key = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
  if (!key) {
    throw new Error("YOUTUBE_TOKEN_ENCRYPTION_KEY is not configured.");
  }

  return createHash("sha256").update(key).digest();
}

export function encryptToken(value: string): string {
  if (!value) return "";

  const iv = randomBytes(12);
  const key = getTokenEncryptionKey();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString("base64url");
}

export function decryptToken(value?: string | null): string | null {
  if (!value) return null;

  try {
    const key = getTokenEncryptionKey();
    const buffer = Buffer.from(value, "base64url");
    if (buffer.length < 28) return null;

    const iv = buffer.subarray(0, 12);
    const authTag = buffer.subarray(12, 28);
    const encrypted = buffer.subarray(28);

    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch (error) {
    console.error("Token decryption failed:", error);
    return null;
  }
}

export interface PlatformOAuthProvider {
  platform: "youtube" | "tiktok" | "instagram" | "x" | "twitch";
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getOAuthProvider(platform: string): YouTubeOAuthConfig | null {
  switch (platform) {
    case "youtube":
      if (!process.env.YOUTUBE_OAUTH_CLIENT_ID || !process.env.YOUTUBE_OAUTH_CLIENT_SECRET) {
        return null;
      }
      return {
        clientId: process.env.YOUTUBE_OAUTH_CLIENT_ID,
        clientSecret: process.env.YOUTUBE_OAUTH_CLIENT_SECRET,
        redirectUri: process.env.YOUTUBE_OAUTH_REDIRECT_URI || `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/connections/youtube/callback`,
      };
    default:
      return null;
  }
}

export async function savePlatformConnection(
  userId: string,
  platform: string,
  {
    username,
    platformUserId,
    accessToken,
    refreshToken,
    expiresIn,
    scope,
  }: {
    username: string;
    platformUserId: string;
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
    scope?: string;
  }
): Promise<{ id: string; error?: string }> {
  try {
    const admin = createAdminClient();
    const now = new Date();
    const expiresAt = expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null;

    const encryptedAccessToken = encryptToken(accessToken);
    const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : null;

    const { data, error } = await admin
      .from("platforms")
      .upsert(
        {
          user_id: userId,
          platform,
          username,
          platform_user_id: platformUserId,
          access_token: encryptedAccessToken,
          refresh_token: encryptedRefreshToken,
          token_expires_at: expiresAt,
          scope: scope || null,
          connected: true,
          updated_at: now,
          last_synced_at: null,
        },
        { onConflict: "user_id,platform" }
      )
      .select("id")
      .single();

    if (error) {
      console.error("Failed to save platform connection:", error);
      return { id: "", error: error.message };
    }

    return { id: data.id };
  } catch (err) {
    console.error("Unexpected error saving platform connection:", err);
    return { id: "", error: "Failed to save connection" };
  }
}

export async function getPlatformTokens(userId: string, platform: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
} | null> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("platforms")
      .select("access_token,refresh_token,token_expires_at")
      .eq("user_id", userId)
      .eq("platform", platform)
      .eq("connected", true)
      .single();

    if (error || !data) {
      return null;
    }

    const accessToken = decryptToken(data.access_token);
    const decryptedRefreshToken = data.refresh_token ? decryptToken(data.refresh_token) : undefined;
    const refreshToken = decryptedRefreshToken ?? undefined;

    if (!accessToken) {
      return null;
    }

    return {
      accessToken,
      refreshToken,
      expiresAt: data.token_expires_at ? new Date(data.token_expires_at) : undefined,
    };
  } catch (err) {
    console.error("Failed to retrieve platform tokens:", err);
    return null;
  }
}

export async function updatePlatformTokens(
  userId: string,
  platform: string,
  {
    accessToken,
    refreshToken,
    expiresIn,
  }: {
    accessToken: string;
    refreshToken?: string;
    expiresIn?: number;
  }
): Promise<boolean> {
  try {
    const admin = createAdminClient();
    const now = new Date();
    const expiresAt = expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null;

    const { error } = await admin
      .from("platforms")
      .update({
        access_token: encryptToken(accessToken),
        refresh_token: refreshToken ? encryptToken(refreshToken) : undefined,
        token_expires_at: expiresAt,
        updated_at: now,
      })
      .eq("user_id", userId)
      .eq("platform", platform);

    if (error) {
      console.error("Failed to update platform tokens:", error);
      return false;
    }

    return true;
  } catch (err) {
    console.error("Unexpected error updating platform tokens:", err);
    return false;
  }
}

export async function markPlatformSynced(userId: string, platform: string, syncedAt: Date): Promise<boolean> {
  const admin = createAdminClient();
  const { error } = await admin
    .from("platforms")
    .update({ last_synced_at: syncedAt, updated_at: syncedAt })
    .eq("user_id", userId)
    .eq("platform", platform)
    .eq("connected", true);
  return !error;
}

export function isTokenExpired(expiresAt?: Date): boolean {
  if (!expiresAt) return false;
  return new Date() >= new Date(expiresAt.getTime() - 5 * 60 * 1000);
}

export function generateOAuthState(): string {
  return randomBytes(32).toString("hex");
}

function buildSignedStatePayload(state: string, userId: string, platform: string) {
  const payload = JSON.stringify({
    state,
    userId,
    platform,
    expiresAt: Date.now() + STATE_TTL_MS,
  });

  const signKey = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
  if (!signKey) {
    throw new Error("YOUTUBE_TOKEN_ENCRYPTION_KEY is not configured.");
  }

  const signature = createHmac("sha256", signKey)
    .update(payload)
    .digest("hex");

  return `${Buffer.from(payload).toString("base64url")}.${signature}`;
}

export function storeOAuthState(state: string, userId: string, platform: string, response?: NextResponse): void {
  stateStore.set(state, {
    userId,
    platform,
    expiresAt: new Date(Date.now() + STATE_TTL_MS),
  });

  if (response) {
    response.cookies.set(STATE_COOKIE_NAME, buildSignedStatePayload(state, userId, platform), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
  }
}

export function verifyOAuthState(state: string, cookieValue?: string): { userId: string; platform: string } | null {
  const stateFromStore = stateStore.get(state);
  if (stateFromStore && new Date() <= stateFromStore.expiresAt) {
    stateStore.delete(state);
    return { userId: stateFromStore.userId, platform: stateFromStore.platform };
  }

  if (stateStore.has(state)) {
    stateStore.delete(state);
  }

  if (!cookieValue) {
    return null;
  }

  try {
    const [encodedPayload, signature] = cookieValue.split(".");
    if (!encodedPayload || !signature) return null;

    const signKey = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY;
    if (!signKey) {
      return null;
    }

    const expected = createHmac("sha256", signKey)
      .update(Buffer.from(encodedPayload, "base64url").toString("utf8"))
      .digest("hex");

    if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"))) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as {
      state: string;
      userId: string;
      platform: string;
      expiresAt: number;
    };

    if (payload.state !== state || payload.userId === undefined || payload.platform === undefined) {
      return null;
    }

    if (Date.now() > payload.expiresAt) {
      return null;
    }

    return { userId: payload.userId, platform: payload.platform };
  } catch {
    return null;
  }
}

export function storeSocialOAuthState(state: string, userId: string, platform: string, response: NextResponse): void {
  response.cookies.set(SOCIAL_STATE_COOKIE_NAME, buildSignedStatePayload(state, userId, platform), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
}

export function getSocialOAuthStateCookieName(): string {
  return SOCIAL_STATE_COOKIE_NAME;
}
