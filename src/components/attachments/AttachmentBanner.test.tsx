import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDocument } from '@/domain/document';
import type { AttachmentStatus } from '@/services/attachments';
import { resetStoreForTest, useStore } from '@/store';
import { resetDialogsForTest, useUiStore } from '@/store/ui';
import { AttachmentBanner } from './AttachmentBanner';

const svc = vi.hoisted(() => ({
  attachmentStatus: vi.fn(),
  chooseAttachmentFolder: vi.fn(),
  grantAttachmentAccess: vi.fn(),
  subscribeAttachments: vi.fn(),
  listeners: new Set<() => void>(),
}));
vi.mock('@/services/attachments', () => ({
  attachmentStatus: svc.attachmentStatus,
  chooseAttachmentFolder: svc.chooseAttachmentFolder,
  grantAttachmentAccess: svc.grantAttachmentAccess,
  subscribeAttachments: svc.subscribeAttachments,
}));

const EMBED = '# Note\n\n![[photo.png]]\n';
const NOTICE = /cannot be shown/;

function setStatus(status: AttachmentStatus) {
  svc.attachmentStatus.mockResolvedValue(status);
}

/** Past the 500 ms debounce and the lazy imports that follow it. */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10);
    });
  }
}

function load(markdown: string, handleId: string | null = 'h1') {
  useStore.getState().loadDocument(createDocument(markdown, 'n.md'), null, handleId);
}

