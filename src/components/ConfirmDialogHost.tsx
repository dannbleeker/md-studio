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
              onClick={() => req.resolve(true)}
              // biome-ignore lint/a11y/noAutofocus: a confirm dialog should focus its decision.
              autoFocus
            >
              {req.confirmLabel}
            </button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
