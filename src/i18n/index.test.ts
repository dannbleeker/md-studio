import { describe, expect, it } from 'vitest';
import { t } from './index';

describe('t', () => {
  it('returns the message', () => {
    expect(t('toolbar.save')).toBe('Save');
  });

  it('interpolates params and leaves unknown placeholders', () => {
    expect(t('toast.saved', { name: 'a.md' })).toBe('Saved a.md');
    expect(t('toast.saved', {})).toBe('Saved {name}');
  });
});
