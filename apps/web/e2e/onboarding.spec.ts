import { test, expect } from '@playwright/test';
import { createUserViaApi, loginViaUi, setupWorkspace, signupViaUi } from './helpers';

test('fresh account completes onboarding end to end', async ({ page }) => {
  await signupViaUi(page);
  await expect(page.getByText('Step 1 of 10')).toBeVisible();

  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Step 2 of 10')).toBeVisible();
  await page.getByRole('button', { name: 'Creator' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Step 3 of 10')).toBeVisible();
  await page.getByPlaceholder(/^Describe it naturally/).fill('QA niche: short-form content for independent cafes');
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByText('Step 4 of 10')).toBeVisible();
  await page.getByRole('button', { name: 'Grow audience' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();

  for (let s = 5; s <= 9; s++) {
    await expect(page.getByText(`Step ${s} of 10`)).toBeVisible();
    await page.getByRole('button', { name: 'Continue' }).click();
  }
  await expect(page.getByText('Step 10 of 10')).toBeVisible();
  await page.getByRole('link', { name: 'Open Create' }).click();
  await page.waitForURL('**/app/create');
  await expect(page.getByRole('heading', { name: 'Create new content' })).toBeVisible();

  const stored = await page.evaluate(() => localStorage.getItem('contentra_workspace'));
  expect(stored).toBeTruthy();
});

test('onboarding progress is saved and restored after refresh', async ({ page }) => {
  await signupViaUi(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Step 2 of 10')).toBeVisible();
  await page.getByRole('button', { name: 'Creator' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('Step 3 of 10')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Step 3 of 10')).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Creator' })).toHaveClass(/selected/);
});

test('returning users land in the app, not onboarding', async ({ page }) => {
  const { email, password } = await createUserViaApi('returner');
  await loginViaUi(page, email, password);
  expect(page.url()).toContain('/app');
  await expect(page.getByText('Good to see you.')).toBeVisible();
  expect(page.url()).not.toContain('/onboarding');
});

test('workspace type decides Business OS visibility', async ({ page }) => {
  await setupWorkspace(page, 'QA Business', 'BUSINESS', 'biz');
  await page.goto('/app');
  await expect(page.locator('button.workspace')).toContainText('QA Business');
  await page.locator('button.workspace').click();
  await expect(page.getByRole('link', { name: 'Business OS' })).toBeVisible();
  await page.getByRole('link', { name: 'Business OS' }).click();
  await page.waitForURL('**/app/business/overview');
  expect(page.url()).toContain('/app/business/overview');
});

test('creator workspace hides Business OS', async ({ page }) => {
  await setupWorkspace(page, 'QA Creator Space', 'CREATOR', 'lone');
  await page.goto('/app');
  await expect(page.locator('button.workspace')).toContainText('QA Creator Space');
  await page.locator('button.workspace').click();
  await expect(page.getByRole('link', { name: 'Business OS' })).toHaveCount(0);
});