import type { Page } from '@playwright/test';

export const textPane = (page: Page) => page.getByTestId('text-editor').locator('.cm-content');
export const visualPane = (page: Page) => page.getByTestId('visual-editor').locator('.ProseMirror');

/** Opens a fresh, empty document from the start screen. */
export async function newDocument(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('button', { name: 'New document' }).click();
  await textPane(page).waitFor();
  await visualPane(page).waitFor();
}

/** Replaces the text pane's content without CodeMirror's typing helpers (auto-close, indent). */
export async function setText(page: Page, markdown: string): Promise<void> {
  await textPane(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.insertText(markdown);
}

export async function textContent(page: Page): Promise<string> {
  return page.getByTestId('text-editor').evaluate((el) =>
    Array.from(el.querySelectorAll('.cm-line'))
      .map((l) => l.textContent ?? '')
      .join('\n')
  );
}
