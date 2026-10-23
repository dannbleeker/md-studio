import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUiStore } from '@/store/ui';

const resolveAttachment = vi.fn();
const chooseAttachmentFolder = vi.fn();
const grantAttachmentAccess = vi.fn();
vi.mock('./attachments', () => ({
  chooseAttachmentFolder: (...args: unknown[]) => chooseAttachmentFolder(...args),
  grantAttachmentAccess: (...args: unknown[]) => grantAttachmentAccess(...args),
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
    chooseAttachmentFolder.mockReset().mockResolvedValue(false);
    grantAttachmentAccess.mockReset().mockResolvedValue(false);
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

  it('asks for the folder from the click, then follows the link', async () => {
    resolveAttachment
      .mockResolvedValueOnce({ state: 'unavailable', reason: 'no-folder' })
      .mockResolvedValueOnce(ok('docs/report.pdf'));
    chooseAttachmentFolder.mockResolvedValue(true);
    await followFileLink({ path: 'docs/report.pdf', markdown: true });
    expect(chooseAttachmentFolder).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('asks for permission when the folder is known but locked', async () => {
    resolveAttachment
      .mockResolvedValueOnce({ state: 'unavailable', reason: 'needs-permission' })
      .mockResolvedValueOnce(ok('docs/report.pdf'));
    grantAttachmentAccess.mockResolvedValue(true);
    await followFileLink({ path: 'docs/report.pdf', markdown: true });
    expect(grantAttachmentAccess).toHaveBeenCalledTimes(1);
    expect(chooseAttachmentFolder).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
