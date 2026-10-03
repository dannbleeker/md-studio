import type { ExportFormat, HtmlTheme } from '@/domain/exportFormats';
import { isLocale, type LocalePreference } from '@/i18n/locales';

export type ViewMode = 'split' | 'text' | 'visual';
export type ThemePreference = 'system' | 'light' | 'dark';
export type FontSize = 'small' | 'medium' | 'large';

export type Settings = {
  theme: ThemePreference;
  linkedScroll: boolean;
  defaultViewMode: ViewMode;
  showOutline: boolean;
  language: LocalePreference;
  /** Text size of both editors. */
  fontSize: FontSize;
  /** Text pane only; the visual pane always wraps. */
  lineWrapping: boolean;
  lineNumbers: boolean;
  /**
   * Show images from other servers in the visual pane. Off by default: a
   * web image tells its server when (and from where) the document is read.
   */
  webImages: boolean;
  /** The Export dialog's last choices, offered again next time. */
  exportFormat: ExportFormat;
  exportHtmlTheme: HtmlTheme;
  /**
   * Include YAML front matter in exports and print. Off by default: it is
   * metadata for other tools, not part of the document's text.
   */
  exportFrontMatter: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  linkedScroll: true,
  defaultViewMode: 'split',
  showOutline: false,
  language: 'system',
  fontSize: 'medium',
  lineWrapping: true,
  lineNumbers: true,
  webImages: false,
  exportFormat: 'pdf',
  exportHtmlTheme: 'auto',
  exportFrontMatter: false,
};

const VIEW_MODES: readonly ViewMode[] = ['split', 'text', 'visual'];
const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];
export const FONT_SIZES: readonly FontSize[] = ['small', 'medium', 'large'];
const EXPORT_FORMATS: readonly ExportFormat[] = ['html', 'pdf', 'docx', 'txt'];
const HTML_THEMES: readonly HtmlTheme[] = ['auto', 'light', 'dark'];

const oneOf = <T>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

/** Accepts whatever storage held and keeps only well-typed fields. */
export function sanitizeSettings(raw: Record<string, unknown>): Settings {
  const d = DEFAULT_SETTINGS;
  return {
    theme: oneOf(THEMES, raw.theme, d.theme),
    linkedScroll: bool(raw.linkedScroll, d.linkedScroll),
    defaultViewMode: oneOf(VIEW_MODES, raw.defaultViewMode, d.defaultViewMode),
    showOutline: bool(raw.showOutline, d.showOutline),
    language: raw.language === 'system' || isLocale(raw.language) ? raw.language : d.language,
    fontSize: oneOf(FONT_SIZES, raw.fontSize, d.fontSize),
    lineWrapping: bool(raw.lineWrapping, d.lineWrapping),
    lineNumbers: bool(raw.lineNumbers, d.lineNumbers),
    webImages: bool(raw.webImages, d.webImages),
    exportFormat: oneOf(EXPORT_FORMATS, raw.exportFormat, d.exportFormat),
    exportHtmlTheme: oneOf(HTML_THEMES, raw.exportHtmlTheme, d.exportHtmlTheme),
    exportFrontMatter: bool(raw.exportFrontMatter, d.exportFrontMatter),
  };
}
