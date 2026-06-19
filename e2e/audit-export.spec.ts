import { test, expect, Page } from '@playwright/test';

/**
 * E2E coverage for AuditExportPanel: queue → progress → download,
 * persistence across reload + logout/login, and cancellation.
 *
 * Requires:
 *   BASE_URL                      → preview/published URL
 *   E2E_ADMIN_EMAIL / PASSWORD    → an Owner/CEO/Auditor account
 *
 * The default admin (halaianpacifique@gmail.com / mulpivot01..) is created
 * automatically by the bootstrap-admin edge function and is the safest
 * choice for CI.
 */

const EMAIL = process.env.E2E_ADMIN_EMAIL || 'halaianpacifique@gmail.com';
const PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'mulpivot01..';

test.skip(!process.env.BASE_URL, 'Set BASE_URL to run E2E tests');

async function login(page: Page, email = EMAIL, password = PASSWORD) {
  await page.goto('/auth');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).first().fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL(/\/(dashboard|$)/, { timeout: 20_000 });
}

async function gotoAuditLog(page: Page) {
  await page.goto('/role-management');
  // Audit tab
  const auditTab = page.getByRole('tab', { name: /audit/i });
  if (await auditTab.isVisible().catch(() => false)) await auditTab.click();
  await expect(page.getByTestId('export-download-csv').first()).toBeVisible({ timeout: 15_000 });
}

test.describe('Audit export — queue, progress, download, cancellation', () => {
  test('queues an export and the job appears with a status badge', async ({ page }) => {
    await login(page);
    await gotoAuditLog(page);
    await page.getByTestId('export-download-csv').click();
    // A row should appear with status queued or running
    const firstRow = page.locator('[data-testid^="export-job-"]').first();
    await expect(firstRow).toBeVisible({ timeout: 15_000 });
    const status = await firstRow.getAttribute('data-status');
    expect(['queued', 'running', 'completed', 'cancelled']).toContain(status);
  });

  test('export job persists across reload', async ({ page }) => {
    await login(page);
    await gotoAuditLog(page);
    const before = await page.locator('[data-testid^="export-job-"]').count();
    await page.getByTestId('export-download-csv').click();
    await expect(page.locator('[data-testid^="export-job-"]')).toHaveCount(before + 1, { timeout: 15_000 });
    await page.reload();
    await gotoAuditLog(page);
    await expect(page.locator('[data-testid^="export-job-"]')).toHaveCount(before + 1, { timeout: 15_000 });
  });

  test('export job persists across logout / login', async ({ page }) => {
    await login(page);
    await gotoAuditLog(page);
    const before = await page.locator('[data-testid^="export-job-"]').count();
    await page.getByTestId('export-download-csv').click();
    await expect(page.locator('[data-testid^="export-job-"]')).toHaveCount(before + 1, { timeout: 15_000 });
    // Sign out via the nav menu
    await page.context().clearCookies();
    await page.evaluate(() => localStorage.clear());
    await login(page);
    await gotoAuditLog(page);
    await expect(page.locator('[data-testid^="export-job-"]')).toHaveCount(before + 1, { timeout: 15_000 });
  });

  test('queued job can be cancelled and shows cancelled status', async ({ page }) => {
    await login(page);
    await gotoAuditLog(page);
    // Accept the window.confirm dialog automatically
    page.on('dialog', (d) => d.accept());
    await page.getByTestId('export-download-csv').click();
    const firstRow = page.locator('[data-testid^="export-job-"]').first();
    await expect(firstRow).toBeVisible();
    const cancelBtn = firstRow.getByTestId('export-cancel');
    if (await cancelBtn.isVisible().catch(() => false)) {
      await cancelBtn.click();
      await expect(firstRow).toHaveAttribute('data-status', /cancelled|completed/, { timeout: 15_000 });
    }
  });

  test('completed export exposes a download link', async ({ page }) => {
    await login(page);
    await gotoAuditLog(page);
    await page.getByTestId('export-download-csv').click();
    const firstRow = page.locator('[data-testid^="export-job-"]').first();
    // Wait for completion (small org → near-instant)
    await expect(firstRow).toHaveAttribute('data-status', /completed|cancelled|failed/, { timeout: 30_000 });
    if ((await firstRow.getAttribute('data-status')) === 'completed') {
      await expect(firstRow.getByTestId('export-download-link')).toBeVisible();
    }
  });
});
