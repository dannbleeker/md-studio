import { create } from 'zustand';

export type Toast = {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
};

export type ConfirmRequest = {
  title: string;
  body: string;
  confirmLabel: string;
  resolve: (ok: boolean) => void;
};

export type PromptRequest = {
  title: string;
  label: string;
  initial: string;
  confirmLabel: string;
  resolve: (value: string | null) => void;
};

/** What the visual pane's selection is formatted with, for the format toolbar. */
export type FormatState = {
  strong: boolean;
  emphasis: boolean;
  strike: boolean;
  code: boolean;
  link: string | null;
  /** 0 = paragraph, 1–6 = heading level, -1 = other block (code, table…). */
  block: number;
};

const NO_FORMAT: FormatState = {
  strong: false,
  emphasis: false,
  strike: false,
  code: false,
  link: null,
  block: 0,
};

/**
 * Which dialogs and bars are open. Kept out of the document store: opening
 * one has nothing to persist and nothing for the editors to react to.
 */
type Dialogs = {
  settingsOpen: boolean;
  paletteOpen: boolean;
  exportOpen: boolean;
  findOpen: boolean;
  findWithReplace: boolean;
  /** Bumped by every Ctrl+F / Ctrl+H, so an open find bar refocuses and retargets. */
  findRequest: number;
};

const CLOSED: Dialogs = {
  settingsOpen: false,
  paletteOpen: false,
  exportOpen: false,
  findOpen: false,
  findWithReplace: false,
  findRequest: 0,
};

type UiState = Dialogs & {
  toasts: Toast[];
  confirm: ConfirmRequest | null;
  prompt: PromptRequest | null;
  format: FormatState;
  setSettingsOpen: (open: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setExportOpen: (open: boolean) => void;
  setFind: (open: boolean, withReplace?: boolean) => void;
};

export const useUiStore = create<UiState>()((set) => ({
  ...CLOSED,
  toasts: [],
  confirm: null,
  prompt: null,
  format: NO_FORMAT,
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setExportOpen: (exportOpen) => set({ exportOpen }),
  setFind: (findOpen, withReplace) =>
    set((s) => ({
      findOpen,
      findWithReplace: withReplace ?? s.findWithReplace,
      findRequest: findOpen ? s.findRequest + 1 : s.findRequest,
    })),
}));

export function resetDialogsForTest(): void {
  useUiStore.setState(CLOSED);
}

let nextToastId = 1;

export function showToast(message: string, action?: Toast['action'], timeoutMs = 4000): void {
  const id = nextToastId++;
  const toast: Toast = action ? { id, message, action } : { id, message };
  useUiStore.setState((s) => ({ toasts: [...s.toasts, toast] }));
  // Toasts with an action (e.g. "Reload" for an update) stay until handled.
  if (!action) setTimeout(() => dismissToast(id), timeoutMs);
}

export function dismissToast(id: number): void {
  useUiStore.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

/** Promise-based confirm, rendered by ConfirmDialogHost. */
export function requestConfirm(req: Omit<ConfirmRequest, 'resolve'>): Promise<boolean> {
  return new Promise((resolve) => {
    useUiStore.getState().confirm?.resolve(false);
    useUiStore.setState({
      confirm: {
        ...req,
        resolve: (ok) => {
          useUiStore.setState({ confirm: null });
          resolve(ok);
        },
      },
    });
  });
}

/** Promise-based single-line prompt, rendered by PromptDialogHost. Null when cancelled. */
export function requestPrompt(req: Omit<PromptRequest, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => {
    useUiStore.getState().prompt?.resolve(null);
    useUiStore.setState({
      prompt: {
        ...req,
        resolve: (value) => {
          useUiStore.setState({ prompt: null });
          resolve(value);
        },
      },
    });
  });
}
