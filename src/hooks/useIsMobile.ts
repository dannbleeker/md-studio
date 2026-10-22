import { useSyncExternalStore } from 'react';

export const MOBILE_QUERY = '(max-width: 720px)';
const QUERY = MOBILE_QUERY;

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia?.(QUERY);
  mql?.addEventListener('change', onChange);
  return () => mql?.removeEventListener('change', onChange);
};

/** Below 720px the split view stacks the panes vertically (see the 720px rules in editor.css). */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(QUERY).matches ?? false,
    () => false
  );
}

/** The same test, read once: for an event handler that cannot subscribe. */
export const isMobileNow = (): boolean => window.matchMedia?.(MOBILE_QUERY).matches ?? false;
