import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '@/store/ui';

const resolveAttachment = vi.fn();
vi.mock('./attachments', () => ({
  currentDocContext: () => ({ handleId: 'h', fileHandle: null }),
  readNoteText: vi.fn(),
  resolveAttachment: (...args: unknown[]) => resolveAttachment(...args),
  resolveNoteHandle: vi.fn(),
}));
vi.mock('./noteHistory', () => ({ navigateToNote: vi.fn() }));

import { followFileLink } from './noteLinks';

const ok = (path: string) => ({
  state: 'ok',
  path,
  name: path.replace(/^.*\//, ''),
  kind: 'other',
  url: 'blob:http://localhost/abc',
  ambiguous: false,
});

describe('followFileLink', () => {
  const open = vi.fn();
  const click = vi.fn();

  beforeEach(() => {
    resolveAttachment.mockReset();
    open.mockReset();
    click.mockReset();
    useUiStore.setState({ toasts: [] });
    vi.stubGlobal('open', open);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('opens a PDF in a new tab without a back link to the app', async () => {
    resolveAttachment.mockResolvedValue(ok('docs/report.pdf'));
    await followFileLink({ path: 'docs/report.pdf', markdown: true });
    expect(open).toHaveBeenCalledWith('blob:http://localhost/abc', '_blank', 'noopener');
    expect(click).not.toHaveBeenCalled();
  });

  it('saves a file the browser would run instead of opening it', async () => {
    resolveAttachment.mockResolvedValue(ok('page.html'));
    await followFileLink({ path: 'page.html', markdown: true });
    expect(open).not.toHaveBeenCalled();
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('says why nothing opened', async () => {
    const toasts = () => useUiStore.getState().toasts.map((x) => x.message);
    resolveAttachment.mockResolvedValue({ state: 'missing', rootLooksLikeVault: false });
    await followFileLink({ path: 'a/gone.pdf', markdown: false });
    expect(toasts().at(-1)).toContain('gone.pdf');
    resolveAttachment.mockResolvedValue({ state: 'unavailable', reason: 'no-folder' });
    await followFileLink({ path: 'x.pdf', markdown: false });
    expect(toasts().at(-1)).toContain('attachments folder');
    expect(open).not.toHaveBeenCalled();
  });
});
