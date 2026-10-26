import { isDirty } from '@/domain/document';
import { forPlatform } from '@/domain/keys';
import { useIsMobile } from '@/hooks/useIsMobile';
import { t } from '@/i18n';
import { newDocument, openDocument, saveDocument } from '@/services/documentActions';
import { goBack, goForward, useNavHistory } from '@/services/noteHistory';
import { isMac } from '@/services/platform';
import { useStore } from '@/store';
import type { ViewMode } from '@/store/settings';
import { useUiStore } from '@/store/ui';

const VIEWS: ViewMode[] = ['split', 'text', 'visual', 'read'];

export function Toolbar() {
  const fileName = useStore((s) => s.doc.fileName);
  const dirty = useStore((s) => isDirty(s.doc));
  const viewMode = useStore((s) => s.viewMode);
  const linkedScroll = useStore((s) => s.settings.linkedScroll);
  const showOutline = useStore((s) => s.settings.showOutline);
  const showFolder = useStore((s) => s.settings.showFolder);
  const editMode = useStore((s) => s.settings.editMode);
  const { canBack, canForward } = useNavHistory();
  const { setViewMode, updateSettings, setScreen } = useStore.getState();
  const { setSettingsOpen, setPaletteOpen, setExportOpen, setReaderOpen, setFocusMode } =
    useUiStore.getState();
  const isMobile = useIsMobile();

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <button type="button" className="btn btn-ghost brand" onClick={() => setScreen('start')}>
          {isMobile ? 'MD' : t('appName')}
        </button>
        {canBack || canForward ? (
          <span className="nav-buttons">
            <button
              type="button"
              className="btn-icon"
              disabled={!canBack}
              onClick={() => void goBack()}
              title={`${t('nav.back')} (${forPlatform('Alt+Left', isMac())})`}
              aria-label={t('nav.back')}
            >
              ‹
            </button>
            <button
              type="button"
              className="btn-icon"
              disabled={!canForward}
              onClick={() => void goForward()}
              title={`${t('nav.forward')} (${forPlatform('Alt+Right', isMac())})`}
              aria-label={t('nav.forward')}
            >
              ›
            </button>
          </span>
        ) : null}
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
        {/* Read view changes nothing, so there is nothing to save from it. */}
        {viewMode === 'read' ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setViewMode(editMode)}
            title={t('toolbar.editTitle')}
          >
            {t('toolbar.edit')}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => void saveDocument()}>
            {t('toolbar.save')}
          </button>
        )}
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
        {viewMode === 'read' ? (
          <>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setReaderOpen(true)}
              title={t('toolbar.readerTitle')}
              aria-label={t('toolbar.readerTitle')}
            >
              {t('toolbar.reader')}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setFocusMode(true)}
              title={t('toolbar.focusTitle')}
            >
              {t('toolbar.focus')}
            </button>
          </>
        ) : null}
        <button
          type="button"
          className="btn btn-ghost"
          aria-pressed={showFolder}
          onClick={() => updateSettings({ showFolder: !showFolder })}
        >
          {t('folder.toolbar')}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          aria-pressed={showOutline}
          onClick={() => updateSettings({ showOutline: !showOutline })}
          title={forPlatform('Ctrl+Shift+O', isMac())}
        >
          {t('toolbar.outline')}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setPaletteOpen(true)}
          title={forPlatform('Ctrl+K', isMac())}
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
