import type { WorkspaceRole, WorkspaceType } from '@contentra/types';
import { prisma } from '../db.js';

export async function createWorkspace(userId: string, input: { name: string; type: WorkspaceType }) {
  return prisma.workspace.create({ data: { name: input.name, type: input.type, ownerId: userId, members: { create: { userId, role: 'OWNER' } }, subscription: { create: { plan: { connect: { code: 'FREE' } }, status: 'ACTIVE' } }, aiCreditBalance: { create: { balance: 100 } } } });
}

export async function createDefaultWorkspace(userId: string, displayName?: string | null) {
  const name = displayName?.trim() ? `${displayName.trim()}'s workspace` : 'My workspace';
  return createWorkspace(userId, { name, type: 'CREATOR' });
}

export async function getMembership(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, include: { workspace: true } });
}

export async function assertMembership(userId: string, workspaceId: string) {
  const membership = await getMembership(userId, workspaceId);
  if (!membership) throw new Error('WORKSPACE_NOT_FOUND');
  return membership;
}

export async function changeRole(actorRole: WorkspaceRole, memberId: string, role: WorkspaceRole) {
  if (actorRole !== 'OWNER' && actorRole !== 'ADMIN') throw new Error('FORBIDDEN');
  return prisma.workspaceMember.update({ where: { id: memberId }, data: { role } });
}
