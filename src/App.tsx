import { lazy, Suspense } from 'react';
import { ConfirmDialogHost } from './components/ConfirmDialogHost';
import { CommandPalette } from './components/command-palette/CommandPalette';
import { SplitView } from './components/editor/SplitView';
import { ExportDialog } from './components/export/ExportDialog';
import { PromptDialogHost } from './components/PromptDialogHost';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { StartScreen } from './components/start/StartScreen';
import { ToastHost } from './components/toast/ToastHost';
import { Toolbar } from './components/toolbar/Toolbar';
import { useFileDrop } from './hooks/useFileDrop';
import { useLocale } from './hooks/useLocale';
import { useShortcuts } from './hooks/useShortcuts';
import { useTheme } from './hooks/useTheme';
import { useStore } from './store';

// Loaded on first use: neither is needed to start editing, and keeping them
// out of the start-up chunk keeps first paint fast.
const FindBar = lazy(() =>
  import('./components/find/FindBar').then((m) => ({ default: m.FindBar }))
);
const OutlinePanel = lazy(() =>
  import('./components/outline/OutlinePanel').then((m) => ({ default: m.OutlinePanel }))
);

export function App() {
  const screen = useStore((s) => s.screen);
  const showOutline = useStore((s) => s.settings.showOutline);
  const findOpen = useStore((s) => s.findOpen);
  useLocale();
  useTheme();
  useShortcuts();
  useFileDrop();

  return (
    <div className="app">
      {screen === 'start' ? (
        <StartScreen />
      ) : (
        <>
          <Toolbar />
          <div className="workspace">
            {showOutline ? (
              <Suspense fallback={null}>
                <OutlinePanel />
              </Suspense>
            ) : null}
            <div className="workspace-main">
              {findOpen ? (
                <Suspense fallback={null}>
                  <FindBar />
                </Suspense>
              ) : null}
              <SplitView />
            </div>
          </div>
        </>
      )}
      <SettingsDialog />
      <ExportDialog />
      <CommandPalette />
      <ConfirmDialogHost />
      <PromptDialogHost />
      <ToastHost />
    </div>
  );
}
