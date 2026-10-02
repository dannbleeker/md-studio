import { t } from '@/i18n';
import { dismissToast, useUiStore } from '@/store/ui';

export function ToastHost() {
  const toasts = useUiStore((s) => s.toasts);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className="toast">
          <span>{toast.message}</span>
          {toast.action ? (
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={() => {
                dismissToast(toast.id);
                toast.action?.run();
              }}
            >
              {toast.action.label}
            </button>
          ) : null}
          <button
            type="button"
            className="btn-icon"
            aria-label={t('toast.dismiss')}
            onClick={() => dismissToast(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
