import { t } from '@/i18n';
import { LOCALES, type LocalePreference, SUPPORTED_LOCALES } from '@/i18n/locales';
import { openUserGuide } from '@/services/documentActions';
import { BOOK_EPUB, BOOK_PDF, GUIDE_PDF } from '@/services/links';
import { useStore } from '@/store';
import { FONT_SIZES, type ThemePreference, type ViewMode } from '@/store/settings';
import { useUiStore } from '@/store/ui';
import { Dialog } from '../ui/Dialog';

const THEMES: ThemePreference[] = ['system', 'light', 'dark'];
const VIEWS: ViewMode[] = ['split', 'text', 'visual'];

export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const close = () => setOpen(false);

  return (
    <Dialog open={open} title={t('settings.title')} onClose={close}>
      <div className="dialog-body settings">
        <h2>{t('settings.title')}</h2>

        <fieldset>
          <legend>{t('settings.theme')}</legend>
          {THEMES.map((theme) => (
            <label key={theme} className="radio">
              <input
                type="radio"
                name="theme"
                value={theme}
                checked={settings.theme === theme}
                onChange={() => update({ theme })}
              />
              {t(`settings.theme.${theme}`)}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>{t('settings.defaultView')}</legend>
          {VIEWS.map((mode) => (
            <label key={mode} className="radio">
              <input
                type="radio"
                name="defaultView"
                value={mode}
                checked={settings.defaultViewMode === mode}
                onChange={() => update({ defaultViewMode: mode })}
              />
              {t(`view.${mode}`)}
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>{t('settings.fontSize')}</legend>
          {FONT_SIZES.map((size) => (
            <label key={size} className="radio">
              <input
                type="radio"
                name="fontSize"
                value={size}
                checked={settings.fontSize === size}
                onChange={() => update({ fontSize: size })}
              />
              {t(`settings.fontSize.${size}`)}
            </label>
          ))}
        </fieldset>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.lineWrapping}
            onChange={(e) => update({ lineWrapping: e.target.checked })}
          />
          {t('settings.lineWrapping')}
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.lineNumbers}
            onChange={(e) => update({ lineNumbers: e.target.checked })}
          />
          {t('settings.lineNumbers')}
        </label>

        {/* Hidden while English is the only language: a one-option picker is noise. */}
        {SUPPORTED_LOCALES.length > 1 ? (
          <label className="field">
            {t('settings.language')}
            <select
              value={settings.language}
              onChange={(e) => update({ language: e.target.value as LocalePreference })}
            >
              <option value="system">{t('settings.language.system')}</option>
              {SUPPORTED_LOCALES.map((locale) => (
                <option key={locale} value={locale} lang={locale}>
                  {LOCALES[locale].name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.webImages}
            onChange={(e) => update({ webImages: e.target.checked })}
          />
          {t('settings.webImages')}
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.exportFrontMatter}
            onChange={(e) => update({ exportFrontMatter: e.target.checked })}
          />
          {t('export.frontMatter')}
        </label>

        <label className="checkbox">
          <input
            type="checkbox"
            checked={settings.linkedScroll}
            onChange={(e) => update({ linkedScroll: e.target.checked })}
          />
          {t('settings.linkedScroll')}
        </label>

        <nav className="settings-help" aria-label={t('settings.help')}>
          <h3>{t('settings.help')}</h3>
          <button
            type="button"
            className="link-button"
            onClick={() => {
              close();
              void openUserGuide();
            }}
          >
            {t('start.guide')}
          </button>
          <a href={GUIDE_PDF} target="_blank" rel="noopener">
            {t('start.guidePdf')}
          </a>
          <a href={BOOK_PDF} target="_blank" rel="noopener">
            {t('start.bookPdf')}
          </a>
          <a href={BOOK_EPUB} download>
            {t('start.bookEpub')}
          </a>
        </nav>

        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={close}>
            {t('settings.close')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
