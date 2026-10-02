import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings';

describe('sanitizeSettings', () => {
  it('keeps valid values', () => {
    const valid = { ...DEFAULT_SETTINGS, theme: 'dark', language: 'en' } as const;
    expect(sanitizeSettings(valid)).toEqual(valid);
  });

  it('replaces unknown or mistyped values with defaults', () => {
    expect(
      sanitizeSettings({
        theme: 'neon',
        linkedScroll: 'yes',
        language: 'xx',
        defaultViewMode: 3,
        fontSize: 'huge',
        lineNumbers: 1,
        webImages: 'on',
        exportFormat: 'rtf',
        exportHtmlTheme: null,
      })
    ).toEqual(DEFAULT_SETTINGS);
  });

  it('blocks web images unless the user turned them on', () => {
    expect(sanitizeSettings({}).webImages).toBe(false);
    expect(sanitizeSettings({ webImages: true }).webImages).toBe(true);
  });

  it('defaults the language to following the browser', () => {
    expect(sanitizeSettings({}).language).toBe('system');
  });
});
