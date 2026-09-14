export type WorkspaceType = 'CREATOR'|'PERSONAL_BRAND'|'BUSINESS'|'AGENCY';
export type WorkspaceRole = 'OWNER'|'ADMIN'|'MEMBER'|'VIEWER';
export type ContentStatus = 'IDEA'|'DRAFT'|'READY'|'SCHEDULED'|'PUBLISHED'|'FAILED'|'ARCHIVED';
export type OpportunityStatus = 'NEW'|'SAVED'|'SKIPPED'|'ACTED_ON'|'EXPIRED';
export type RecommendationStatus = 'NEW'|'DISMISSED'|'ACTED_ON'|'EXPIRED';
export type NextBestActionType = 'CREATE'|'PUBLISH'|'IMPROVE'|'DISCOVER'|'ANALYZE'|'REPURPOSE'|'REVIEW'|'CONNECT';
export type Permission = `${string}.${string}`;
export interface WorkspaceContext { userId:string; workspaceId:string; role:WorkspaceRole; }
export interface ApiError { code:string; message:string; details?:unknown; }
export interface ApiResponse<T> { data:T; requestId:string; }
