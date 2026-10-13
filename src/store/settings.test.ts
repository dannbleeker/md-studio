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
        linkStyle: 'html',
        attachmentRules: 'cloud',
      })
    ).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid attachment settings', () => {
    const valid = sanitizeSettings({ linkStyle: 'markdown', attachmentRules: 'images' });
    expect(valid.linkStyle).toBe('markdown');
    expect(valid.attachmentRules).toBe('images');
    expect(sanitizeSettings({ linkStyle: 'wikilink' }).linkStyle).toBe('wikilink');
  });

  it('defaults attachment settings to auto links and the vault folder rule', () => {
    const missing = sanitizeSettings({});
    expect(missing.linkStyle).toBe('auto');
    expect(missing.attachmentRules).toBe('vault');
    expect(DEFAULT_SETTINGS.linkStyle).toBe('auto');
    expect(DEFAULT_SETTINGS.attachmentRules).toBe('vault');
  });

  it('blocks web images unless the user turned them on', () => {
    expect(sanitizeSettings({}).webImages).toBe(false);
    expect(sanitizeSettings({ webImages: true }).webImages).toBe(true);
  });

  it('defaults the language to following the browser', () => {
    expect(sanitizeSettings({}).language).toBe('system');
  });
});
