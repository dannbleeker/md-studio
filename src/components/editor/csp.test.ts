import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The built app's CSP lives in vite.config.ts as a meta tag. Attachments are
 * shown from blob: URLs made from the user's own files, so media and frames
 * need blob: while plugins stay off. A silent edit to either would break
 * audio, video and PDFs in the built app only, which no other test sees.
 */
const config = readFileSync(path.resolve(process.cwd(), 'vite.config.ts'), 'utf8');
const directives = (): string[] => {
  const block = /const CSP = \[([\s\S]*?)\]\.join/.exec(config)?.[1] ?? '';
  return [...block.matchAll(/(["'])((?:(?!\1).)*)\1/g)].map((m) => m[2] ?? '');
};

describe('content security policy', () => {
  it('lets the page play media from its own origin and blob URLs', () => {
    expect(directives()).toContain("media-src 'self' blob:");
  });

  it('lets the page frame blob URLs only (PDF attachments)', () => {
    expect(directives()).toContain('frame-src blob:');
  });

  it('keeps plugins and objects off', () => {
    expect(directives()).toContain("object-src 'none'");
  });

  it('still limits scripts to the app origin and images stay open for web images', () => {
    expect(directives()).toContain("script-src 'self'");
    expect(directives().some((d) => d.startsWith('img-src') && d.includes('blob:'))).toBe(true);
  });
});
