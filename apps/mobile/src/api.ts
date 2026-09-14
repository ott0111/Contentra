import * as SecureStore from 'expo-secure-store';
import type { WorkspaceRole, WorkspaceType } from '@contentra/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

export type Workspace = { id: string; name: string; type: WorkspaceType };
export type Membership = { workspaceId: string; role: WorkspaceRole; workspace: Workspace };

const SESSION_KEY = 'contentra_session';
const WORKSPACE_KEY = 'contentra_workspace';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function parseSetCookie(setCookie: string | null | undefined): string | null {
  const header = (Array.isArray(setCookie) ? setCookie[0] : setCookie) ?? '';
  const match = header.match(/(?:^|,\s*)contentra_session=([^;]+)/i)?.[1] ?? null;
  const raw = header.match(/contentra_session=([^;]+)/i)?.[1];
  return raw ? decodeURIComponent(raw.trim()) : match;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  workspaceId?: string,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set('content-type', 'application/json');
  if (workspaceId) headers.set('x-workspace-id', workspaceId);
  const token = await SecureStore.getItemAsync(SESSION_KEY);
  // React Native fetch has no cookie jar; the API's HttpOnly session cookie is
  // replayed explicitly from SecureStore on every request.
  if (token) headers.set('cookie', `contentra_session=${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  const setCookie = response.headers.get('set-cookie');
  const session = parseSetCookie(setCookie);
  if (setCookie && session) await SecureStore.setItemAsync(SESSION_KEY, session);

  let body: { data?: T; error?: { message?: string } } | null = null;
  try {
    body = (await response.json()) as { data?: T; error?: { message?: string } };
  } catch {
    body = null;
  }

  if (response.status === 401) {
    // The session is invalid or expired; force the sign-in screen on the next render.
    await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => undefined);
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error?.message ??
        (response.status === 401 ? 'Sign in required.' : 'The request could not be completed.'),
    );
  }
  return body?.data as T;
}

export const api = Object.assign(request, {
  getWorkspaceId: () => SecureStore.getItemAsync(WORKSPACE_KEY),
  setWorkspaceId: (id: string | null) =>
    id
      ? SecureStore.setItemAsync(WORKSPACE_KEY, id)
      : SecureStore.deleteItemAsync(WORKSPACE_KEY),
  hasSession: () => SecureStore.getItemAsync(SESSION_KEY),
  clearSession: () => SecureStore.deleteItemAsync(SESSION_KEY),
});

export { ApiError, API_URL };