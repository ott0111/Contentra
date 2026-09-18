import { test, expect } from '@playwright/test';
import { activeNav, collectErrors, expectNoAppErrors, navLink, setupWorkspace } from './helpers';

const NAV = ['Home', 'Creatos', 'Inspiration', 'Create', 'Content', 'Library', 'Calendar', 'Analytics'];

test('security headers are served with the app', async ({ request }) => {
  const res = await request.get('/login');
  expect(res.headers()['x-content-type-options']).toBe('nosniff');
  expect(res.headers()['x-frame-options']).toBe('DENY');
  expect(res.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(res.headers()['permissions-policy']).toContain('camera=()');
});

test('main navigation and deep links render without errors', async ({ page }) => {
  await setupWorkspace(page, 'QA Shell', 'CREATOR');
  const errors = collectErrors(page);

  await page.goto('/app');
  await expect(navLink(page, 'Home')).toBeVisible();

  for (const label of NAV) {
    await navLink(page, label).click();
    await expect(activeNav(page, label)).toHaveCount(1);
    await expect(page.locator('button.workspace')).toBeVisible();
  }

  await expectNoAppErrors(errors, page);
});

test('deep link to a missing content item shows a controlled empty state', async ({ page }) => {
  await setupWorkspace(page, 'QA Shell', 'CREATOR');
  const errors = collectErrors(page);

  const id = '00000000-0000-4000-8000-000000000000';
  const errorRes = await page.request.get(`/app/content/${id}`);
  expect(errorRes.status()).toBe(200);

  await page.goto(`/app/content/${id}`);
  await expect(navLink(page, 'Content')).toBeVisible();
  expect(page.url()).toContain(`/app/content/${id}`);
  await expect(page.getByText('Content is unavailable')).toBeVisible();

  await expectNoAppErrors(errors, page);
});

test('browser back and forward keep app state', async ({ page }) => {
  await setupWorkspace(page, 'QA Shell', 'CREATOR');

  await page.goto('/app');
  await navLink(page, 'Creatos').click();
  await page.waitForURL('**/creatos');
  await page.goBack();
  await page.waitForURL('**/app');
  await page.goForward();
  await page.waitForURL('**/creatos');
  await expect(activeNav(page, 'Creatos')).toHaveCount(1);
});

test('Ctrl/Cmd+K opens and closes the search dialog', async ({ page }) => {
  await setupWorkspace(page, 'QA Shell', 'CREATOR');

  await page.goto('/app');
  const dialog = page.getByRole('dialog', { name: 'Search content' });
  await page.keyboard.press('Control+k');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});