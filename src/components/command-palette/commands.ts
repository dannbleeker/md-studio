import { printDocument } from '@/components/editor/embedView';
import { t } from '@/i18n';
import type { MessageKey } from '@/i18n/en';
import type { AttachmentStatus } from '@/services/attachments';
import {
  closeTab,
  cycleTab,
  newDocument,
  openDocument,
  openUserGuide,
  openWelcome,
  saveDocument,
} from '@/services/documentActions';
import { exportDocument } from '@/services/export';
import { BOOK_EPUB, BOOK_PDF, DASHBOARD, GUIDE_PDF } from '@/services/links';
import { goBack, goForward } from '@/services/noteHistory';
import { useStore } from '@/store';
import { showToast, useUiStore } from '@/store/ui';

/**
 * Why an attachment command cannot run right now, in words the user can act
 * on (the same wording as the notice above the editor), or null when it can.
 */
function attachmentBlocker(status: AttachmentStatus): string | null {
  switch (status.kind) {
    case 'unsupported':
      return t('attachment.banner.unsupported');
    case 'no-note-file':
      return t('attachment.banner.noFile');
    case 'no-folder':
      return t('attachment.rescanNoFolder');
    case 'needs-permission':
      return t('attachment.banner.allow', { folder: status.folderName });
    case 'ready':
      return null;
  }
}

/** Same as clicking an `<a download>`: saves the file instead of navigating. */
function downloadLink(href: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = '';
  a.click();
}

export type Command = {
  id: string;
  label: MessageKey;
  shortcut?: string;
  run: () => void;
  /** Instead of running, replace the palette's query with this (e.g. "#"). */
  query?: string;
  /**
   * Acts on the open document or its tab: not offered on the start screen,
   * where it would close, save or export a document the user can't see.
   */
  editorOnly?: boolean;
  /** Not offered in Read view, where nothing is edited. */
  hideInRead?: boolean;
};

const state = () => useStore.getState();
/** Exports from the palette use the Export dialog's last choices. */
const exportOptions = () => ({
  htmlTheme: state().settings.exportHtmlTheme,
  frontMatter: state().settings.exportFrontMatter,
});
const ui = () => useUiStore.getState();

