import { expect, type Page } from '@playwright/test';

export const API_URL = process.env.QA_API_URL ?? 'http://localhost:4000';
export const PASSWORD = 'LaunchReady!2026';

export function uniqueEmail(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@qa.contentra.local`;
}

export async function createUserViaApi(prefix: string, onboarded = true) {
  const email = uniqueEmail(prefix);
  let res: Response | undefined;
  for (let i = 0; i < 40; i++) {
    const attempt = await fetch(`${API_URL}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, name: prefix }),
    });
    if (attempt.status !== 429) {
      res = attempt;
      break;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  expect(res, 'signup should respond').toBeDefined();
  expect(res!.status).toBe(201);
  const setCookie = res!.headers.get('set-cookie') ?? '';
  const token = /contentra_session=([^;]+)/.exec(setCookie)?.[1] ?? '';
  expect(token, 'signup should set a session cookie').toBeTruthy();
  const body = (await res!.json()) as { data: { workspace: { id: string } } };
  const workspaceId = body.data.workspace?.id ?? '';
  expect(workspaceId, 'signup should provision a workspace server-side').toBeTruthy();
  if (onboarded) await completeOnboardingViaApi(token, workspaceId);
  return { email, password: PASSWORD, token: token!, workspaceId };
}

export async function completeOnboardingViaApi(token: string, workspaceId: string) {
  await fetch(`${API_URL}/api/v1/workspaces/${workspaceId}/onboarding`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', cookie: `contentra_session=${token}` },
    body: JSON.stringify({ currentStep: 9, completed: true }),
  });
}

export async function createWorkspaceViaApi(token: string, name: string, type: string) {
  const res = await fetch(`${API_URL}/api/v1/workspaces`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `contentra_session=${token}` },
    body: JSON.stringify({ name, type }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { data: { id: string; name: string; type: string } };
  return body.data;
}

export async function setupWorkspace(page: Page, name: string, type: string, prefix = 'shell') {
  const user = await createUserViaApi(prefix);
  const ws = await createWorkspaceViaApi(user.token, name, type);
  await page.context().addCookies([{ name: 'contentra_session', value: user.token, url: API_URL }]);
  await page.addInitScript((id) => localStorage.setItem('contentra_workspace', id), ws.id);
  return { token: user.token, workspaceId: ws.id };
}

export async function loginViaUi(page: Page, email: string, password: string, urlPattern = '**/app*') {
  await page.goto('/login');
  for (let i = 0; i < 40; i++) {
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    try {
      await page.waitForURL(urlPattern, { timeout: 4000 });
      return;
    } catch {
      // still on /login; likely the auth rate limiter (10/min/IP). Back off and retry.
      await page.waitForTimeout(1500);
    }
  }
  throw new Error(`login did not succeed for ${email}`);
}

export async function signupViaUi(page: Page, name = 'QA User') {
  const email = uniqueEmail('signup');
  await page.goto('/signup');
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  for (let i = 0; i < 40; i++) {
    await page.getByRole('button', { name: 'Create account' }).click();
    try {
      await page.waitForURL('**/onboarding', { timeout: 4000 });
      break;
    } catch {
      await page.waitForTimeout(1500);
    }
  }
  expect(page.url()).toContain('/onboarding');
  return { email, password: PASSWORD };
}

export const navLink = (page: Page, label: string) =>
  page.getByRole('navigation', { name: 'Main navigation' }).getByRole('link', { name: label });

export const activeNav = (page: Page, label: string) =>
  page.locator('nav.nav-pill a.active', { hasText: label });

export function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/favicon|ERR_ABORTED|Failed to load resource/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

export async function expectNoAppErrors(errors: string[], page: Page) {
  await page.waitForLoadState('networkidle').catch(() => undefined);
  expect(errors, 'no uncaught page/console errors').toEqual([]);
}