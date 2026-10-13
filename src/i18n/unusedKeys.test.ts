import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { en } from './en';

/**
 * A message nobody shows is dead copy that every locale still has to
 * translate. Keys are found as quoted literals anywhere in the app source,
 * or as the fixed start of a template such as `view.${mode}`.
 */
const SRC = resolve('src');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    const isCode = /\.(ts|tsx)$/.test(entry.name);
    const isTest = /\.test\.(ts|tsx)$/.test(entry.name);
    // en.ts defines the keys; locales that translate them would otherwise count as uses.
    return isCode && !isTest && !full.startsWith(join(SRC, 'i18n')) ? [full] : [];
  });
}

const source = sourceFiles(SRC)
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');
const prefixes = [...source.matchAll(/`([a-z][\w-]*(?:\.[\w-]+)*\.)\$\{/g)].map((m) => m[1] ?? '');

const isUsed = (key: string): boolean =>
  source.includes(`'${key}'`) ||
  source.includes(`"${key}"`) ||
  source.includes(`\`${key}\``) ||
  prefixes.some((p) => key.startsWith(p));

describe('message catalogue', () => {
  it('has no key that the app never uses', () => {
    expect(Object.keys(en).filter((key) => !isUsed(key))).toEqual([]);
  });

  it('would notice a key nothing refers to', () => {
    expect(isUsed('attachment.folderRoot')).toBe(false);
    expect(isUsed('attachment.rescanned')).toBe(true);
    expect(isUsed('view.split')).toBe(true);
  });
});
