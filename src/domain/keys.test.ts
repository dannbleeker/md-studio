import { describe, expect, it } from 'vitest';
import { forPlatform } from './keys';

describe('forPlatform', () => {
  it('shows shortcuts the Mac way on a Mac, and as written elsewhere', () => {
    expect(forPlatform('Ctrl+Shift+O', true)).toBe('⌘⇧O');
    expect(forPlatform('Bold (Ctrl+B)', true)).toBe('Bold (⌘B)');
    expect(forPlatform('Alt+PageDown', true)).toBe('⌥PageDown');
    expect(forPlatform('Ctrl+Shift+O', false)).toBe('Ctrl+Shift+O');
  });
});
