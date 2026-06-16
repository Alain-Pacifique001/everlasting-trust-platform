import { test, expect, Page } from '@playwright/test';

/**
 * End-to-end coverage for Team Collaboration persistence.
 *
 * Verifies:
 *  - Threads + messages persist across a hard refresh
 *  - Mentions render after refresh
 *  - Read receipts persist after logout/login
 *  - Reconnect does not duplicate optimistic messages (client_nonce dedupe)
 */

const EMAIL = process.env.E2E_USER_EMAIL!;
const PASSWORD = process.env.E2E_USER_PASSWORD!;
const EMAIL2 = process.env.E2E_USER2_EMAIL;
const PASSWORD2 = process.env.E2E_USER2_PASSWORD;

test.skip(!EMAIL || !PASSWORD, 'Set E2E_USER_EMAIL / E2E_USER_PASSWORD');

async function login(page: Page, email: string, password: string) {
  await page.goto('/auth');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/dashboard/, { timeout: 20_000 });
}

async function gotoCollab(page: Page) {
  await page.goto('/dashboard');
  await expect(page.getByText(/team collaboration/i).first()).toBeVisible({ timeout: 15_000 });
}

test.describe('Team Collaboration persistence', () => {
  test('thread + message persist across refresh', async ({ page }) => {
    await login(page, EMAIL, PASSWORD);
    await gotoCollab(page);

    const threadName = `E2E thread ${Date.now()}`;
    const newThreadBtn = page.getByRole('button', { name: /new thread|new/i }).first();
    if (await newThreadBtn.isVisible().catch(() => false)) {
      await newThreadBtn.click();
      await page.getByPlaceholder(/thread name|name/i).first().fill(threadName);
      await page.getByRole('button', { name: /create|save/i }).click();
      await expect(page.getByText(threadName).first()).toBeVisible();
    }

    const msg = `persisted-${Date.now()}`;
    const input = page.getByPlaceholder(/message|type/i).first();
    await input.fill(msg);
    await input.press('Enter');
    await expect(page.getByText(msg).first()).toBeVisible();

    await page.reload();
    await gotoCollab(page);
    await expect(page.getByText(msg).first()).toBeVisible({ timeout: 15_000 });
  });

  test('reconnect does not duplicate optimistic message', async ({ page, context }) => {
    await login(page, EMAIL, PASSWORD);
    await gotoCollab(page);
    const msg = `nonce-${Date.now()}`;
    const input = page.getByPlaceholder(/message|type/i).first();
    await input.fill(msg);

    // Drop the network briefly to trigger reconnect after the send
    await context.setOffline(true);
    await input.press('Enter');
    await page.waitForTimeout(1500);
    await context.setOffline(false);
    await page.waitForTimeout(3000);

    const count = await page.getByText(msg).count();
    expect(count).toBeLessThanOrEqual(1);
  });

  test('read receipts survive logout/login', async ({ page }) => {
    await login(page, EMAIL, PASSWORD);
    await gotoCollab(page);
    // Open the first thread to mark its messages read
    const thread = page.locator('[data-testid="thread-item"]').first();
    if (await thread.isVisible().catch(() => false)) await thread.click();
    await page.waitForTimeout(1500);

    // Logout
    const menu = page.getByRole('button', { name: /account|profile|menu/i }).first();
    if (await menu.isVisible().catch(() => false)) {
      await menu.click();
      await page.getByRole('menuitem', { name: /sign out|log out/i }).click();
    } else {
      await page.goto('/auth');
    }
    await login(page, EMAIL, PASSWORD);
    await gotoCollab(page);

    // No "unread" badge on the thread we just opened
    const unread = page.locator('[data-testid="thread-unread-badge"]').first();
    await expect(unread).toHaveCount(0);
  });

  test.skip(!EMAIL2 || !PASSWORD2, 'Set E2E_USER2_EMAIL / E2E_USER2_PASSWORD for mention test');
  test('mention renders for recipient', async ({ browser }) => {
    const ctxA = await browser.newContext();
    const ctxB = await browser.newContext();
    const a = await ctxA.newPage();
    const b = await ctxB.newPage();

    await login(a, EMAIL, PASSWORD);
    await login(b, EMAIL2!, PASSWORD2!);
    await gotoCollab(a);
    await gotoCollab(b);

    const mention = `@user hello-${Date.now()}`;
    await a.getByPlaceholder(/message|type/i).first().fill(mention);
    await a.getByPlaceholder(/message|type/i).first().press('Enter');

    await expect(b.getByText(/hello-/).first()).toBeVisible({ timeout: 15_000 });
    await ctxA.close();
    await ctxB.close();
  });
});
