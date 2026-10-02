import { describe, expect, it } from 'vitest';
import { dateTimeFormat, getLocale, setLocale, t } from './index';

describe('t', () => {
  it('returns the message', () => {
    expect(t('toolbar.save')).toBe('Save');
  });

  it('interpolates params and leaves unknown placeholders', () => {
    expect(t('toast.saved', { name: 'a.md' })).toBe('Saved a.md');
    expect(t('toast.saved', {})).toBe('Saved {name}');
  });
});

describe('locale state', () => {
  it('defaults to English and sets the document language', () => {
    expect(getLocale()).toBe('en');
    setLocale('en');
    expect(t('toolbar.save')).toBe('Save');
  });

  it('formats dates in the UI language', () => {
    const format = dateTimeFormat({ year: 'numeric' });
    expect(format.resolvedOptions().locale).toMatch(/^en/);
    expect(dateTimeFormat({ year: 'numeric' })).toBe(format);
  });
});