describe('AttachmentBanner', () => {
  // Warm the lazy modules so their dynamic imports settle within fake time.
  beforeAll(async () => {
    await Promise.all([import('@/domain/embeds'), import('@/domain/embedLinks')]);
  });

  beforeEach(() => {
    vi.useFakeTimers();
    resetStoreForTest();
    resetDialogsForTest();
    svc.attachmentStatus.mockReset();
    svc.chooseAttachmentFolder.mockReset().mockResolvedValue(true);
    svc.grantAttachmentAccess.mockReset().mockResolvedValue(true);
    svc.listeners.clear();
    svc.subscribeAttachments.mockReset().mockImplementation((l: () => void) => {
      svc.listeners.add(l);
      return () => svc.listeners.delete(l);
    });
    setStatus({ kind: 'no-folder' });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('stays hidden when the note has no embeds', async () => {
    load('# Plain\n\nJust text and a [link](https://example.com).');
    render(<AttachmentBanner />);
    await settle();
    expect(screen.queryByRole('status')).toBeNull();
    expect(svc.attachmentStatus).not.toHaveBeenCalled();
  });

  it('ignores embeds that sit in code', async () => {
    load('```md\n![[photo.png]]\n![x](a.png)\n```\n\nand `![[b.png]]` inline');
    render(<AttachmentBanner />);
    await settle();
    expect(screen.queryByRole('status')).toBeNull();
    expect(svc.attachmentStatus).not.toHaveBeenCalled();
  });

  it('ignores web images', async () => {
    load('![x](https://example.com/a.png)');
    render(<AttachmentBanner />);
    await settle();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('counts local Markdown images too', async () => {
    load('![x](images/a.png)');
    render(<AttachmentBanner />);
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent(NOTICE);
  });

  it('asks for a folder when none is chosen', async () => {
    load(EMBED);
    render(<AttachmentBanner />);
    await settle();
    const bar = screen.getByRole('status');
    expect(bar).toHaveAttribute('aria-live', 'polite');
    expect(bar).toHaveTextContent(
      'Some attachments in this note cannot be shown. Choose the vault or attachment folder to display them.'
    );
    expect(screen.getByRole('button', { name: 'Choose attachment folder' })).toBeEnabled();
  });

  it('asks to save the note first when it has no file', async () => {
    setStatus({ kind: 'no-note-file' });
    load(EMBED, null);
    render(<AttachmentBanner />);
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('Save this document to disk');
    expect(screen.queryByRole('button', { name: 'Choose attachment folder' })).toBeNull();
  });

  it('explains the placeholders in a browser that cannot read folders', async () => {
    setStatus({ kind: 'unsupported' });
    load(EMBED);
    render(<AttachmentBanner />);
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('cannot read folders');
    expect(screen.queryByRole('button', { name: 'Choose attachment folder' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Allow access' })).toBeNull();
  });

  it('offers to allow access to a remembered folder', async () => {
    setStatus({ kind: 'needs-permission', folderName: 'Vault' });
    load(EMBED);
    render(<AttachmentBanner />);
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent('Attachments in Vault need permission');
    fireEvent.click(screen.getByRole('button', { name: 'Allow access' }));
    expect(svc.grantAttachmentAccess).toHaveBeenCalledTimes(1);
  });

  it('suggests the vault root when embeds are missing from a narrower folder', async () => {
    setStatus({
      kind: 'ready',
      folderName: 'images',
      isVaultRoot: false,
      misses: 2,
      scanning: false,
    });
    load(EMBED);
    render(<AttachmentBanner />);
    await settle();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Some attachments were not found in images. Choose the vault root folder.'
    );
    expect(screen.getByRole('button', { name: 'Choose attachment folder' })).toBeInTheDocument();
  });

  it('hides when the folder is ready and nothing is missing, or it is the vault root', async () => {
    setStatus({ kind: 'ready', folderName: 'V', isVaultRoot: false, misses: 0, scanning: false });
    load(EMBED);
    render(<AttachmentBanner />);
    await settle();
    expect(screen.queryByRole('status')).toBeNull();
    setStatus({ kind: 'ready', folderName: 'V', isVaultRoot: true, misses: 3, scanning: false });
    await act(async () => {
      for (const l of svc.listeners) l();
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('re-checks when the service reports a change', async () => {
    load(EMBED);
    render(<AttachmentBanner />);
    await settle();
    expect(screen.getByRole('status')).toBeInTheDocument();
    setStatus({ kind: 'ready', folderName: 'V', isVaultRoot: true, misses: 0, scanning: false });
    await act(async () => {
      for (const l of svc.listeners) l();
    });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('calls the service synchronously inside the click', async () => {
    load(EMBED);
    render(<AttachmentBanner />);
    await settle();
    // Nothing is awaited between the click and this check, so a call seen
    // here happened inside the click handler itself.
    fireEvent.click(screen.getByRole('button', { name: 'Choose attachment folder' }));
    expect(svc.chooseAttachmentFolder).toHaveBeenCalledTimes(1);
    expect(svc.chooseAttachmentFolder).toHaveBeenCalledWith({ fileHandle: null, handleId: null });
  });

  it('dismisses for one tab only', async () => {
    load(EMBED, 'h1');
    render(<AttachmentBanner />);
    await settle();
    const firstTab = useStore.getState().activeTabId;
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss this notice' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(useUiStore.getState().attachmentBannerDismissed).toEqual({ [firstTab]: true });

    load(EMBED, 'h2');
    await settle();
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => useStore.getState().activateTab(firstTab));
    await settle();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('re-evaluates when another tab comes to the front', async () => {
    load('# Plain note', 'h1');
    const plainTab = useStore.getState().activeTabId;
    load(EMBED, 'h2');
    render(<AttachmentBanner />);
    await settle();
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => useStore.getState().activateTab(plainTab));
    await settle();
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('discards a status that arrives after the tab changed', async () => {
    let finish: (s: AttachmentStatus) => void = () => {};
    svc.attachmentStatus.mockImplementationOnce(
      () =>
        new Promise<AttachmentStatus>((resolve) => {
          finish = resolve;
        })
    );
    load(EMBED, 'h1');
    const embedTab = useStore.getState().activeTabId;
    render(<AttachmentBanner />);
    await settle();
    expect(svc.attachmentStatus).toHaveBeenCalledTimes(1);

    load('# Plain note', 'h2');
    await settle();
    await act(async () => {
      finish({ kind: 'no-folder' });
    });
    expect(useStore.getState().activeTabId).not.toBe(embedTab);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
