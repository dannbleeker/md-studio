import { useEffect, useState } from 'react';
import { getLocale, setLocale } from '@/i18n';
import { DEFAULT_LOCALE, type Locale, resolveLocale, SUPPORTED_LOCALES } from '@/i18n/locales';
import { useStore } from '@/store';

const browserLanguages = (): readonly string[] =>
  typeof navigator === 'undefined' ? [] : navigator.languages;

/**
 * Keeps the active UI language in step with the setting and the browser.
 * Called from App: the locale is switched during App's render, before its
 * children render, so the whole tree re-renders in the new language in one
 * pass (no component holds translated text in state).
 */
export function useLocale(): Locale {
  const preference = useStore((s) => s.settings.language);
  const [languages, setLanguages] = useState(browserLanguages);
  useEffect(() => {
    const onChange = () => setLanguages(browserLanguages());
    window.addEventListener('languagechange', onChange);
    return () => window.removeEventListener('languagechange', onChange);
  }, []);
  const locale = resolveLocale(preference, languages, SUPPORTED_LOCALES, DEFAULT_LOCALE);
  if (getLocale() !== locale) setLocale(locale);
  return locale;
}
