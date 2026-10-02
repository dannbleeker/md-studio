import { useState } from 'react';
import { t } from '@/i18n';
import { type PromptRequest, useUiStore } from '@/store/ui';
import { Dialog } from './ui/Dialog';

export function PromptDialogHost() {
  const req = useUiStore((s) => s.prompt);
  return (
    <Dialog open={!!req} title={req?.title ?? ''} onClose={() => req?.resolve(null)}>
      {req ? <PromptForm req={req} /> : null}
    </Dialog>
  );
}

/** Mounted per request, so the field starts from that request's initial value. */
function PromptForm({ req }: { req: PromptRequest }) {
  const [value, setValue] = useState(req.initial);
  return (
    <form
      className="dialog-body"
      onSubmit={(e) => {
        e.preventDefault();
        req.resolve(value);
      }}
    >
      <h2>{req.title}</h2>
      <label className="prompt-field">
        {req.label}
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          // biome-ignore lint/a11y/noAutofocus: a prompt exists to be typed into.
          autoFocus
          onFocus={(e) => e.target.select()}
        />
      </label>
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={() => req.resolve(null)}>
          {t('confirm.cancel')}
        </button>
        <button type="submit" className="btn btn-primary">
          {req.confirmLabel}
        </button>
      </div>
    </form>
  );
}
