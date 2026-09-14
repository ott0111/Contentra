import type { ApiResponse } from '@contentra/types';
import { developmentPreviewResponse } from './development-preview';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiClientError extends Error {
  status: number;
  code: string;
  constructor(status:number, code:string, message:string){super(message);this.name='ApiClientError';this.status=status;this.code=code;}
}

export async function api<T>(path:string, init:RequestInit = {}, workspaceId?:string):Promise<T>{
  const preview = developmentPreviewResponse(path, init.method);
  if (preview !== undefined) return preview as T;
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type','application/json');
  if (workspaceId) headers.set('x-workspace-id', workspaceId);
  const response = await fetch(`${API_URL}${path}`, {...init, headers, credentials:'include', cache:'no-store'});
  const body = await response.json().catch(()=>null) as ApiResponse<T> | {error?:{code?:string;message?:string}} | null;
  if(!response.ok){
    const error=(body as {error?:{code?:string;message?:string}} | null)?.error;
    const authRoute = path.startsWith('/api/v1/auth/') || path === '/api/v1/auth/me';
    if(response.status===401 && typeof window !== 'undefined' && !authRoute && window.location.pathname !== '/login') {
      const next = `${window.location.pathname}${window.location.search}`;
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    }
    throw new ApiClientError(response.status,error?.code??'REQUEST_FAILED',error?.message??'The request could not be completed.');
  }
  return (body as ApiResponse<T>).data;
}

export const apiUrl = API_URL;
