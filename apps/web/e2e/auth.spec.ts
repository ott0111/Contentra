import { test, expect } from '@playwright/test';
import { API_URL, createUserViaApi, loginViaUi, signupViaUi } from './helpers';

test('unauthenticated app requests are gated by the client shell', async ({ page }) => {
  await page.goto('/app');
  await expect(page.getByRole('heading', { name: 'You need to sign in' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
});

test('root shows the landing page for unauthenticated visitors', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /operating system for creators/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create your free account' })).toBeVisible();
  expect(page.url()).not.toContain('/login');
});

test('signup creates a real session and enters onboarding', async ({ page }) => {
  const { email } = await signupViaUi(page);
  await expect(page.getByText('Step 1 of 10')).toBeVisible();
  const cookies = await page.context().cookies(API_URL);
  expect(cookies.some((c) => c.name === 'contentra_session')).toBe(true);
  expect(email).toBeTruthy();
});

test('invalid credentials are rejected without a session', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(`nobody-${Date.now()}@qa.contentra.local`);
  await page.getByLabel('Password').fill('WrongPassword!123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Email or password is incorrect.')).toBeVisible();
  expect(page.url()).toContain('/login');
  const cookies = await page.context().cookies(API_URL);
  expect(cookies.some((c) => c.name === 'contentra_session')).toBe(false);
});

test('valid login persists across reload', async ({ page }) => {
  const { email, password } = await createUserViaApi('login');
  await loginViaUi(page, email, password);
  await expect(page.getByText('Good to see you.')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Good to see you.')).toBeVisible();
  expect(page.url()).toContain('/app');
});

test('logout ends the session', async ({ page }) => {
  const { email, password } = await createUserViaApi('logout');
  await loginViaUi(page, email, password);
  await expect(page.getByText('Good to see you.')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('**/login*');
  const cookies = await page.context().cookies(API_URL);
  expect(cookies.some((c) => c.name === 'contentra_session')).toBe(false);
});