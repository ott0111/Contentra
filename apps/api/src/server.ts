import Fastify, { type FastifyRequest } from "fastify";
import crypto from "node:crypto";
import { pathToFileURL } from "node:url";
import { ZodError } from "zod";
import { registerRoutes } from "./routes/index.js";
import { registerBusinessRoutes } from "./routes/business.js";
import { registerWebhookRoutes } from "./routes/webhooks.js";
import { registerReleaseRoutes } from "./routes/releases.js";
import rawBody from "fastify-raw-body";
import { prisma } from "./db.js";

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers['api-key']",
        "req.headers['x-api-key']",
        "res.headers['set-cookie']",
      ],
      censor: "[REDACTED]",
    },
  },
  bodyLimit: 1_000_000,
  genReqId: () => `req_${crypto.randomUUID()}`,
  trustProxy: process.env.TRUST_PROXY === "1",
});

await app.register(rawBody, {
  field: "rawBody",
  global: false,
  encoding: "utf8",
  runFirst: true,
});

// Lightweight local guard; production deployments should place a distributed limiter at the edge.
const authAttempts = new Map<string, { count: number; resetAt: number }>();
const AUTH_WINDOW_MS = 60_000;
const AUTH_MAX = 10;
const RATE_LIMITED_PATHS = [
  "/api/v1/auth/login",
  "/api/v1/auth/signup",
  "/api/v1/auth/forgot-password",
  "/api/v1/auth/reset-password",
  "/api/v1/auth/verify-email",
];

function pruneAuthAttempts(now: number) {
  if (authAttempts.size < 1024) return;
  for (const [key, value] of authAttempts) {
    if (value.resetAt <= now) authAttempts.delete(key);
  }
}

const corsOrigins = (process.env.APP_ORIGINS ?? process.env.WEB_ORIGIN ?? "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.addHook("onRequest", async (request, reply) => {
  const origin = request.headers.origin;
  if (origin && corsOrigins.includes(origin)) {
    reply.header("access-control-allow-origin", origin);
    reply.header("access-control-allow-credentials", "true");
    reply.header("access-control-allow-headers", "content-type,x-workspace-id");
    reply.header(
      "access-control-allow-methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    );
    reply.header("vary", "Origin");
  }
  if (request.method === "OPTIONS") {
    reply.status(204).send();
    return;
  }
  const path = request.url.split("?")[0];
  if (RATE_LIMITED_PATHS.some((prefix) => path.startsWith(prefix))) {
    const now = Date.now();
    pruneAuthAttempts(now);
    const key = `${request.ip}:${path}`;
    const current = authAttempts.get(key);
    if (!current || current.resetAt <= now)
      authAttempts.set(key, { count: 1, resetAt: now + AUTH_WINDOW_MS });
    else if (++current.count > AUTH_MAX) {
      reply
        .status(429)
        .send({
          error: {
            code: "RATE_LIMITED",
            message: "Too many authentication attempts. Try again shortly.",
          },
          requestId: request.id,
        });
      return;
    }
  }
});

app.get("/health", async (request) => ({
  data: { status: "ok", service: "contentra-api" },
  requestId: request.id,
}));
app.register(async (api) => {
  api.get("/api/v1", async (request) => ({
    data: { name: "Contentra API", version: "v1" },
    requestId: request.id,
  }));
  await registerRoutes(api);
  await registerBusinessRoutes(api);
  await registerWebhookRoutes(api);
  await registerReleaseRoutes(api);
});

app.setErrorHandler((err, req, reply) => {
  req.log.error({ err, requestId: req.id }, "request failed");
  if (err instanceof ZodError)
    return reply
      .status(400)
      .send({
        error: {
          code: "VALIDATION_ERROR",
          message: "One or more fields are invalid.",
          details: err.flatten(),
        },
        requestId: req.id,
      });
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  return reply
    .status(status)
    .send({
      error: {
        code: status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
    message: status === 500 ? "An unexpected error occurred." : err instanceof Error ? err.message : "Request failed.",
      },
      requestId: req.id,
    });
});

app.addHook("onClose", async () => {
  await prisma.$disconnect();
});

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  app
    .listen({ port: Number(process.env.PORT ?? 4000), host: "0.0.0.0" })
    .catch((err) => {
      app.log.error(err);
      process.exit(1);
    });
}

export default app;