export const COMMANDS: readonly Command[] = [
  { id: 'new', label: 'cmd.new', shortcut: 'Alt+N', run: () => void newDocument() },
  { id: 'open', label: 'cmd.open', shortcut: 'Ctrl+O', run: () => void openDocument() },
  {
    id: 'save',
    editorOnly: true,
    hideInRead: true,
    label: 'cmd.save',
    shortcut: 'Ctrl+S',
    run: () => void saveDocument(),
  },
  {
    id: 'save-as',
    editorOnly: true,
    label: 'cmd.saveAs',
    shortcut: 'Ctrl+Shift+S',
    run: () => void saveDocument(true),
  },
  {
    id: 'close-tab',
    editorOnly: true,
    label: 'cmd.closeTab',
    shortcut: 'Alt+W',
    run: () => void closeTab(),
  },
  {
    id: 'next-tab',
    editorOnly: true,
    label: 'cmd.nextTab',
    shortcut: 'Alt+PageDown',
    run: () => cycleTab(1),
  },
  {
    id: 'prev-tab',
    editorOnly: true,
    label: 'cmd.prevTab',
    shortcut: 'Alt+PageUp',
    run: () => cycleTab(-1),
  },
  {
    id: 'view-split',
    editorOnly: true,
    label: 'cmd.viewSplit',
    shortcut: 'Ctrl+1',
    run: () => state().setViewMode('split'),
  },
  {
    id: 'view-text',
    editorOnly: true,
    label: 'cmd.viewText',
    shortcut: 'Ctrl+2',
    run: () => state().setViewMode('text'),
  },
  {
    id: 'view-visual',
    editorOnly: true,
    label: 'cmd.viewVisual',
    shortcut: 'Ctrl+3',
    run: () => state().setViewMode('visual'),
  },
  {
    id: 'view-read',
    editorOnly: true,
    label: 'cmd.viewRead',
    shortcut: 'Ctrl+4',
    run: () => state().setViewMode('read'),
  },
  {
    id: 'open-folder',
    label: 'cmd.openFolder',
    // Loaded on first use: most sessions never open a folder.
    run: () => void import('@/services/folder').then((m) => m.openFolder()),
  },
  {
    id: 'toggle-folder',
    editorOnly: true,
    label: 'cmd.toggleFolder',
    run: () => state().updateSettings({ showFolder: !state().settings.showFolder }),
  },
  { id: 'nav-back', editorOnly: true, label: 'cmd.back', run: () => void goBack() },
  { id: 'nav-forward', editorOnly: true, label: 'cmd.forward', run: () => void goForward() },
  {
    id: 'focus-mode',
    editorOnly: true,
    label: 'cmd.focus',
    run: () => ui().setFocusMode(true),
  },
  {
    id: 'reader-controls',
    editorOnly: true,
    label: 'cmd.reader',
    run: () => ui().setReaderOpen(true),
  },
  {
    id: 'read-keys',
    editorOnly: true,
    label: 'cmd.readKeys',
    run: () => ui().setShortcutsOpen(true),
  },
  {
    id: 'linked-scroll',
    label: 'cmd.toggleLinkedScroll',
    run: () => state().updateSettings({ linkedScroll: !state().settings.linkedScroll }),
  },
  {
    id: 'find',
    editorOnly: true,
    label: 'cmd.find',
    shortcut: 'Ctrl+F',
    run: () => ui().setFind(true, false),
  },
  {
    id: 'replace',
    editorOnly: true,
    label: 'cmd.replace',
    shortcut: 'Ctrl+H',
    run: () => ui().setFind(true, true),
  },
  {
    id: 'goto-heading',
    editorOnly: true,
    label: 'cmd.gotoHeading',
    shortcut: '#',
    query: '#',
    run: () => {},
  },
  {
    id: 'outline',
    editorOnly: true,
    label: 'cmd.toggleOutline',
    shortcut: 'Ctrl+Shift+O',
    run: () => state().updateSettings({ showOutline: !state().settings.showOutline }),
  },
  { id: 'export', editorOnly: true, label: 'cmd.export', run: () => ui().setExportOpen(true) },
  {
    id: 'export-html',
    editorOnly: true,
    label: 'cmd.exportHtml',
    run: () => void exportDocument('html', exportOptions()),
  },
  {
    id: 'export-pdf',
    editorOnly: true,
    label: 'cmd.exportPdf',
    run: () => void exportDocument('pdf', exportOptions()),
  },
  {
    id: 'export-docx',
    editorOnly: true,
    label: 'cmd.exportDocx',
    run: () => void exportDocument('docx', exportOptions()),
  },
  {
    id: 'export-txt',
    editorOnly: true,
    label: 'cmd.exportTxt',
    run: () => void exportDocument('txt', exportOptions()),
  },
  {
    id: 'print',
    editorOnly: true,
    label: 'cmd.print',
    shortcut: 'Ctrl+P',
    run: () => void printDocument(),
  },
  {
    id: 'choose-attachment-folder',
    editorOnly: true,
    label: 'cmd.chooseAttachmentFolder',
    // Reached by a click or Enter, and the import resolves in a few ms, so
    // the user activation the directory picker needs is still fresh.
    run: () =>
      void import('@/services/attachments').then(async (m) => {
        const ctx = m.currentDocContext();
        // Called first, with nothing awaited, so the picker still has its click.
        if (await m.chooseAttachmentFolder(ctx)) return;
        // False is also a cancelled picker, which needs no message. Only the
        // cases where the picker could never open are explained.
        const status = await m.attachmentStatus(ctx);
        if (status.kind === 'unsupported' || status.kind === 'no-note-file') {
          showToast(attachmentBlocker(status) ?? '');
        }
      }),
  },
  {
    id: 'rescan-attachments',
    editorOnly: true,
    label: 'cmd.rescanAttachments',
    run: () =>
      void import('@/services/attachments').then(async (m) => {
        const ctx = m.currentDocContext();
        // refreshAttachments returns quietly when nothing can be scanned, so
        // ask first rather than report a rescan that never happened.
        const blocker = attachmentBlocker(await m.attachmentStatus(ctx));
        if (blocker !== null) {
          showToast(blocker);
          return;
        }
        await m.refreshAttachments(ctx);
        showToast(t('attachment.rescanned'));
      }),
  },
  {
    id: 'settings',
    label: 'cmd.settings',
    shortcut: 'Ctrl+,',
    run: () => ui().setSettingsOpen(true),
  },
  { id: 'home', label: 'cmd.home', run: () => state().setScreen('start') },
  { id: 'welcome', label: 'cmd.welcome', run: () => void openWelcome() },
  { id: 'guide', label: 'cmd.guide', run: () => void openUserGuide() },
  {
    id: 'guidePdf',
    label: 'cmd.guidePdf',
    run: () => window.open(GUIDE_PDF, '_blank', 'noopener'),
  },
  { id: 'book', label: 'cmd.book', run: () => window.open(BOOK_PDF, '_blank', 'noopener') },
  { id: 'bookEpub', label: 'cmd.bookEpub', run: () => downloadLink(BOOK_EPUB) },
  {
    id: 'dashboard',
    label: 'cmd.dashboard',
    run: () => window.open(DASHBOARD, '_blank', 'noopener'),
  },
];
