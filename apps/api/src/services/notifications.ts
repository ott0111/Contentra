import { prisma } from "../db.js";
import { enqueueJob } from "../jobs.js";

export interface CreateNotificationInput {
  workspaceId: string;
  userId?: string | null;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** When true, a push_delivery job is enqueued for ACTIVE devices in the workspace. */
  push?: boolean;
}

export async function createNotification(input: CreateNotificationInput) {
  const record = await prisma.notification.create({
    data: {
      workspaceId: input.workspaceId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data === undefined ? undefined : (input.data as never),
    },
  });
  if (input.push) {
    await enqueueJob(
      "push_delivery",
      {
        workspaceId: input.workspaceId,
        userId: input.userId ?? null,
        title: input.title,
        body: input.body,
        data: input.data,
      },
      `push:${record.id}`,
      input.workspaceId,
    );
  }
  return record;
}