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

/** Leaves Read view, where files open, for the editing layout last used. */
export async function edit(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await textPane(page).waitFor();
}

/** Runs a command from the toolbar's ☰ menu (New document, Export…, Settings…). */
export async function menu(page: Page, item: string | RegExp): Promise<void> {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: item }).click();
}

/** Clicks a button of the visual pane's format toolbar, showing the rarer ones first. */
export async function moreFormatting(page: Page): Promise<void> {
  const more = page.getByRole('button', { name: 'More formatting' });
  if ((await more.getAttribute('aria-expanded')) !== 'true') await more.click();
}

/** Switches to an editing layout, from Read view too (where only Edit is offered). */
export async function layout(page: Page, name: 'Split' | 'Markdown' | 'Visual'): Promise<void> {
  const edit = page.getByRole('button', { name: 'Edit', exact: true });
  if (await edit.isVisible()) await edit.click();
  await page.getByRole('button', { name, exact: true }).click();
}
