import { describe, expect, it } from 'vitest';
import { appShortcuts } from './appShortcuts';
import { forPlatform } from './keys';

describe('appShortcuts', () => {
  it('lists each action once, and no key twice', () => {
    const list = appShortcuts();
    expect(new Set(list.map((s) => s.action)).size).toBe(list.length);
    expect(new Set(list.map((s) => s.keys)).size).toBe(list.length);
  });

  it('starts with the command palette', () => {
    expect(appShortcuts()[0]).toEqual({ action: 'commands', keys: 'Ctrl+K' });
  });

  it('is written PC style, so a Mac shows Command and Option', () => {
    const keys = appShortcuts().map((s) => s.keys);
    expect(keys.every((k) => /^(?:Ctrl|Alt)\+/.test(k))).toBe(true);
    expect(forPlatform('Ctrl+Shift+S', true)).toBe('⌘⇧S');
  });
});
