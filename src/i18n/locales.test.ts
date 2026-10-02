import { describe, expect, it } from 'vitest';
import { isLocale, LOCALES, resolveLocale } from './locales';

describe('resolveLocale', () => {
  const supported = ['en', 'da', 'pt-BR'];
  const resolve = (pref: string, browser: string[]) =>
    resolveLocale(pref, browser, supported, 'en');

  it('uses an explicit preference when supported', () => {
    expect(resolve('da', ['en-US'])).toBe('da');
    expect(resolve('fr', ['da'])).toBe('en');
  });

  it('follows the browser languages in order', () => {
    expect(resolve('system', ['fr-FR', 'da-DK', 'en'])).toBe('da');
    expect(resolve('system', ['EN-gb'])).toBe('en');
  });

  it('prefers an exact regional match over the base language', () => {
    expect(resolve('system', ['pt-BR'])).toBe('pt-BR');
    expect(resolve('system', ['pt-PT'])).toBe('en');
  });

  it('falls back when nothing matches', () => {
    expect(resolve('system', [])).toBe('en');
    expect(resolve('system', ['ja'])).toBe('en');
  });
});

describe('LOCALES', () => {
  it('registers English', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('xx')).toBe(false);
    expect(isLocale('toString')).toBe(false);
  });

  it('gives every locale a non-empty message for every key', () => {
    const keys = Object.keys(LOCALES.en.messages);
    for (const { messages } of Object.values(LOCALES)) {
      expect(Object.keys(messages).sort()).toEqual([...keys].sort());
      for (const value of Object.values(messages)) expect(value).not.toBe('');
    }
  });
});
