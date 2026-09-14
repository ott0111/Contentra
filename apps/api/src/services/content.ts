import type { ContentStatus } from "@contentra/types";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";

export async function listContent(workspaceId: string, status?: ContentStatus) {
  return prisma.content.findMany({
    where: { workspaceId, ...(status ? { status } : {}) },
    orderBy: { updatedAt: "desc" },
    include: { assets: true, campaign: true },
  });
}

export async function createContent(
  workspaceId: string,
  authorId: string,
  input: {
    title?: string;
    description?: string;
    format: string;
    platform: string;
    caption?: string;
    script?: string;
  },
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const content = await tx.content.create({
      data: { workspaceId, authorId, ...input, tags: [], status: "DRAFT" },
    });
    await tx.contentVersion.create({
      data: {
        contentId: content.id,
        version: 1,
        title: content.title,
        caption: content.caption,
        script: content.script,
        createdById: authorId,
      },
    });
    return content;
  });
}

export async function updateContent(
  workspaceId: string,
  contentId: string,
  input: Record<string, unknown>,
) {
  const current = await prisma.content.findFirst({
    where: { id: contentId, workspaceId },
  });
  if (!current) throw new Error("CONTENT_NOT_FOUND");
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const content = await tx.content.update({
      where: { id: contentId },
      data: input as never,
    });
    const latest = await tx.contentVersion.findFirst({
      where: { contentId },
      orderBy: { version: "desc" },
    });
    await tx.contentVersion.create({
      data: {
        contentId,
        version: (latest?.version ?? 0) + 1,
        title: content.title,
        caption: content.caption,
        script: content.script,
      },
    });
    return content;
  });
}
