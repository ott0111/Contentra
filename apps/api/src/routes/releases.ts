import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "../db.js";

const fail = (
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
) =>
  reply.status(status).send({ error: { code, message }, requestId: reply.request.id });

function requireAdminToken(request: FastifyRequest, reply: FastifyReply) {
  const expected = process.env.RELEASES_ADMIN_TOKEN;
  if (!expected) {
    fail(reply, 503, "RELEASES_ADMIN_NOT_CONFIGURED", "Release management is not enabled. Set RELEASES_ADMIN_TOKEN.");
    return false;
  }
  const header = request.headers.authorization;
  if (header !== `Bearer ${expected}`) {
    fail(reply, 401, "UNAUTHENTICATED", "A valid release-management token is required.");
    return false;
  }
  return true;
}

/**
 * Server-side release management, gated by RELEASES_ADMIN_TOKEN. The public
 * update check (GET /api/v1/releases/latest) remains unauthenticated so every
 * client can compare versions at runtime.
 */
export async function registerReleaseRoutes(app: FastifyInstance) {
  app.post("/api/v1/releases", async (request, reply) => {
    if (!requireAdminToken(request, reply)) return;
    const body = (request.body ?? {}) as {
      version?: string;
      title?: string;
      changelog?: unknown;
      platforms?: unknown;
      minimumSupportedVersion?: string;
      buildNumber?: number | string;
      status?: string;
    };
    if (!body.version || !body.title) {
      return fail(reply, 400, "INVALID_RELEASE", "A version and title are required.");
    }
    const changelog =
      body.changelog === undefined ? { features: [], improvements: [], fixes: [] } : body.changelog;
    const platforms = body.platforms === undefined ? {} : body.platforms;
    if (platforms === null || typeof platforms !== "object" || Array.isArray(platforms)) {
      return fail(reply, 400, "INVALID_RELEASE", "Platforms must be an object keyed by web|windows|android|ios.");
    }
    const publish = body.status === "PUBLISHED";
    const release = await prisma.release.create({
      data: {
        version: body.version,
        buildNumber:
          body.buildNumber === undefined || body.buildNumber === null
            ? null
            : Number(body.buildNumber),
        title: body.title,
        changelog: changelog as Parameters<typeof prisma.release.create>[0]["data"]["changelog"],
        minimumSupportedVersion: body.minimumSupportedVersion || null,
        platforms: platforms as Parameters<typeof prisma.release.create>[0]["data"]["platforms"],
        status: publish ? "PUBLISHED" : "DRAFT",
        publishedAt: publish ? new Date() : null,
      },
    });
    return reply.status(201).send({ data: release, requestId: request.id });
  });

  app.get("/api/v1/releases", async (request, reply) => {
    if (!requireAdminToken(request, reply)) return;
    const releases = await prisma.release.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return reply.send({ data: releases, requestId: request.id });
  });

  app.delete("/api/v1/releases/:version", async (request, reply) => {
    if (!requireAdminToken(request, reply)) return;
    const version = String((request.params as { version: string }).version);
    const result = await prisma.release.deleteMany({ where: { version } });
    if (!result.count) return fail(reply, 404, "RELEASE_NOT_FOUND", "No release has that version.");
    return reply.send({ data: { deleted: true }, requestId: request.id });
  });
}