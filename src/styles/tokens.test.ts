import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `--text-faint` draws line numbers, fold markers and the × buttons, so it
 * must stay readable as text (WCAG 4.5:1) on the surfaces they sit on, and
 * visible as an icon (3:1) on a hovered tab.
 */
// Vitest stubs CSS imports, so the file is read directly (tests run from the repo root).
const css = readFileSync(resolve('src/styles/tokens.css'), 'utf8');

function theme(selector: string): Record<string, string> {
  const start = css.indexOf(selector);
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1] ?? '', m[2] ?? ''])
  );
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe('--text-faint contrast', () => {
  for (const [name, selector] of [
    ['light', ':root {'],
    ['dark', ':root[data-theme="dark"]'],
  ] as const) {
    it(`is readable in the ${name} theme`, () => {
      const t = theme(selector);
      const faint = t['text-faint'] ?? '';
      for (const surface of ['bg', 'surface', 'surface-2', 'active-line'])
        expect(contrast(faint, t[surface] ?? ''), surface).toBeGreaterThanOrEqual(4.5);
      expect(contrast(faint, t['accent-soft'] ?? '')).toBeGreaterThanOrEqual(3);
    });
  }
});
