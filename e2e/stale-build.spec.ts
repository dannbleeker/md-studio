import { expect, test } from '@playwright/test';
import { newDocument, textPane } from './helpers';

// The case the service worker can't cover: a page it doesn't control (a
// first visit, or no service worker at all) asking for a chunk that a
// deploy has since replaced.
test.use({ serviceWorkers: 'block' });

test('a lazy chunk missing after a deploy offers a reload instead of blanking the app', async ({
  page,
}) => {
  await page.route('**/assets/FindBar-*.js', (route) => route.fulfill({ status: 404 }));
  await newDocument(page);
  await page.keyboard.press('ControlOrMeta+F');
  await expect(page.getByText('MD Studio was updated. Reload to finish loading it.')).toBeVisible();
  await expect(textPane(page)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
});
