import { expect, type Page, test } from '@playwright/test';
import { visualPane } from './helpers';

/*
 * Folder mode: a folder opened to browse its notes. The folder lives in the
 * browser's origin private file system (real handles, no picker), with
 * window.showDirectoryPicker replaced by a stub, as in embeds-vault.spec.ts.
 */

type FolderWindow = Window & {
  __dirs: FileSystemDirectoryHandle[];
  __root: FileSystemDirectoryHandle;
};

/** In-memory stand-in for handleStore's IndexedDB (see embeds-vault.spec.ts for why). */
function fakeIndexedDb() {
  const data = new Map<string, unknown>();
  const done = (result: unknown) => {
    const req: { result: unknown; onsuccess: (() => void) | null } = { result, onsuccess: null };
    setTimeout(() => req.onsuccess?.(), 0);
    return req;
  };
  const store = {
    get: (key: string) => done(data.get(String(key))),
    put: (value: unknown, key: string) => {
      data.set(String(key), value);
      return done(key);
    },
    delete: (key: string) => {
      data.delete(String(key));
      return done(undefined);
    },
    getAll: () => done([...data.values()]),
    getAllKeys: () => done([...data.keys()]),
  };
  const database = {
    createObjectStore: () => store,
    transaction: () => ({ objectStore: () => store }),
  };
  Object.defineProperty(window, 'indexedDB', {
    value: {
      open: () => {
        const req: {
          result: unknown;
          onupgradeneeded: (() => void) | null;
          onsuccess: (() => void) | null;
        } = { result: database, onupgradeneeded: null, onsuccess: null };
        setTimeout(() => {
          req.onupgradeneeded?.();
          req.onsuccess?.();
        }, 0);
        return req;
      },
    },
    configurable: true,
  });
}

const FILES: Record<string, string> = {
  'Notes/Index.md': '# Index\n\nSee [[Alpha]] and [Beta](Beta.md).',
  'Notes/Alpha.md': '# Alpha\n\nBack to [[Index]].',
  'Notes/Beta.md': '# Beta\n\nJust text.',
  'Other/Gamma.md': '# Gamma\n\nLinks to [[Alpha]] too. Data: [the sheet](data.csv).',
  'Other/data.csv': 'a,b\n1,2\n',
  'img/pic.png': 'not a note',
};

async function setUp(page: Page) {
  await page.addInitScript(fakeIndexedDb);
  await page.goto('/');
  await page.evaluate(async (files) => {
    const w = window as unknown as FolderWindow;
    const opfs = await navigator.storage.getDirectory();
    await opfs.removeEntry('notes-folder', { recursive: true }).catch(() => {});
    const root = await opfs.getDirectoryHandle('notes-folder', { create: true });
    for (const [path, text] of Object.entries(files)) {
      const parts = path.split('/');
      const file = parts.pop() as string;
      let dir = root;
      for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
      const writable = await (await dir.getFileHandle(file, { create: true })).createWritable();
      await writable.write(text);
      await writable.close();
    }
    w.__root = root;
    w.__dirs = [root];
    w.showDirectoryPicker = async () => w.__dirs.shift() ?? w.__root;
  }, FILES);
}

const panel = (page: Page) => page.getByRole('navigation', { name: 'Folder' });

