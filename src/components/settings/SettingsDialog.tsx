import type { ReactNode } from 'react';
import { t } from '@/i18n';
import type { MessageKey } from '@/i18n/en';
import { LOCALES, type LocalePreference, SUPPORTED_LOCALES } from '@/i18n/locales';
import { useStore } from '@/store';
import { FONT_SIZES, type Settings, type ThemePreference, type ViewMode } from '@/store/settings';
import { useUiStore } from '@/store/ui';
import { Dialog } from '../ui/Dialog';
import { GuideLinks } from '../ui/GuideLinks';

const THEMES: ThemePreference[] = ['system', 'light', 'dark'];
// Read view first: it is where files open.
const VIEWS: ViewMode[] = ['read', 'split', 'text', 'visual'];
const LINK_STYLES: Settings['linkStyle'][] = ['auto', 'wikilink', 'markdown'];
const ATTACHMENT_RULES: Settings['attachmentRules'][] = ['vault', 'images'];

type BooleanSetting = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

/** A checkbox for one on/off setting, with a line saying what it does. */
function Check({
  setting,
  label,
  hint,
}: {
  setting: BooleanSetting;
  label: MessageKey;
  hint?: MessageKey;
}) {
  const value = useStore((s) => s.settings[setting]);
  const update = useStore((s) => s.updateSettings);
  return (
    <div className="setting">
      <label className="checkbox">
        <input
          type="checkbox"
          checked={value}
          onChange={(e) => update({ [setting]: e.target.checked })}
        />
        {t(label)}
      </label>
      {hint ? <p className="muted setting-hint">{t(hint)}</p> : null}
    </div>
  );
}

/** A group of radio buttons for one setting with a few values. */
function Choice<K extends keyof Settings>({
  setting,
  legend,
  options,
  label,
  hint,
}: {
  setting: K;
  legend: MessageKey;
  options: readonly Settings[K][];
  label: (value: Settings[K]) => string;
  hint?: ReactNode;
}) {
  const value = useStore((s) => s.settings[setting]);
  const update = useStore((s) => s.updateSettings);
  return (
    <fieldset>
      <legend>{t(legend)}</legend>
      {options.map((option) => (
        <label key={String(option)} className="radio">
          <input
            type="radio"
            name={setting}
            value={String(option)}
            checked={value === option}
            onChange={() => update({ [setting]: option } as Partial<Settings>)}
          />
          {label(option)}
        </label>
      ))}
      {hint ? <p className="muted setting-hint">{hint}</p> : null}
    </fieldset>
  );
}

/**
 * The settings in sections, the everyday ones first. Vault, privacy, export
 * and language settings sit under "More settings", folded until opened.
 */
export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);
  const language = useStore((s) => s.settings.language);
  const update = useStore((s) => s.updateSettings);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const close = () => setOpen(false);

  return (
    <Dialog open={open} title={t('settings.title')} onClose={close}>
      <div className="dialog-body settings">
        <h2>{t('settings.title')}</h2>

        <section aria-labelledby="settings-appearance">
          <h3 id="settings-appearance">{t('settings.section.appearance')}</h3>
          <Choice
            setting="theme"
            legend="settings.theme"
            options={THEMES}
            label={(theme) => t(`settings.theme.${theme}`)}
          />
          <Choice
            setting="fontSize"
            legend="settings.fontSize"
            options={FONT_SIZES}
            label={(size) => t(`settings.fontSize.${size}`)}
          />
        </section>

        <section aria-labelledby="settings-reading">
          <h3 id="settings-reading">{t('settings.section.reading')}</h3>
          <Check
            setting="openInReadView"
            label="settings.openInReadView"
            hint="settings.openInReadView.hint"
          />
          <Choice
            setting="defaultViewMode"
            legend="settings.defaultView"
            options={VIEWS}
            label={(mode) => t(`view.${mode}`)}
            hint={t('settings.defaultView.hint')}
          />
        </section>

        <section aria-labelledby="settings-editing">
          <h3 id="settings-editing">{t('settings.section.editing')}</h3>
          <Check setting="lineWrapping" label="settings.lineWrapping" />
          <Check setting="lineNumbers" label="settings.lineNumbers" />
          <Check
            setting="linkedScroll"
            label="settings.linkedScroll"
            hint="settings.linkedScroll.hint"
          />
        </section>

        <details className="settings-more">
          <summary>{t('settings.more')}</summary>

          <section aria-labelledby="settings-files">
            <h3 id="settings-files">{t('settings.section.files')}</h3>
            <Choice
              setting="linkStyle"
              legend="settings.linkStyle"
              options={LINK_STYLES}
              label={(style) => t(`settings.linkStyle.${style}`)}
              hint={t('settings.linkStyle.autoHint')}
            />
            <Choice
              setting="attachmentRules"
              legend="settings.attachmentRules"
              options={ATTACHMENT_RULES}
              label={(rule) => t(`settings.attachmentRules.${rule}`)}
            />
          </section>

          <section aria-labelledby="settings-privacy">
            <h3 id="settings-privacy">{t('settings.section.privacy')}</h3>
            <Check setting="webImages" label="settings.webImages" />
          </section>

          <section aria-labelledby="settings-export">
            <h3 id="settings-export">{t('settings.section.export')}</h3>
            <Check setting="exportFrontMatter" label="export.frontMatter" />
          </section>

          {/* Hidden while English is the only language: a one-option picker is noise. */}
          {SUPPORTED_LOCALES.length > 1 ? (
            <label className="field">
              {t('settings.language')}
              <select
                value={language}
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
        </details>

        <nav className="settings-help" aria-label={t('settings.help')}>
          <h3>{t('settings.help')}</h3>
          <GuideLinks beforeGuide={close} />
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
