import type { MessageKey } from '@/i18n/en';
import {
  closeTab,
  cycleTab,
  newDocument,
  openDocument,
  openWelcome,
  saveDocument,
} from '@/services/documentActions';
import { exportDocument } from '@/services/export';
import { BOOK_PDF, DASHBOARD } from '@/services/links';
import { useStore } from '@/store';

export type Command = {
  id: string;
  label: MessageKey;
  shortcut?: string;
  run: () => void;
  /** Instead of running, replace the palette's query with this (e.g. "#"). */
  query?: string;
};

const state = () => useStore.getState();

export const COMMANDS: readonly Command[] = [
  { id: 'new', label: 'cmd.new', shortcut: 'Alt+N', run: () => void newDocument() },
  { id: 'open', label: 'cmd.open', shortcut: 'Ctrl+O', run: () => void openDocument() },
  { id: 'save', label: 'cmd.save', shortcut: 'Ctrl+S', run: () => void saveDocument() },
  {
    id: 'save-as',
    label: 'cmd.saveAs',
    shortcut: 'Ctrl+Shift+S',
    run: () => void saveDocument(true),
  },
  { id: 'close-tab', label: 'cmd.closeTab', shortcut: 'Alt+W', run: () => void closeTab() },
  { id: 'next-tab', label: 'cmd.nextTab', shortcut: 'Alt+PageDown', run: () => cycleTab(1) },
  { id: 'prev-tab', label: 'cmd.prevTab', shortcut: 'Alt+PageUp', run: () => cycleTab(-1) },
  {
    id: 'view-split',
    label: 'cmd.viewSplit',
    shortcut: 'Ctrl+1',
    run: () => state().setViewMode('split'),
  },
  {
    id: 'view-text',
    label: 'cmd.viewText',
    shortcut: 'Ctrl+2',
    run: () => state().setViewMode('text'),
  },
  {
    id: 'view-visual',
    label: 'cmd.viewVisual',
    shortcut: 'Ctrl+3',
    run: () => state().setViewMode('visual'),
  },
  {
    id: 'linked-scroll',
    label: 'cmd.toggleLinkedScroll',
    run: () => state().updateSettings({ linkedScroll: !state().settings.linkedScroll }),
  },
  { id: 'find', label: 'cmd.find', shortcut: 'Ctrl+F', run: () => state().setFind(true, false) },
  {
    id: 'replace',
    label: 'cmd.replace',
    shortcut: 'Ctrl+H',
    run: () => state().setFind(true, true),
  },
  { id: 'goto-heading', label: 'cmd.gotoHeading', shortcut: '#', query: '#', run: () => {} },
  {
    id: 'outline',
    label: 'cmd.toggleOutline',
    shortcut: 'Ctrl+Shift+O',
    run: () => state().updateSettings({ showOutline: !state().settings.showOutline }),
  },
  { id: 'export', label: 'cmd.export', run: () => state().setExportOpen(true) },
  {
    id: 'export-html',
    label: 'cmd.exportHtml',
    run: () => void exportDocument('html', { htmlTheme: state().settings.exportHtmlTheme }),
  },
  {
    id: 'export-pdf',
    label: 'cmd.exportPdf',
    run: () => void exportDocument('pdf', { htmlTheme: state().settings.exportHtmlTheme }),
  },
  {
    id: 'export-docx',
    label: 'cmd.exportDocx',
    run: () => void exportDocument('docx', { htmlTheme: state().settings.exportHtmlTheme }),
  },
  {
    id: 'export-txt',
    label: 'cmd.exportTxt',
    run: () => void exportDocument('txt', { htmlTheme: state().settings.exportHtmlTheme }),
  },
  { id: 'print', label: 'cmd.print', shortcut: 'Ctrl+P', run: () => window.print() },
  {
    id: 'settings',
    label: 'cmd.settings',
    shortcut: 'Ctrl+,',
    run: () => state().setSettingsOpen(true),
  },
  { id: 'home', label: 'cmd.home', run: () => state().setScreen('start') },
  { id: 'welcome', label: 'cmd.welcome', run: () => void openWelcome() },
  { id: 'book', label: 'cmd.book', run: () => window.open(BOOK_PDF, '_blank', 'noopener') },
  {
    id: 'dashboard',
    label: 'cmd.dashboard',
    run: () => window.open(DASHBOARD, '_blank', 'noopener'),
  },
];
