import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '@/domain/document';
import { useStore } from '@/store';
import { useUiStore } from '@/store/ui';

/** The document on screen, as the attachments service would see it. */
const shown = vi.hoisted(() => ({ handleId: 'h' }));
const resolveAttachment = vi.fn();
const chooseAttachmentFolder = vi.fn();
const grantAttachmentAccess = vi.fn();
vi.mock('./attachments', () => ({
  chooseAttachmentFolder: (...args: unknown[]) => chooseAttachmentFolder(...args),
  grantAttachmentAccess: (...args: unknown[]) => grantAttachmentAccess(...args),
  currentDocContext: () => ({ handleId: shown.handleId, fileHandle: null }),
  readNoteText: vi.fn(),
  resolveAttachment: (...args: unknown[]) => resolveAttachment(...args),
  resolveNoteHandle: vi.fn(),
}));
vi.mock('./noteHistory', () => ({ navigateToNote: vi.fn() }));

import { readNoteText } from './attachments';
import { followFileLink, previewNote } from './noteLinks';

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

  it('drops a link clicked in a tab the user has left while the vault was scanned', async () => {
    const asked: string[] = [];
    resolveAttachment.mockImplementation(async (ctx: { handleId: string }) => {
      asked.push(ctx.handleId);
      return asked.length === 1 ? { state: 'scanning' } : ok('docs/report.pdf');
    });
    const following = followFileLink({ path: 'docs/report.pdf', markdown: true });
    // Another tab comes up before the first scan is done.
    shown.handleId = 'other';
    useStore.getState().loadDocument(createDocument('# other', 'other.md'), null);
    await following;
    shown.handleId = 'h';
    expect(asked.every((id) => id === 'h')).toBe(true);
    expect(open).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
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

describe('previewNote', () => {
  const note = (path: string) => ({
    state: 'ok' as const,
    path,
    text: '# Idea\n\nThe body.',
    lastModified: 1,
    size: 20,
  });

  it('asks again while the vault is still being scanned', async () => {
    vi.mocked(readNoteText).mockResolvedValueOnce({ state: 'scanning' });
    expect(await previewNote({ path: 'Scanned', markdown: false })).toBeNull();
    vi.mocked(readNoteText).mockResolvedValueOnce(note('deep/Scanned.md'));
    expect((await previewNote({ path: 'Scanned', markdown: false }))?.name).toBe('Scanned');
  });

  it('asks again once the folder is allowed', async () => {
    vi.mocked(readNoteText).mockResolvedValueOnce({
      state: 'unavailable',
      reason: 'needs-permission',
    });
    expect(await previewNote({ path: 'Allowed', markdown: false })).toBeNull();
    vi.mocked(readNoteText).mockResolvedValueOnce(note('Allowed.md'));
    expect(await previewNote({ path: 'Allowed', markdown: false })).not.toBeNull();
  });

  it('keeps a found note and a missing one for a while', async () => {
    vi.mocked(readNoteText).mockClear();
    vi.mocked(readNoteText).mockResolvedValueOnce(note('Kept.markdown'));
    expect((await previewNote({ path: 'Kept', markdown: false }))?.name).toBe('Kept');
    expect((await previewNote({ path: 'Kept', markdown: false }))?.name).toBe('Kept');
    vi.mocked(readNoteText).mockResolvedValueOnce({ state: 'missing', rootLooksLikeVault: true });
    expect(await previewNote({ path: 'Gone', markdown: false })).toBeNull();
    expect(await previewNote({ path: 'Gone', markdown: false })).toBeNull();
    expect(readNoteText).toHaveBeenCalledTimes(2);
  });
});
