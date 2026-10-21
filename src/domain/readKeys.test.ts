import { describe, expect, it } from 'vitest';
import { readKeyAction } from './readKeys';

const key = (
  k: string,
  mods: Partial<Record<'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey', boolean>> = {}
) =>
  readKeyAction({
    key: k,
    shiftKey: false,
    ctrlKey: false,
    altKey: false,
    metaKey: false,
    ...mods,
  });

describe('readKeyAction', () => {
  it('maps the reading keys', () => {
    expect(key('j')).toBe('down');
    expect(key('k')).toBe('up');
    expect(key(' ')).toBe('pageDown');
    expect(key(' ', { shiftKey: true })).toBe('pageUp');
    expect(key('g')).toBe('top');
    expect(key('G', { shiftKey: true })).toBe('bottom');
    expect(key('[')).toBe('prevHeading');
    expect(key(']')).toBe('nextHeading');
    expect(key('/')).toBe('find');
    expect(key('f')).toBe('focus');
  });

  it('ignores keys with Ctrl, Alt or Meta, so shortcuts keep working', () => {
    for (const mod of ['ctrlKey', 'altKey', 'metaKey'] as const) {
      expect(key('f', { [mod]: true })).toBeNull();
      expect(key(' ', { [mod]: true })).toBeNull();
    }
  });

  it('ignores other keys', () => {
    for (const k of ['a', 'Enter', 'ArrowDown', 'Escape', '?']) expect(key(k)).toBeNull();
  });
});
