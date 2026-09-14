import { DatabaseJobQueue, type JobHandler, type JobType } from "@contentra/processing";
import { prisma } from "./db.js";
import { sendPushToWorkspace } from "./services/push.js";

interface PushDeliveryPayload {
  workspaceId: string;
  userId?: string | null;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

async function cleanup() {
  const now = new Date();
  await prisma.session.deleteMany({ where: { expiresAt: { lte: now } } });
  await prisma.verificationToken.deleteMany({ where: { expiresAt: { lte: now } } });
  await prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lte: now } } });
  await prisma.opportunity.updateMany({
    where: { status: "NEW", expiresAt: { lte: now } },
    data: { status: "EXPIRED" as never },
  });
  await prisma.recommendation.updateMany({
    where: { status: "NEW", expiresAt: { lte: now } },
    data: { status: "EXPIRED" as never },
  });
  await prisma.nextBestAction.updateMany({
    where: { status: "NEW", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });
}

const handlers: Partial<Record<JobType, JobHandler>> = {
  push_delivery: async (payload) => {
    const p = payload as PushDeliveryPayload;
    if (!p?.workspaceId) throw new Error("INVALID_PUSH_PAYLOAD");
    const result = await sendPushToWorkspace(
      p.workspaceId,
      { title: p.title, body: p.body, data: p.data },
      { userId: p.userId ?? undefined },
    );
    if (result.status === "failed" && result.errors.length) {
      throw new Error(`PUSH_DELIVERY_FAILED:${result.errors.slice(0, 3).join(";")}`);
    }
  },
  cleanup: async () => {
    await cleanup();
  },
};

export const queue = new DatabaseJobQueue(prisma, handlers);

export async function enqueueJob(
  type: Parameters<typeof queue.enqueue>[0],
  payload: unknown,
  idempotencyKey: string,
  workspaceId?: string,
) {
  try {
    await queue.enqueue(type, payload, idempotencyKey, workspaceId);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") return;
    throw error;
  }
}