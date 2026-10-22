import { t } from '@/i18n';
import { useStore } from '@/store';
import {
  READ_FONTS,
  READ_SPACINGS,
  READ_THEMES,
  READ_WIDTHS,
  type Settings,
} from '@/store/settings';
import { useUiStore } from '@/store/ui';
import { Dialog } from '../ui/Dialog';

type Choice<K extends keyof Settings> = {
  key: K;
  legend: string;
  values: readonly Settings[K][];
  label: (value: Settings[K]) => string;
};

/** The page controls of Read view: each choice applies at once. */
export function ReaderDialog() {
  const open = useUiStore((s) => s.readerOpen);
  const setOpen = useUiStore((s) => s.setReaderOpen);
  const settings = useStore((s) => s.settings);
  const update = useStore((s) => s.updateSettings);

  const group = <K extends 'readWidth' | 'readFont' | 'readSpacing' | 'readTheme'>(
    choice: Choice<K>
  ) => (
    <fieldset key={choice.key}>
      <legend>{choice.legend}</legend>
      {choice.values.map((value) => (
        <label key={String(value)} className="radio">
          <input
            type="radio"
            name={choice.key}
            value={String(value)}
            checked={settings[choice.key] === value}
            onChange={() => update({ [choice.key]: value } as Partial<Settings>)}
          />
          {choice.label(value)}
        </label>
      ))}
    </fieldset>
  );

  return (
    <Dialog open={open} title={t('reader.title')} onClose={() => setOpen(false)}>
      <div className="dialog-body settings">
        <h2>{t('reader.title')}</h2>
        {group({
          key: 'readWidth',
          legend: t('reader.width'),
          values: READ_WIDTHS,
          label: (v) => t(`reader.width.${v}`),
        })}
        {group({
          key: 'readFont',
          legend: t('reader.font'),
          values: READ_FONTS,
          label: (v) => t(`reader.font.${v}`),
        })}
        {group({
          key: 'readSpacing',
          legend: t('reader.spacing'),
          values: READ_SPACINGS,
          label: (v) => t(`reader.spacing.${v}`),
        })}
        {group({
          key: 'readTheme',
          legend: t('reader.theme'),
          values: READ_THEMES,
          label: (v) => t(`reader.theme.${v}`),
        })}
        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={() => setOpen(false)}>
            {t('reader.done')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
