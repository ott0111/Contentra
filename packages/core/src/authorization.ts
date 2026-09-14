import type { Permission, WorkspaceRole } from '@contentra/types';
const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly Permission[]> = {
 OWNER:['workspace.read','workspace.update','workspace.delete','members.read','members.invite','members.remove','content.read','content.create','content.update','content.delete','content.publish','analytics.read','brand.read','brand.update','billing.read','billing.manage','integrations.read','integrations.manage','api.manage','campaigns.manage'],
 ADMIN:['workspace.read','workspace.update','members.read','members.invite','members.remove','content.read','content.create','content.update','content.delete','content.publish','analytics.read','brand.read','brand.update','billing.read','billing.manage','integrations.read','integrations.manage','api.manage','campaigns.manage'],
 MEMBER:['workspace.read','members.read','content.read','content.create','content.update','content.publish','analytics.read','brand.read','brand.update','integrations.read','campaigns.manage'],
 VIEWER:['workspace.read','content.read','analytics.read','brand.read']};
export function can(role:WorkspaceRole,p:Permission){return ROLE_PERMISSIONS[role].includes(p)}
export function assertCan(role:WorkspaceRole,p:Permission){if(!can(role,p))throw new AuthorizationError('FORBIDDEN',`Missing permission: ${p}`)}
export class AuthorizationError extends Error{constructor(public code:string,message:string){super(message);this.name='AuthorizationError'}}
