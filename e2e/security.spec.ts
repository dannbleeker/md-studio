import { expect, type Page, test } from '@playwright/test';
import { newDocument, setText, textContent, visualPane } from './helpers';

/** Collects Content Security Policy violations reported on the page. */
async function cspViolations(page: Page): Promise<string[]> {
  const found: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy/i.test(m.text())) found.push(m.text());
  });
  return found;
}

test('the dashboard links only to GitHub, whatever the API returns, and runs under its CSP', async ({
  page,
}) => {
  const violations = await cspViolations(page);
  const dialogs: string[] = [];
  page.on('dialog', (d) => {
    dialogs.push(d.message());
    void d.dismiss();
  });
  await page.route('https://api.github.com/**/actions/runs*', (route) =>
    route.fulfill({
      json: {
        workflow_runs: [
          {
            name: '<img src=x onerror=alert(1)>',
            html_url: 'javascript:alert(1)',
            status: 'completed',
            conclusion: 'success',
            updated_at: '2026-01-01T00:00:00Z',
          },
          {
            name: 'CI',
            html_url: 'https://github.com/dannbleeker/md-studio/actions/runs/1',
            status: 'completed',
            conclusion: 'success',
            updated_at: '2026-01-01T00:00:00Z',
          },
        ],
      },
    })
  );
  await page.route('https://api.github.com/**/commits*', (route) =>
    route.fulfill({
      json: [
        {
          sha: 'abcdef1234567',
          html_url: 'javascript:alert(2)',
          commit: { message: '<b>bold</b>', author: { date: '2026-01-01T00:00:00Z' } },
        },
      ],
    })
  );
  await page.goto('/dashboard.html');
  const runs = page.locator('#runs a');
  await expect(runs).toHaveCount(2);
  await expect(runs.first()).toHaveAttribute('href', '#');
  await expect(runs.first()).toHaveText('<img src=x onerror=alert(1)>');
  await expect(runs.nth(1)).toHaveAttribute('href', /^https:\/\/github\.com\//);
  await expect(page.locator('#commits a')).toHaveAttribute('href', '#');
  await runs.first().click();
  expect(dialogs).toEqual([]);
  expect(violations).toEqual([]);
});

test('the app runs under its CSP without violations, and sends no referrer with images', async ({
  page,
}) => {
  const violations = await cspViolations(page);
  await page.goto('/');
  await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveCount(1);
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  await page.getByRole('button', { name: 'Try the sample document' }).click();
  await expect(page.getByTestId('visual-editor').locator('h1')).toBeVisible();
  expect(violations).toEqual([]);
});

test('a document too deeply nested to parse leaves the visual pane inert, not broken', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const deep = `${'>'.repeat(3000)} deep`;
  const pane = page.getByTestId('visual-editor');
  await newDocument(page);
  await setText(page, '# Before');
  await expect(visualPane(page).locator('h1')).toHaveText('Before');

  await setText(page, deep);
  await expect(page.getByText(/nested too deeply for the visual pane/)).toBeVisible();
  await expect(pane).toHaveJSProperty('inert', true);
  // The stale tree is never written back over the Markdown.
  expect(await textContent(page)).toBe(deep);

  // Stored that way, the document still opens after a reload.
  await page.waitForTimeout(600);
  await page.reload();
  await expect(page.getByText(/nested too deeply for the visual pane/)).toBeVisible();
  expect(await textContent(page)).toBe(deep);

  await setText(page, '# Fixed');
  await expect(visualPane(page).locator('h1')).toHaveText('Fixed');
  await expect(pane).toHaveJSProperty('inert', false);
  expect(errors).toEqual([]);
});
