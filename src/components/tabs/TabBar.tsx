import type { KeyboardEvent, MouseEvent } from 'react';
import { isDirty } from '@/domain/document';
import { t } from '@/i18n';
import { closeTab, switchTab } from '@/services/documentActions';
import { syncedTabs, useStore } from '@/store';

/** One button per open document. Only rendered with two or more tabs. */
export function TabBar() {
  // Re-render on edits too: the active tab's dirty dot follows `doc`.
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const doc = useStore((s) => s.doc);
  const fileHandle = useStore((s) => s.fileHandle);
  const handleId = useStore((s) => s.handleId);
  const shown = syncedTabs({ tabs, activeTabId, doc, fileHandle, handleId });

  // Arrow keys move between tabs, as in the WAI-ARIA tabs pattern.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const index = shown.findIndex((tab) => tab.id === activeTabId);
    const step = e.key === 'ArrowRight' ? 1 : -1;
    const next = shown[(index + step + shown.length) % shown.length];
    if (!next) return;
    void switchTab(next.id);
    requestAnimationFrame(() => document.getElementById(`tab-${next.id}`)?.focus());
  };

  return (
    <div className="tab-bar" role="tablist" aria-label={t('tabs.label')} onKeyDown={onKeyDown}>
      {shown.map((tab) => {
        const active = tab.id === activeTabId;
        const name = tab.doc.fileName;
        const onAuxClick = (e: MouseEvent) => {
          if (e.button === 1) void closeTab(tab.id);
        };
        return (
          <div key={tab.id} className="tab" data-active={active || undefined}>
            <button
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className="tab-label"
              title={name}
              onClick={() => void switchTab(tab.id)}
              onAuxClick={onAuxClick}
            >
              <span className="tab-name">{name}</span>
              {isDirty(tab.doc) ? (
                <span className="dirty-dot" role="img" aria-label={t('toolbar.unsaved')}>
                  ●
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="tab-close"
              aria-label={t('tabs.close', { name })}
              title={`${t('tabs.close', { name })} (Alt+W)`}
              tabIndex={-1}
              onClick={() => void closeTab(tab.id)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
