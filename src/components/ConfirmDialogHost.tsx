import { t } from '@/i18n';
import { useUiStore } from '@/store/ui';
import { Dialog } from './ui/Dialog';

export function ConfirmDialogHost() {
  const req = useUiStore((s) => s.confirm);
  return (
    <Dialog open={!!req} title={req?.title ?? ''} onClose={() => req?.resolve(false)}>
      {req ? (
        <div className="dialog-body">
          <h2>{req.title}</h2>
          <p>{req.body}</p>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={() => req.resolve(false)}>
              {t('confirm.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              // No autofocus: every confirm here is destructive (discard,
              // overwrite, clear), so the dialog's first button, Cancel,
              // keeps focus and a stray Enter does no harm.
              onClick={() => req.resolve(true)}
            >
              {req.confirmLabel}
            </button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
