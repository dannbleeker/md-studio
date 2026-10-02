import { ConfirmDialogHost } from './components/ConfirmDialogHost';
import { CommandPalette } from './components/command-palette/CommandPalette';
import { SplitView } from './components/editor/SplitView';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { StartScreen } from './components/start/StartScreen';
import { ToastHost } from './components/toast/ToastHost';
import { Toolbar } from './components/toolbar/Toolbar';
import { useFileDrop } from './hooks/useFileDrop';
import { useShortcuts } from './hooks/useShortcuts';
import { useTheme } from './hooks/useTheme';
import { useStore } from './store';

export function App() {
  const screen = useStore((s) => s.screen);
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
          <SplitView />
        </>
      )}
      <SettingsDialog />
      <CommandPalette />
      <ConfirmDialogHost />
      <ToastHost />
    </div>
  );
}
