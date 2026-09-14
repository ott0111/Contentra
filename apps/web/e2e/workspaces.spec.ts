import { test, expect } from '@playwright/test';
import { collectErrors, expectNoAppErrors, setupWorkspace } from './helpers';

async function openWorkspaces(page: import('@playwright/test').Page) {
  await page.goto('/app/settings/workspaces');
  await expect(page.getByRole('heading', { name: 'Workspaces' })).toBeVisible();
}

async function createWorkspaceUi(page: import('@playwright/test').Page, name: string) {
  await page.getByPlaceholder('My workspace').fill(name);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await expect(page.locator('section.card', { hasText: name })).toBeVisible();
}

test('workspace delete with the wrong typed name is rejected', async ({ page }) => {
  await setupWorkspace(page, 'QA Base', 'CREATOR');
  const errors = collectErrors(page);

  await openWorkspaces(page);
  await createWorkspaceUi(page, 'QA Delete Me');

  page.once('dialog', (d) => d.accept('not the name'));
  await page.locator('section.card', { hasText: 'QA Delete Me' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('The name you typed did not match. Nothing was deleted.')).toBeVisible();
  await expect(page.locator('section.card', { hasText: 'QA Delete Me' })).toBeVisible();

  await expectNoAppErrors(errors, page);
});

test('workspace delete with the correct typed name succeeds', async ({ page }) => {
  await setupWorkspace(page, 'QA Base', 'CREATOR');

  await openWorkspaces(page);
  await createWorkspaceUi(page, 'QA Delete Now');

  page.once('dialog', (d) => d.accept('QA Delete Now'));
  await page.locator('section.card', { hasText: 'QA Delete Now' }).getByRole('button', { name: 'Delete' }).click();
  await expect(page.locator('section.card', { hasText: 'QA Delete Now' })).toHaveCount(0);
});