import { en } from './en';

/** Every locale must translate every key; `en` is the reference. */
export type Messages = { readonly [K in keyof typeof en]: string };

/**
 * Supported UI languages. To add one: create `xx.ts` exporting a
 * `Messages` object and register it here. The settings dialog shows a
 * language picker as soon as there is more than one entry.
 */
export const LOCALES = {
  en: { name: 'English', messages: en },
} as const satisfies Record<string, { name: string; messages: Messages }>;

export type Locale = keyof typeof LOCALES;
export type LocalePreference = 'system' | Locale;

export const DEFAULT_LOCALE: Locale = 'en';
export const SUPPORTED_LOCALES = Object.keys(LOCALES) as Locale[];

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && Object.hasOwn(LOCALES, value);
}

/**
 * Picks the UI language: an explicit preference wins; with 'system' the
 * first browser language we support, matched exactly ("pt-BR") and then by
 * its base language ("da-DK" -> "da"); else the default.
 */
export function resolveLocale<L extends string>(
  preference: 'system' | L,
  browserLanguages: readonly string[],
  supported: readonly L[],
  fallback: L
): L {
  if (preference !== 'system') return supported.includes(preference) ? preference : fallback;
  const byLower = new Map(supported.map((l) => [l.toLowerCase(), l]));
  for (const tag of browserLanguages) {
    const lower = tag.toLowerCase();
    const match = byLower.get(lower) ?? byLower.get(lower.split('-')[0] ?? '');
    if (match) return match;
  }
  return fallback;
}
