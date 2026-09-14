import type {WorkspaceContext,WorkspaceRole,Permission} from '@contentra/types';
import {assertCan} from '@contentra/core';
export interface MembershipRepository{findMembership(userId:string,workspaceId:string):Promise<{workspaceId:string;role:WorkspaceRole}|null>}
export async function resolveWorkspace(repo:MembershipRepository,userId:string,workspaceId:string):Promise<WorkspaceContext>{const m=await repo.findMembership(userId,workspaceId);if(!m)throw new Error('WORKSPACE_NOT_FOUND');return {userId,workspaceId,role:m.role}}
export function authorize(ctx:WorkspaceContext,p:Permission){assertCan(ctx.role,p)}
