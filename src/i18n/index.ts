import { en, type MessageKey } from './en';

/** Looks up a message and fills `{param}` placeholders. */
export function t(key: MessageKey, params?: Record<string, string>): string {
  const message: string = en[key];
  if (!params) return message;
  return message.replace(/\{(\w+)\}/g, (match, name: string) => params[name] ?? match);
}
