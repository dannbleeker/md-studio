import type { ExportFormat, HtmlTheme } from '@/domain/exportFormats';
import type { LinkStyle } from '@/domain/vaultConfig';
import { isLocale, type LocalePreference } from '@/i18n/locales';

export type ViewMode = 'split' | 'text' | 'visual' | 'read';
/** The view modes that edit: every one but Read view. */
export type EditMode = Exclude<ViewMode, 'read'>;
export type ThemePreference = 'system' | 'light' | 'dark';
export type FontSize = 'small' | 'medium' | 'large';
export type ReadWidth = 'narrow' | 'medium' | 'wide';
export type ReadFont = 'sans' | 'serif';
export type ReadSpacing = 'compact' | 'normal' | 'relaxed';
export type ReadTheme = 'match' | 'sepia';

export type Settings = {
  theme: ThemePreference;
  linkedScroll: boolean;
  defaultViewMode: ViewMode;
  /** The editing layout last used, which Edit returns to from Read view. */
  editMode: EditMode;
  showOutline: boolean;
  /** The folder panel (notes of the opened folder, links to this note) beside the editors. */
  showFolder: boolean;
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
  /** How inserted attachment links are written; auto follows the vault's app.json. */
  linkStyle: LinkStyle;
  /** Where pasted and dropped files are saved: the vault's folder rule, or images/ beside the note. */
  attachmentRules: AttachmentRules;
  /** Files opened from disk, by drop, or from the recent list show in Read view. */
  openInReadView: boolean;
  /** Read view's page: column width, typeface, line spacing and colours. */
  readWidth: ReadWidth;
  readFont: ReadFont;
  readSpacing: ReadSpacing;
  readTheme: ReadTheme;
  /** The first-run tip (press Edit, Ctrl+K) was dismissed, or Edit was used. */
  tipSeen: boolean;
};

type AttachmentRules = 'vault' | 'images';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  linkedScroll: true,
  defaultViewMode: 'read',
  editMode: 'split',
  showOutline: false,
  showFolder: false,
  language: 'system',
  fontSize: 'medium',
  lineWrapping: true,
  lineNumbers: true,
  webImages: false,
  exportFormat: 'pdf',
  exportHtmlTheme: 'auto',
  exportFrontMatter: false,
  linkStyle: 'auto',
  attachmentRules: 'vault',
  openInReadView: true,
  readWidth: 'medium',
  readFont: 'sans',
  readSpacing: 'normal',
  readTheme: 'match',
  tipSeen: false,
};

export const EDIT_MODES: readonly EditMode[] = ['split', 'text', 'visual'];
const VIEW_MODES: readonly ViewMode[] = [...EDIT_MODES, 'read'];
const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];
export const FONT_SIZES: readonly FontSize[] = ['small', 'medium', 'large'];
const EXPORT_FORMATS: readonly ExportFormat[] = ['html', 'pdf', 'docx', 'txt'];
const HTML_THEMES: readonly HtmlTheme[] = ['auto', 'light', 'dark'];
const LINK_STYLES: readonly LinkStyle[] = ['wikilink', 'markdown', 'auto'];
const ATTACHMENT_RULES: readonly AttachmentRules[] = ['vault', 'images'];
export const READ_WIDTHS: readonly ReadWidth[] = ['narrow', 'medium', 'wide'];
export const READ_FONTS: readonly ReadFont[] = ['sans', 'serif'];
export const READ_SPACINGS: readonly ReadSpacing[] = ['compact', 'normal', 'relaxed'];
export const READ_THEMES: readonly ReadTheme[] = ['match', 'sepia'];

const oneOf = <T>(allowed: readonly T[], value: unknown, fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
const bool = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

/** Accepts whatever storage held and keeps only well-typed fields. */
export function sanitizeSettings(raw: Record<string, unknown>): Settings {
  const d = DEFAULT_SETTINGS;
  // Settings saved before Read view became the default have no editMode. They move to Read
  // view once (files open in it, and so does the app); the editing layout they started in is
  // kept as the one Edit returns to. Saved again, they carry editMode and stay as chosen.
  const earlier = Object.keys(raw).length > 0 && !('editMode' in raw);
  const startMode = oneOf(VIEW_MODES, raw.defaultViewMode, d.defaultViewMode);
  return {
    theme: oneOf(THEMES, raw.theme, d.theme),
    linkedScroll: bool(raw.linkedScroll, d.linkedScroll),
    defaultViewMode: earlier ? 'read' : startMode,
    editMode: oneOf(EDIT_MODES, earlier ? raw.defaultViewMode : raw.editMode, d.editMode),
    showOutline: bool(raw.showOutline, d.showOutline),
    showFolder: bool(raw.showFolder, d.showFolder),
    language: raw.language === 'system' || isLocale(raw.language) ? raw.language : d.language,
    fontSize: oneOf(FONT_SIZES, raw.fontSize, d.fontSize),
    lineWrapping: bool(raw.lineWrapping, d.lineWrapping),
    lineNumbers: bool(raw.lineNumbers, d.lineNumbers),
    webImages: bool(raw.webImages, d.webImages),
    exportFormat: oneOf(EXPORT_FORMATS, raw.exportFormat, d.exportFormat),
    exportHtmlTheme: oneOf(HTML_THEMES, raw.exportHtmlTheme, d.exportHtmlTheme),
    exportFrontMatter: bool(raw.exportFrontMatter, d.exportFrontMatter),
    linkStyle: oneOf(LINK_STYLES, raw.linkStyle, d.linkStyle),
    attachmentRules: oneOf(ATTACHMENT_RULES, raw.attachmentRules, d.attachmentRules),
    openInReadView: earlier ? true : bool(raw.openInReadView, d.openInReadView),
    readWidth: oneOf(READ_WIDTHS, raw.readWidth, d.readWidth),
    readFont: oneOf(READ_FONTS, raw.readFont, d.readFont),
    readSpacing: oneOf(READ_SPACINGS, raw.readSpacing, d.readSpacing),
    readTheme: oneOf(READ_THEMES, raw.readTheme, d.readTheme),
    tipSeen: bool(raw.tipSeen, d.tipSeen),
  };
}
