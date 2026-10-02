// Renders public/favicon.svg to the PNG icons the PWA manifest lists.
// Run after changing the SVG: `node scripts/generate-icons.mjs`.
// Uses Playwright's Chromium; set PLAYWRIGHT_CHROMIUM_PATH to reuse a
// preinstalled browser.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public', 'favicon.svg'), 'utf8');
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

const targets = [
  { file: 'icon-192.png', size: 192, padding: 0 },
  { file: 'icon-512.png', size: 512, padding: 0 },
  // Maskable icons need the glyph inside the central 80% safe zone.
  { file: 'icon-512-maskable.png', size: 512, padding: 0.12 },
];

for (const { file, size, padding } of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inset = Math.round(size * padding);
  await page.setContent(
    `<html><body style="margin:0;background:${padding ? '#3d5170' : 'transparent'}">
      <div style="padding:${inset}px;width:${size}px;height:${size}px;box-sizing:border-box">
        ${svg.replace('<svg ', `<svg width="${size - 2 * inset}" height="${size - 2 * inset}" `)}
      </div></body></html>`
  );
  await page.screenshot({ path: join(root, 'public', file), omitBackground: !padding });
  await page.close();
}
await browser.close();
console.log('Icons written to public/.');
