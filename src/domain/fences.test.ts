import { describe, expect, it } from 'vitest';
import { closesFence, openFence } from './fences';

describe('openFence', () => {
  it('opens on three or more backticks or tildes, with an info string', () => {
    expect(openFence('```js')).toBe('```');
    expect(openFence('   ~~~~ text')).toBe('~~~~');
    expect(openFence('````')).toBe('````');
  });

  it('is not a fence when the info string has a backtick, or indented 4+', () => {
    expect(openFence('```npm install```')).toBeNull();
    expect(openFence('    ```')).toBeNull();
    expect(openFence('``')).toBeNull();
  });
});

describe('closesFence', () => {
  it('needs the same character, at least as long, and nothing else', () => {
    expect(closesFence('```', '```')).toBe(true);
    expect(closesFence('`````  ', '```')).toBe(true);
    expect(closesFence('```js', '```')).toBe(false);
    expect(closesFence('~~~', '```')).toBe(false);
    expect(closesFence('```', '````')).toBe(false);
  });
});
