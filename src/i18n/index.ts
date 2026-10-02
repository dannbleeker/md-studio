import { en, type MessageKey } from './en';
import { DEFAULT_LOCALE, LOCALES, type Locale, type Messages } from './locales';

let active: Locale = DEFAULT_LOCALE;
let messages: Messages = en;
const formatters = new Map<string, Intl.DateTimeFormat>();

/** Switches the UI language; components pick it up on their next render. */
export function setLocale(locale: Locale): void {
  // Not an early return: with a single locale TypeScript would narrow
  // `locale` to never below it.
  const changed = locale !== active;
  active = locale;
  messages = LOCALES[locale].messages;
  if (changed) formatters.clear();
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
}

export function getLocale(): Locale {
  return active;
}

/** Looks up a message and fills `{param}` placeholders. */
export function t(key: MessageKey, params?: Record<string, string>): string {
  const message: string = messages[key];
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
}

/** A date formatter in the UI language, cached per option set. */
export function dateTimeFormat(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let format = formatters.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(active, options);
    formatters.set(key, format);
  }
  return format;
}
