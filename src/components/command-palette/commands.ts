import type { MessageKey } from '@/i18n/en';
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
import { useStore } from '@/store';
import { useUiStore } from '@/store/ui';

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
};

const state = () => useStore.getState();
const ui = () => useUiStore.getState();

export const COMMANDS: readonly Command[] = [
  { id: 'new', label: 'cmd.new', shortcut: 'Alt+N', run: () => void newDocument() },
  { id: 'open', label: 'cmd.open', shortcut: 'Ctrl+O', run: () => void openDocument() },
  {
    id: 'save',
    editorOnly: true,
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
    run: () => void exportDocument('html', { htmlTheme: state().settings.exportHtmlTheme }),
  },
  {
    id: 'export-pdf',
    editorOnly: true,
    label: 'cmd.exportPdf',
    run: () => void exportDocument('pdf', { htmlTheme: state().settings.exportHtmlTheme }),
  },
  {
    id: 'export-docx',
    editorOnly: true,
    label: 'cmd.exportDocx',
    run: () => void exportDocument('docx', { htmlTheme: state().settings.exportHtmlTheme }),
  },
  {
    id: 'export-txt',
    editorOnly: true,
    label: 'cmd.exportTxt',
    run: () => void exportDocument('txt', { htmlTheme: state().settings.exportHtmlTheme }),
  },
  {
    id: 'print',
    editorOnly: true,
    label: 'cmd.print',
    shortcut: 'Ctrl+P',
    run: () => window.print(),
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
