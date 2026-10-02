import type { MessageKey } from '@/i18n/en';
import { exportHtml, newDocument, openDocument, saveDocument } from '@/services/documentActions';
import { useStore } from '@/store';

export type Command = {
  id: string;
  label: MessageKey;
  shortcut?: string;
  run: () => void;
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
  { id: 'export-html', label: 'cmd.exportHtml', run: exportHtml },
  { id: 'print', label: 'cmd.print', shortcut: 'Ctrl+P', run: () => window.print() },
  {
    id: 'settings',
    label: 'cmd.settings',
    shortcut: 'Ctrl+,',
    run: () => state().setSettingsOpen(true),
  },
  { id: 'home', label: 'cmd.home', run: () => state().setScreen('start') },
];
