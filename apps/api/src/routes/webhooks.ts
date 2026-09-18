import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../db.js";
import { decryptSecret, verifyWebhookSignature } from "../security.js";
import {
  processPaddleEvent,
  supportedPaddleEvent,
  verifyPaddleWebhookSignature,
  type PaddleEvent,
} from "../services/paddle.js";

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && Reflect.get(error, "code") === "P2002";
}

export async function registerWebhookRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/webhooks/paddle",
    { config: { rawBody: true } },
    async (
      request: FastifyRequest & { rawBody?: string | Buffer },
      reply: FastifyReply,
    ) => {
      const raw = typeof request.rawBody === "string" ? request.rawBody : request.rawBody?.toString("utf8") ?? JSON.stringify(request.body);
      const signature = request.headers["paddle-signature"];
      if (
        typeof signature !== "string" ||
        !verifyPaddleWebhookSignature(raw, signature)
      )
        return reply
          .status(401)
          .send({
            error: {
              code: "INVALID_PADDLE_SIGNATURE",
              message:
                "Paddle webhook signature is invalid or Paddle webhooks are not configured.",
            },
            requestId: request.id,
          });
      let event: PaddleEvent;
      try {
        event = JSON.parse(raw) as PaddleEvent;
      } catch {
        return reply
          .status(400)
          .send({
            error: {
              code: "INVALID_PADDLE_EVENT",
              message: "Paddle sent an invalid event.",
            },
            requestId: request.id,
          });
      }
      if (
        !event.event_id ||
        !event.event_type ||
        !event.data ||
        typeof event.data !== "object"
      )
        return reply
          .status(400)
          .send({
            error: {
              code: "INVALID_PADDLE_EVENT",
              message: "Paddle event is incomplete.",
            },
            requestId: request.id,
          });
      if (!supportedPaddleEvent(event.event_type))
        return reply.send({
          data: { accepted: true, ignored: true },
          requestId: request.id,
        });
      try {
        const result = await processPaddleEvent(event);
        return reply.send({
          data: { accepted: true, ...result },
          requestId: request.id,
        });
      } catch (error) {
        request.log.error(
          { error, paddleEventId: event.event_id },
          "paddle webhook processing failed",
        );
        return reply
          .status(500)
          .send({
            error: {
              code: "PADDLE_EVENT_PROCESSING_FAILED",
              message: "The verified Paddle event could not be processed.",
            },
            requestId: request.id,
          });
      }
    },
  );
  app.post(
    "/api/v1/webhooks/:id",
    { config: { rawBody: true } },
    async (
    request: FastifyRequest & { rawBody?: string | Buffer },
      reply: FastifyReply,
    ) => {
      const id = String((request.params as { id: string }).id);
      const webhook = await prisma.webhook.findUnique({ where: { id } });
      if (!webhook || !webhook.active)
        return reply
          .status(404)
          .send({
            error: {
              code: "WEBHOOK_NOT_FOUND",
              message: "Webhook is not active.",
            },
            requestId: request.id,
          });
      const signature = request.headers["x-contentra-signature"];
      if (typeof signature !== "string")
        return reply
          .status(401)
          .send({
            error: {
              code: "INVALID_SIGNATURE",
              message: "Webhook signature is required.",
            },
            requestId: request.id,
          });
      const secretKey = process.env.ENCRYPTION_KEY;
      if (!secretKey)
        return reply
          .status(503)
          .send({
            error: {
              code: "ENCRYPTION_NOT_CONFIGURED",
              message: "Webhook encryption is not configured.",
            },
            requestId: request.id,
          });
      const secret = decryptSecret(webhook.secretEncrypted, secretKey);
    const raw = typeof request.rawBody === "string" ? request.rawBody : request.rawBody?.toString("utf8") ?? JSON.stringify(request.body);
      if (!verifyWebhookSignature(raw, signature, secret))
        return reply
          .status(401)
          .send({
            error: {
              code: "INVALID_SIGNATURE",
              message: "Webhook signature is invalid.",
            },
            requestId: request.id,
          });
      const payload =
        typeof request.body === "object" ? request.body : JSON.parse(raw);
      const body = payload as { id?: string; type?: string };
      if (!body.type || !webhook.eventTypes.includes(body.type))
        return reply
          .status(400)
          .send({
            error: {
              code: "EVENT_NOT_ALLOWED",
              message: "Webhook event is not configured.",
            },
            requestId: request.id,
          });
      const event = await prisma.integrationEvent
        .create({
          data: {
            workspaceId: webhook.workspaceId,
            provider: "contentra",
            eventType: body.type,
            externalId: body.id,
            payload: payload as never,
          },
        })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error)) return null;
          throw error;
        });
      await prisma.webhook.update({
        where: { id },
        data: { lastDeliveryAt: new Date(), failureCount: 0 },
      });
      return reply.send({
        data: { accepted: true, duplicate: !event },
        requestId: request.id,
      });
    },
  );
}
