import { test, expect } from '@playwright/test';

test('landing page renders for logged-out visitors and tracks a funnel event', async ({ page }) => {
  const funnel: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/v1/public/funnel-events')) funnel.push(request.method());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /operating system for creators/i })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Create your free account' })).toBeVisible();
  await expect(page.getByLabel('Website URL')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Analyze website' })).toBeVisible();

  await expect.poll(() => funnel.length, { timeout: 15_000 }).toBeGreaterThan(0);
  expect(funnel).toContain('POST');
});

test('landing analyzer shows a real result or an honest error', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Website URL')).toBeVisible();
  await page.getByLabel('Website URL').fill('https://example.com');

  const responsePromise = page.waitForResponse(
    (response) => response.url().includes('/api/v1/public/analyze-url'),
    { timeout: 40_000 },
  );
  await page.getByRole('button', { name: 'Analyze website' }).click();
  const response = await responsePromise;

  if (response.ok()) {
    await expect(page.getByTestId('analyzer-result')).toBeVisible();
    await expect(page.getByText(/min read/)).toBeVisible();
  } else {
    await expect(page.getByRole('alert')).toBeVisible();
  }
});
