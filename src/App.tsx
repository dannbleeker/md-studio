import { lazy } from 'react';
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
  const manyTabs = useStore((s) => s.tabs.length > 1);
  const fontSize = useStore((s) => s.settings.fontSize);
  const lineNumbers = useStore((s) => s.settings.lineNumbers);
  useLocale();
  useTheme();
  useShortcuts();
  useFileDrop();

  return (
    <div className="app" data-font-size={fontSize} data-line-numbers={lineNumbers || undefined}>
      {screen === 'start' ? (
        <StartScreen />
      ) : (
        <>
          <Toolbar />
          {/* Only with two or more open documents. */}
          {manyTabs ? <TabBar /> : null}
          <div className="workspace">
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
