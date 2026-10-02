import { expect, type Page, test } from '@playwright/test';
import { newDocument, setText, textContent, textPane, visualPane } from './helpers';

/** Dispatches a paste or drop carrying a small generated PNG at `selector`. */
async function sendImage(page: Page, selector: string, kind: 'paste' | 'drop') {
  await page.evaluate(
    async ([sel, k]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 40;
      canvas.height = 20;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#3d5170';
      ctx.fillRect(0, 0, 40, 20);
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/png'));
      const data = new DataTransfer();
      data.items.add(new File([blob], 'diagram.png', { type: 'image/png' }));
      const target = document.querySelector(sel!)!;
      const rect = target.getBoundingClientRect();
      const event =
        k === 'paste'
          ? new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
          : new DragEvent('drop', {
              dataTransfer: data,
              bubbles: true,
              cancelable: true,
              clientX: rect.left + 10,
              clientY: rect.top + 10,
            });
      target.dispatchEvent(event);
    },
    [selector, kind]
  );
}

test('an image pasted into the text pane is embedded and shows in the visual pane', async ({
  page,
}) => {
  await newDocument(page);
  await setText(page, 'Before\n\n');
  await textPane(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await sendImage(page, '[data-testid="text-editor"] .cm-content', 'paste');
  await expect.poll(() => textContent(page)).toMatch(/!\[diagram\]\(data:image\/png;base64,/);
  await expect(visualPane(page).locator('img:not(.ProseMirror-separator)')).toHaveAttribute(
    'src',
    /^data:image\/png/
  );
});

test('an image dropped on the visual pane becomes an image node and Markdown', async ({ page }) => {
  await newDocument(page);
  await setText(page, 'A paragraph.\n');
  await expect(visualPane(page).locator('p')).toHaveText('A paragraph.');
  await sendImage(page, '[data-testid="visual-editor"] .ProseMirror p', 'drop');
  await expect(visualPane(page).locator('img:not(.ProseMirror-separator)')).toHaveAttribute(
    'alt',
    'diagram'
  );
  await expect.poll(() => textContent(page)).toMatch(/!\[diagram\]\(data:image\/png;base64,/);
});

test('dropping a non-Markdown file outside the editors does not navigate away', async ({
  page,
}) => {
  await newDocument(page);
  await sendImage(page, '.toolbar', 'drop');
  await expect(page).toHaveURL(/localhost:4173\/$/);
  await expect(textPane(page)).toBeVisible();
});
