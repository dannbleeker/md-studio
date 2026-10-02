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

type UiState = {
  toasts: Toast[];
  confirm: ConfirmRequest | null;
  prompt: PromptRequest | null;
  format: FormatState;
};

export const useUiStore = create<UiState>()(() => ({
  toasts: [],
  confirm: null,
  prompt: null,
  format: NO_FORMAT,
}));

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
