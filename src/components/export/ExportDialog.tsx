import { useState } from 'react';
import type { ExportFormat, HtmlTheme } from '@/domain/exportFormats';
import { t } from '@/i18n';
import { exportDocument } from '@/services/export';
import { useStore } from '@/store';
import { useUiStore } from '@/store/ui';
import { Dialog } from '../ui/Dialog';

const FORMATS: ExportFormat[] = ['html', 'pdf', 'docx', 'txt'];
const THEMES: HtmlTheme[] = ['auto', 'light', 'dark'];

export function ExportDialog() {
  const open = useUiStore((s) => s.exportOpen);
  const setOpen = useUiStore((s) => s.setExportOpen);
  return (
    <Dialog open={open} title={t('export.title')} onClose={() => setOpen(false)}>
      <ExportForm onDone={() => setOpen(false)} />
    </Dialog>
  );
}

function ExportForm({ onDone }: { onDone: () => void }) {
  // Starts from the last export's choices.
  const [format, setFormat] = useState<ExportFormat>(
    () => useStore.getState().settings.exportFormat
  );
  const [htmlTheme, setHtmlTheme] = useState<HtmlTheme>(
    () => useStore.getState().settings.exportHtmlTheme
  );
  const [frontMatter, setFrontMatter] = useState(
    () => useStore.getState().settings.exportFrontMatter
  );

  return (
    <form
      className="dialog-body settings"
      onSubmit={(e) => {
        e.preventDefault();
        onDone();
        useStore.getState().updateSettings({
          exportFormat: format,
          exportHtmlTheme: htmlTheme,
          exportFrontMatter: frontMatter,
        });
        void exportDocument(format, { htmlTheme, frontMatter });
      }}
    >
      <h2>{t('export.title')}</h2>
      <p className="muted">{t('export.intro')}</p>

      <fieldset>
        <legend>{t('export.format')}</legend>
        {FORMATS.map((id) => (
          <label key={id} className="radio export-option">
            <input
              type="radio"
              name="format"
              value={id}
              checked={format === id}
              onChange={() => setFormat(id)}
            />
            <span>
              {t(`export.${id}`)}
              <span className="muted export-hint">{t(`export.${id}.hint`)}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {format === 'html' ? (
        <label className="select-row">
          {t('export.theme')}
          <select value={htmlTheme} onChange={(e) => setHtmlTheme(e.target.value as HtmlTheme)}>
            {THEMES.map((theme) => (
              <option key={theme} value={theme}>
                {t(`export.theme.${theme}`)}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="checkbox">
        <input
          type="checkbox"
          checked={frontMatter}
          onChange={(e) => setFrontMatter(e.target.checked)}
        />
        {t('export.frontMatter')}
      </label>

      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onDone}>
          {t('confirm.cancel')}
        </button>
        <button type="submit" className="btn btn-primary">
          {t('export.submit')}
        </button>
      </div>
    </form>
  );
}
