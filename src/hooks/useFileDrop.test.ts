import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDroppedFile } from '@/services/documentActions';
import { useFileDrop } from './useFileDrop';

vi.mock('@/services/documentActions', () => ({ openDroppedFile: vi.fn(async () => {}) }));

const file = (name: string) => new File(['# x'], name);

/** A drag event carrying files; jsdom has no DataTransfer to build one from. */
function dragEvent(
  type: 'drop' | 'dragover',
  files: File[],
  types = files.length ? ['Files'] : []
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files, types } });
  return event as DragEvent;
}

const opened = () => vi.mocked(openDroppedFile).mock.calls.map(([f]) => f.name);

describe('useFileDrop', () => {
  beforeEach(() => vi.mocked(openDroppedFile).mockClear());

  it('opens dropped Markdown and text files, in order, and nothing else', async () => {
    renderHook(() => useFileDrop());
    const drop = dragEvent('drop', [
      file('a.md'),
      file('photo.png'),
      file('B.MARKDOWN'),
      file('notes.txt'),
      file('c.mdown'),
      file('d.mkd'),
      file('md'),
    ]);
    window.dispatchEvent(drop);
    await vi.waitFor(() => expect(opened()).toHaveLength(5));
    expect(opened()).toEqual(['a.md', 'B.MARKDOWN', 'notes.txt', 'c.mdown', 'd.mkd']);
    // The browser would otherwise navigate to the dropped file.
    expect(drop.defaultPrevented).toBe(true);
  });

  it('keeps the browser from opening a dropped file it does not take', () => {
    renderHook(() => useFileDrop());
    const drop = dragEvent('drop', [file('photo.png')]);
    window.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(openDroppedFile).not.toHaveBeenCalled();
  });

  it('leaves a drop without files (text, a link) alone', () => {
    renderHook(() => useFileDrop());
    const drop = dragEvent('drop', []);
    window.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(false);
  });

  it('accepts a drag only when it carries files', () => {
    renderHook(() => useFileDrop());
    const withFiles = dragEvent('dragover', [file('a.md')]);
    const withText = dragEvent('dragover', [], ['text/plain']);
    window.dispatchEvent(withFiles);
    window.dispatchEvent(withText);
    expect(withFiles.defaultPrevented).toBe(true);
    expect(withText.defaultPrevented).toBe(false);
  });

  it('stops listening when unmounted', () => {
    const { unmount } = renderHook(() => useFileDrop());
    unmount();
    const drop = dragEvent('drop', [file('a.md')]);
    window.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(false);
    expect(openDroppedFile).not.toHaveBeenCalled();
  });
});
