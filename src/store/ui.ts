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

type UiState = {
  toasts: Toast[];
  confirm: ConfirmRequest | null;
};

export const useUiStore = create<UiState>()(() => ({ toasts: [], confirm: null }));

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
