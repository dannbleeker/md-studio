import { useSyncExternalStore } from 'react';

const QUERY = '(max-width: 720px)';

const subscribe = (onChange: () => void) => {
  const mql = window.matchMedia?.(QUERY);
  mql?.addEventListener('change', onChange);
  return () => mql?.removeEventListener('change', onChange);
};

/** Below 720px the split view stacks the panes vertically (see mobile.css). */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(QUERY).matches ?? false,
    () => false
  );
}
