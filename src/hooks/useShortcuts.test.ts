import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMMANDS } from '@/components/command-palette/commands';
import { printDocument } from '@/components/editor/embedView';
import * as actions from '@/services/documentActions';
import { goBack, goForward } from '@/services/noteHistory';
import { resetStoreForTest, useStore } from '@/store';
import { useUiStore } from '@/store/ui';
import { useShortcuts } from './useShortcuts';

// Every user command becomes a spy, so a command and its key can be
// compared by what they call.
vi.mock('@/services/documentActions', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(Object.keys(real).map((name) => [name, vi.fn()]));
});

vi.mock('@/services/noteHistory', () => ({ goBack: vi.fn(), goForward: vi.fn() }));

// Print waits for the off-screen embeds; the real one would open the print dialog.
vi.mock('@/components/editor/embedView', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  printDocument: vi.fn(),
}));

/**
 * Hints that are not the app's own keys: `#` is typed into the palette.
 * Ctrl+P is checked on its own below: it calls no document action.
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

describe('Ctrl+P', () => {
  beforeEach(() => fresh());

  const press = (init: KeyboardEventInit = {}) => {
    const { unmount } = renderHook(() => useShortcuts());
    const event = new KeyboardEvent('keydown', {
      key: 'p',
      code: 'KeyP',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    window.dispatchEvent(event);
    unmount();
    return event.defaultPrevented;
  };

  it('runs the same print as the palette command, not the browser’s own', () => {
    expect(press()).toBe(true);
    expect(printDocument).toHaveBeenCalledTimes(1);
    COMMANDS.find((c) => c.id === 'print')?.run();
    expect(printDocument).toHaveBeenCalledTimes(2);
  });

  it('leaves the browser alone off the editor screen, and Ctrl+Shift+P opens the palette', () => {
    useStore.getState().setScreen('start');
    expect(press()).toBe(false);
    expect(printDocument).not.toHaveBeenCalled();
    useStore.getState().setScreen('editor');
    expect(press({ shiftKey: true, key: 'P' })).toBe(true);
    expect(printDocument).not.toHaveBeenCalled();
    expect(useUiStore.getState().paletteOpen).toBe(true);
  });
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

describe('Alt+Left and Alt+Right', () => {
  beforeEach(() => fresh());

  const press = (key: string, init: KeyboardEventInit = {}) => {
    const { unmount } = renderHook(() => useShortcuts());
    const event = new KeyboardEvent('keydown', {
      key,
      code: key,
      altKey: true,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    window.dispatchEvent(event);
    unmount();
    return event.defaultPrevented;
  };

  it('step through the notes opened, not the browser history', () => {
    expect(press('ArrowLeft')).toBe(true);
    expect(goBack).toHaveBeenCalledTimes(1);
    expect(press('ArrowRight')).toBe(true);
    expect(goForward).toHaveBeenCalledTimes(1);
  });

  it('leave Shift+Alt (word selection) and the start screen alone', () => {
    expect(press('ArrowLeft', { shiftKey: true })).toBe(false);
    useStore.getState().setScreen('start');
    expect(press('ArrowLeft')).toBe(false);
    expect(press('ArrowRight')).toBe(false);
    expect(goBack).not.toHaveBeenCalled();
    expect(goForward).not.toHaveBeenCalled();
  });

  it('give way to an open dialog', () => {
    document.body.innerHTML = '<dialog open></dialog>';
    expect(press('ArrowLeft')).toBe(false);
    document.body.innerHTML = '';
    expect(goBack).not.toHaveBeenCalled();
  });
});

describe('shortcuts on other keyboard layouts', () => {
  beforeEach(() => fresh());

  const press = (key: string, code: string, init: KeyboardEventInit = {}) => {
    const { unmount } = renderHook(() => useShortcuts());
    const event = new KeyboardEvent('keydown', {
      key,
      code,
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    window.dispatchEvent(event);
    unmount();
    return event.defaultPrevented;
  };

  it('match the physical letter on a non-Latin layout (Ctrl+ы is Ctrl+S)', () => {
    expect(press('ы', 'KeyS')).toBe(true);
    expect(vi.mocked(actions.saveDocument)).toHaveBeenCalledTimes(1);
    expect(press('щ', 'KeyO')).toBe(true);
    expect(vi.mocked(actions.openDocument)).toHaveBeenCalledTimes(1);
    expect(press('α', 'KeyA')).toBe(false);
  });

  it('match the digit row on AZERTY (Ctrl+& is Ctrl+1)', () => {
    useStore.setState({ viewMode: 'text' });
    expect(press('&', 'Digit1')).toBe(true);
    expect(useStore.getState().viewMode).toBe('split');
    expect(press('"', 'Digit3')).toBe(true);
    expect(useStore.getState().viewMode).toBe('visual');
  });

  it('keep the typed letter on Latin layouts that move keys (Dvorak, AZERTY)', () => {
    // Dvorak types "o" on the S key: Ctrl+O, not Ctrl+S.
    expect(press('o', 'KeyS')).toBe(true);
    expect(vi.mocked(actions.openDocument)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(actions.saveDocument)).not.toHaveBeenCalled();
    // AZERTY's comma sits on the M key: still Ctrl+, for the settings.
    expect(press(',', 'KeyM')).toBe(true);
    expect(useUiStore.getState().settingsOpen).toBe(true);
  });
});