test('browse a folder, open notes, see what links here, go back', async ({ page }) => {
  await setUp(page);
  await page.getByRole('button', { name: 'Open folder', exact: true }).click();

  // The tree lists notes only: folders first, no image.
  await expect(panel(page).getByRole('treeitem', { name: /Notes/ })).toBeVisible();
  await expect(panel(page).getByRole('treeitem', { name: /Other/ })).toBeVisible();
  await expect(panel(page).getByText('pic')).toHaveCount(0);
  await panel(page).getByRole('treeitem', { name: /Notes/ }).click();
  await panel(page).getByRole('treeitem', { name: 'Alpha', exact: true }).click();
  await expect(visualPane(page).locator('h1')).toContainText('Alpha');
  await expect(page.locator('.file-name')).toContainText('Alpha.md');

  // Notes that link here, read from the folder: Index and Gamma, not Beta.
  const linked = panel(page).getByRole('region', { name: 'Linked from' });
  await expect(linked.getByRole('button', { name: 'Notes/Index' })).toBeVisible();
  await expect(linked.getByRole('button', { name: 'Other/Gamma' })).toBeVisible();
  await expect(linked.getByRole('button', { name: 'Notes/Beta' })).toHaveCount(0);

  // Open one of them: now there is a way back.
  await linked.getByRole('button', { name: 'Notes/Index' }).click();
  await expect(visualPane(page).locator('h1')).toContainText('Index');
  await expect(page.getByRole('button', { name: 'Back', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(visualPane(page).locator('h1')).toContainText('Alpha');
  await expect(page.getByRole('button', { name: 'Forward', exact: true })).toBeEnabled();
  await page.keyboard.press('Alt+ArrowRight');
  await expect(visualPane(page).locator('h1')).toContainText('Index');
});

test('the filter finds a note by name, and links in Read view open other notes', async ({
  page,
}) => {
  await setUp(page);
  await page.getByRole('button', { name: 'Open folder', exact: true }).click();
  await panel(page).getByRole('searchbox', { name: 'Filter notes' }).fill('gam');
  await panel(page).getByRole('button', { name: 'Other/Gamma' }).click();
  await expect(visualPane(page).locator('h1')).toContainText('Gamma');

  await page.getByRole('button', { name: 'Read', exact: true }).click();
  // The wikilink resolves through the folder, which the note found by itself.
  await visualPane(page).locator('.md-wikilink').click();
  await expect(visualPane(page).locator('h1')).toContainText('Alpha');
  await expect(page.locator('.file-name')).toContainText('Alpha.md');
});

test('a link to a file that is not a note saves it from Read view', async ({ page }) => {
  await setUp(page);
  await page.getByRole('button', { name: 'Open folder', exact: true }).click();
  await panel(page).getByRole('searchbox', { name: 'Filter notes' }).fill('gam');
  await panel(page).getByRole('button', { name: 'Other/Gamma' }).click();
  await page.getByRole('button', { name: 'Read', exact: true }).click();
  const download = page.waitForEvent('download');
  await visualPane(page).getByRole('link', { name: 'the sheet' }).click();
  expect((await download).suggestedFilename()).toBe('data.csv');
});

test('the folder tree works from the keyboard', async ({ page }) => {
  await setUp(page);
  await page.getByRole('button', { name: 'Open folder', exact: true }).click();
  const tree = panel(page).getByRole('tree');
  const notes = tree.getByRole('treeitem', { name: 'Notes', exact: true });
  await expect(notes).toHaveAttribute('aria-expanded', 'false');

  // One row is in the tab order; Right opens the folder, Right again enters it.
  await notes.focus();
  await page.keyboard.press('ArrowRight');
  await expect(notes).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowRight');
  const alpha = tree.getByRole('treeitem', { name: 'Alpha', exact: true });
  await expect(alpha).toBeFocused();
  await expect(alpha).toHaveAttribute('aria-level', '2');
  await page.keyboard.press('ArrowDown');
  await expect(tree.getByRole('treeitem', { name: 'Beta', exact: true })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(notes).toBeFocused();
  await page.keyboard.press('End');
  await expect(tree.getByRole('treeitem').last()).toBeFocused();

  // Enter opens a note; Left from a note climbs to its folder, then closes it.
  await alpha.focus();
  await page.keyboard.press('Enter');
  await expect(visualPane(page).locator('h1')).toContainText('Alpha');
  await expect(alpha).toHaveAttribute('aria-selected', 'true');
  await alpha.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(notes).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(notes).toHaveAttribute('aria-expanded', 'false');
});
