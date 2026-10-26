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
  'Other/Host.md': '# Host\n\n![[Formulas]]\n',
  'Other/Formulas.md': '> [!warning] Careful\n> Mind the gap, $x^2$ and a price of $5.\n',
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

  // A note from the folder opens in Read view.
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
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
  // A note from the folder opens in Read view.
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
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

test.describe('on a phone', () => {
  test.use({ viewport: { width: 360, height: 740 }, hasTouch: true });

  test('the folder is a drawer that closes on a pick, and a swipe goes back', async ({ page }) => {
    await setUp(page);
    await page.getByRole('button', { name: 'Open folder', exact: true }).click();
    const drawer = panel(page);
    await expect(drawer).toBeVisible();
    // It slides over the document instead of squeezing it, and the page does not scroll sideways.
    await expect(drawer).toHaveCSS('position', 'fixed');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360
    );

    // A row is a comfortable touch target.
    const other = drawer.getByRole('treeitem', { name: /Other/ });
    expect((await other.locator('.folder-item').boundingBox())?.height).toBeGreaterThanOrEqual(40);

    // Tapping the backdrop puts it away.
    await page
      .getByRole('button', { name: 'Close the side panel' })
      .click({ position: { x: 340, y: 400 } });
    await expect(drawer).toBeHidden();
    await page.getByRole('button', { name: 'Menu', exact: true }).click();
    await page.getByRole('menuitemradio', { name: 'Folder' }).click();
    await expect(drawer).toBeVisible();

    // Picking a note opens it and the drawer leaves.
    await drawer.getByRole('searchbox', { name: 'Filter notes' }).fill('gam');
    await drawer.getByRole('button', { name: 'Other/Gamma' }).click();
    await expect(visualPane(page).locator('h1')).toContainText('Gamma');
    await expect(drawer).toBeHidden();

    // In Read view a link opens Alpha, and a swipe to the right goes back to Gamma.
    // A note from the folder opens in Read view.
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    // The Read view buttons still fit a 360px toolbar.
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      360
    );
    await visualPane(page).locator('.md-wikilink').click();
    await expect(visualPane(page).locator('h1')).toContainText('Alpha');
    const swipe = (from: number, to: number) =>
      page.evaluate(
        ([a, b]) => {
          const target = document.querySelector('.ProseMirror p') ?? document.body;
          const touch = (x: number) =>
            new Touch({ identifier: 1, target, clientX: x, clientY: 300 });
          const fire = (type: string, x: number | null) =>
            target.dispatchEvent(
              new TouchEvent(type, {
                bubbles: true,
                cancelable: true,
                touches: x === null ? [] : [touch(x)],
                changedTouches: [touch(x ?? (b as number))],
              })
            );
          fire('touchstart', a as number);
          fire('touchend', null);
        },
        [from, to]
      );
    await swipe(60, 240);
    await expect(visualPane(page).locator('h1')).toContainText('Gamma');
    await swipe(260, 60);
    await expect(visualPane(page).locator('h1')).toContainText('Alpha');
  });
});

test('a note shown inside another typesets its formulas and callouts', async ({ page }) => {
  await setUp(page);
  await page.getByRole('button', { name: 'Open folder', exact: true }).click();
  await panel(page).getByRole('searchbox', { name: 'Filter notes' }).fill('host');
  await panel(page).getByRole('button', { name: 'Other/Host' }).click();
  // A note from the folder opens in Read view.
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  const shown = visualPane(page).locator('.md-transclusion');
  await expect(shown.locator('blockquote.callout-warning .callout-title')).toHaveText('Careful');
  await expect(shown.locator('math')).toHaveCount(1);
  await expect(shown).toContainText('a price of $5.');
});
