import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS } from '@/components/command-palette/commands';
import * as actions from '@/services/documentActions';
import { resetStoreForTest, useStore } from '@/store';
import { useUiStore } from '@/store/ui';
import { useShortcuts } from './useShortcuts';

// Every user command becomes a spy, so a command and its key can be
// compared by what they call.
vi.mock('@/services/documentActions', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(Object.keys(real).map((name) => [name, vi.fn()]));
});

/**
 * Hints that are not the app's own keys: `#` is typed into the palette,
 * and Ctrl+P is the browser's print, which the command merely invokes.
 */
const NOT_APP_KEYS = new Set(['#', 'Ctrl+P']);

/** A KeyboardEvent for a hint such as "Ctrl+Shift+S", "Alt+PageDown" or "Ctrl+,". */
function keyFor(hint: string): KeyboardEvent {
  const parts = hint.split('+');
  const key = parts.at(-1) ?? '';
  const code = /^[A-Z]$/.test(key)
    ? `Key${key}`
    : /^\d$/.test(key)
      ? `Digit${key}`
      : key === ','
        ? 'Comma'
        : key;
  return new KeyboardEvent('keydown', {
    key: parts.includes('Shift') ? key.toUpperCase() : key.toLowerCase(),
    code,
    ctrlKey: parts.includes('Ctrl'),
    shiftKey: parts.includes('Shift'),
    altKey: parts.includes('Alt'),
    bubbles: true,
    cancelable: true,
  });
}

/** saveDocument() and saveDocument(false) are the same call: trailing false or undefined args go. */
function withoutDefaults(args: unknown[]): unknown[] {
  const out = [...args];
  while (out.length > 0 && (out.at(-1) === false || out.at(-1) === undefined)) out.pop();
  return out;
}

/** What a command did: the actions it called and the state it changed. */
function effect() {
  const calls = Object.entries(actions)
    .filter(([, fn]) => vi.isMockFunction(fn) && fn.mock.calls.length > 0)
    .map(([name, fn]) => [name, (fn as ReturnType<typeof vi.fn>).mock.calls.map(withoutDefaults)]);
  const { viewMode, settings } = useStore.getState();
  const { settingsOpen, paletteOpen, exportOpen, findOpen, findWithReplace } =
    useUiStore.getState();
  return {
    calls,
    viewMode,
    showOutline: settings.showOutline,
    settingsOpen,
    paletteOpen,
    exportOpen,
    findOpen,
    findWithReplace,
  };
}

function fresh(id = '') {
  vi.clearAllMocks();
  // Settings persist; each run starts from the defaults.
  localStorage.clear();
  resetStoreForTest();
  useStore.getState().setScreen('editor');
  // Start in a view the command doesn't switch to, so the switch shows.
  useStore.setState({ viewMode: id === 'view-split' ? 'text' : 'split' });
}

describe('shortcut hints in the command palette', () => {
  beforeEach(() => fresh());

  const hinted = COMMANDS.filter((c) => c.shortcut && !NOT_APP_KEYS.has(c.shortcut));

  it('covers the app’s shortcuts', () => {
    expect(hinted.length).toBeGreaterThan(10);
  });

  for (const command of hinted) {
    it(`${command.shortcut} does what “${command.id}” does`, () => {
      fresh(command.id);
      const before = effect();
      command.run();
      const byCommand = effect();
      expect(byCommand).not.toEqual(before);

      fresh(command.id);
      const { unmount } = renderHook(() => useShortcuts());
      window.dispatchEvent(keyFor(command.shortcut ?? ''));
      unmount();
      expect(effect()).toEqual(byCommand);
    });
  }
});

describe('shortcuts on a Mac', () => {
  beforeEach(() => {
    fresh();
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
  });
  afterEach(() => vi.restoreAllMocks());

  const press = (init: KeyboardEventInit) => {
    const { unmount } = renderHook(() => useShortcuts());
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    window.dispatchEvent(event);
    unmount();
    return event.defaultPrevented;
  };

  it('use Command, and leave Ctrl to text editing', () => {
    expect(press({ key: 'f', code: 'KeyF', ctrlKey: true })).toBe(false);
    expect(press({ key: 'h', code: 'KeyH', ctrlKey: true })).toBe(false);
    expect(press({ key: 'k', code: 'KeyK', ctrlKey: true })).toBe(false);
    expect(useUiStore.getState().findOpen).toBe(false);
    expect(press({ key: 'f', code: 'KeyF', metaKey: true })).toBe(true);
    expect(useUiStore.getState().findOpen).toBe(true);
  });

  it('let Option type accented letters', () => {
    expect(press({ key: 'Dead', code: 'KeyN', altKey: true })).toBe(false);
    expect(vi.mocked(actions.newDocument)).not.toHaveBeenCalled();
  });
});
