export interface SocialIntegration{connect(input:unknown):Promise<void>;disconnect():Promise<void>;refresh():Promise<void>;getProfile():Promise<unknown>;getContent(cursor?:string):Promise<{items:unknown[];nextCursor?:string}>;getMetrics(input:unknown):Promise<unknown>;getAudience():Promise<unknown>;publish(input:unknown):Promise<{externalId?:string;status:string}>;getPublishStatus(externalId:string):Promise<{status:string}>}
export interface BusinessIntegration{customers(scope?:string):Promise<unknown[]>;leads(scope?:string):Promise<unknown[]>;products(scope?:string):Promise<unknown[]>;orders(scope?:string):Promise<unknown[]>;conversions(scope?:string):Promise<unknown[]>}
export interface Publisher{validate(input:unknown):Promise<void>;publish(input:unknown):Promise<{externalId:string;status:string}>;getStatus(externalId:string):Promise<{status:string}>;cancel(externalId:string):Promise<void>}
export * from './social.js';
export * from './storage.js';
