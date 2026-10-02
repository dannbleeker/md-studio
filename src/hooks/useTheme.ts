import { useEffect } from 'react';
import { useStore } from '@/store';

/**
 * Applies the theme preference as `data-theme` on <html>. "system" removes
 * the attribute and lets the `prefers-color-scheme` media query in
 * styles/tokens.css decide.
 */
export function useTheme(): void {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
  }, [theme]);
}
