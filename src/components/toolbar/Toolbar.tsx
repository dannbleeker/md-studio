import { isDirty } from '@/domain/document';
import { useIsMobile } from '@/hooks/useIsMobile';
import { t } from '@/i18n';
import { newDocument, openDocument, saveDocument } from '@/services/documentActions';
import { useStore } from '@/store';
import type { ViewMode } from '@/store/settings';

const VIEWS: ViewMode[] = ['split', 'text', 'visual'];

export function Toolbar() {
  const fileName = useStore((s) => s.doc.fileName);
  const dirty = useStore((s) => isDirty(s.doc));
  const viewMode = useStore((s) => s.viewMode);
  const linkedScroll = useStore((s) => s.settings.linkedScroll);
  const showOutline = useStore((s) => s.settings.showOutline);
  const { setViewMode, updateSettings, setScreen, setSettingsOpen, setPaletteOpen, setExportOpen } =
    useStore.getState();
  const isMobile = useIsMobile();

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <button type="button" className="btn btn-ghost brand" onClick={() => setScreen('start')}>
          {isMobile ? 'MD' : t('appName')}
        </button>
        <span className="file-name" title={fileName}>
          {fileName}
          {dirty ? (
            <span className="dirty-dot" role="img" aria-label={t('toolbar.unsaved')}>
              ●
            </span>
          ) : null}
        </span>
      </div>

      <div className="toolbar-group">
        <button type="button" className="btn btn-ghost" onClick={() => void newDocument()}>
          {t('toolbar.new')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => void openDocument()}>
          {t('toolbar.open')}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void saveDocument()}>
          {t('toolbar.save')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setExportOpen(true)}>
          {t('toolbar.export')}
        </button>
      </div>

      <div className="toolbar-group">
        <fieldset className="segmented" aria-label={t('view.label')}>
          {VIEWS.map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={viewMode === mode}
              onClick={() => setViewMode(mode)}
            >
              {t(`view.${mode}`)}
            </button>
          ))}
        </fieldset>
        {viewMode === 'split' && !isMobile ? (
          <label className="checkbox toolbar-toggle">
            <input
              type="checkbox"
              checked={linkedScroll}
              onChange={(e) => updateSettings({ linkedScroll: e.target.checked })}
            />
            {t('toolbar.linkedScroll')}
          </label>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost"
          aria-pressed={showOutline}
          onClick={() => updateSettings({ showOutline: !showOutline })}
          title="Ctrl+Shift+O"
        >
          {t('toolbar.outline')}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setPaletteOpen(true)}
          title="Ctrl+K"
        >
          {t('toolbar.commands')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setSettingsOpen(true)}>
          {t('toolbar.settings')}
        </button>
      </div>
    </header>
  );
}
