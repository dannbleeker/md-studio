export type ViewMode = 'split' | 'text' | 'visual';
export type ThemePreference = 'system' | 'light' | 'dark';

export type Settings = {
  theme: ThemePreference;
  linkedScroll: boolean;
  defaultViewMode: ViewMode;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  linkedScroll: true,
  defaultViewMode: 'split',
};

const VIEW_MODES: readonly ViewMode[] = ['split', 'text', 'visual'];
const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];

/** Accepts whatever storage held and keeps only well-typed fields. */
export function sanitizeSettings(raw: Record<string, unknown>): Settings {
  return {
    theme: THEMES.includes(raw.theme as ThemePreference)
      ? (raw.theme as ThemePreference)
      : DEFAULT_SETTINGS.theme,
    linkedScroll:
      typeof raw.linkedScroll === 'boolean' ? raw.linkedScroll : DEFAULT_SETTINGS.linkedScroll,
    defaultViewMode: VIEW_MODES.includes(raw.defaultViewMode as ViewMode)
      ? (raw.defaultViewMode as ViewMode)
      : DEFAULT_SETTINGS.defaultViewMode,
  };
}
