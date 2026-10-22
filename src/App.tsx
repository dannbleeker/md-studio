import { lazy, useEffect, useState } from 'react';
import { ConfirmDialogHost } from './components/ConfirmDialogHost';
import { CommandPalette } from './components/command-palette/CommandPalette';
import { SplitView } from './components/editor/SplitView';
import { ExportDialog } from './components/export/ExportDialog';
import { PromptDialogHost } from './components/PromptDialogHost';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { StartScreen } from './components/start/StartScreen';
import { TabBar } from './components/tabs/TabBar';
import { ToastHost } from './components/toast/ToastHost';
import { Toolbar } from './components/toolbar/Toolbar';
import { LazyBoundary } from './components/ui/LazyBoundary';
import { useFileDrop } from './hooks/useFileDrop';
import { useLocale } from './hooks/useLocale';
import { useReadKeys } from './hooks/useReadKeys';
import { useReadViewRefresh } from './hooks/useReadViewRefresh';
import { useShortcuts } from './hooks/useShortcuts';
import { useTheme } from './hooks/useTheme';
import { t } from './i18n';
import { useStore } from './store';
import { useUiStore } from './store/ui';

// Loaded on first use: neither is needed to start editing, and keeping them
// out of the start-up chunk keeps first paint fast.
const FindBar = lazy(() =>
  import('./components/find/FindBar').then((m) => ({ default: m.FindBar }))
);
const AttachmentBanner = lazy(() =>
  import('./components/attachments/AttachmentBanner').then((m) => ({
    default: m.AttachmentBanner,
  }))
);
const ReaderDialog = lazy(() =>
  import('./components/settings/ReaderDialog').then((m) => ({ default: m.ReaderDialog }))
);
const FolderPanel = lazy(() =>
  import('./components/folder/FolderPanel').then((m) => ({ default: m.FolderPanel }))
);
const OutlinePanel = lazy(() =>
  import('./components/outline/OutlinePanel').then((m) => ({ default: m.OutlinePanel }))
);

export function App() {
  const screen = useStore((s) => s.screen);
  const showOutline = useStore((s) => s.settings.showOutline);
  const showFolder = useStore((s) => s.settings.showFolder);
  const findOpen = useUiStore((s) => s.findOpen);
  const manyTabs = useStore((s) => s.tabs.length > 1);
  const fontSize = useStore((s) => s.settings.fontSize);
  const lineNumbers = useStore((s) => s.settings.lineNumbers);
  const focusMode = useUiStore((s) => s.focusMode);
  const readerOpen = useUiStore((s) => s.readerOpen);
  // Loaded on the first open, then kept so closing it hands focus back as a dialog does.
  const [readerSeen, setReaderSeen] = useState(false);
  useEffect(() => {
    if (readerOpen) setReaderSeen(true);
  }, [readerOpen]);
  useLocale();
  useTheme();
  useShortcuts();
  useFileDrop();
  useReadViewRefresh();
  useReadKeys();

  // The folder of last time comes back (without a prompt) and keeps its list current.
  useEffect(() => {
    // After the first paint, and only where folders work: the service is a lazy chunk.
    if (typeof window.showDirectoryPicker !== 'function') return;
    void import('./services/folder').then((m) => {
      m.watchFolder();
      void m.restoreFolder();
    });
  }, []);

  // Escape leaves focus mode, unless a dialog is open (it takes Escape first).
  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('dialog[open]')) return;
      useUiStore.getState().setFocusMode(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [focusMode]);

  return (
    <div
      className="app"
      data-font-size={fontSize}
      data-line-numbers={lineNumbers || undefined}
      data-focus={focusMode && screen === 'editor' ? '' : undefined}
    >
      {screen === 'start' ? (
        <StartScreen />
      ) : (
        <>
          <Toolbar />
          {/* Only with two or more open documents. */}
          {manyTabs ? <TabBar /> : null}
          <div className="workspace">
            {showFolder ? (
              <LazyBoundary>
                <FolderPanel />
              </LazyBoundary>
            ) : null}
            {showOutline ? (
              <LazyBoundary>
                <OutlinePanel />
              </LazyBoundary>
            ) : null}
            <div className="workspace-main">
              {findOpen ? (
                <LazyBoundary>
                  <FindBar />
                </LazyBoundary>
              ) : null}
              <LazyBoundary>
                <AttachmentBanner />
              </LazyBoundary>
              <SplitView />
            </div>
          </div>
        </>
      )}
      {focusMode && screen === 'editor' ? (
        <button
          type="button"
          className="focus-exit"
          onClick={() => useUiStore.getState().setFocusMode(false)}
        >
          {t('focus.exit')}
        </button>
      ) : null}
      <SettingsDialog />
      {readerSeen ? (
        <LazyBoundary>
          <ReaderDialog />
        </LazyBoundary>
      ) : null}
      <ExportDialog />
      <CommandPalette />
      <ConfirmDialogHost />
      <PromptDialogHost />
      <ToastHost />
    </div>
  );
}
