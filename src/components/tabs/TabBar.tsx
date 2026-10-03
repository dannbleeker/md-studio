import { type DragEvent, type KeyboardEvent, type MouseEvent, useState } from 'react';
import { isDirty } from '@/domain/document';
import { forPlatform } from '@/domain/keys';
import { tabLabels } from '@/domain/tabs';
import { t } from '@/i18n';
import { closeTab, switchTab } from '@/services/documentActions';
import { isMac } from '@/services/platform';
import { syncedTabs, useStore } from '@/store';

/** Our own drag type, so a dragged tab is never mistaken for a dropped file. */
const TAB_DRAG = 'application/x-md-studio-tab';

const focusTab = (id: string) =>
  requestAnimationFrame(() => document.getElementById(`tab-${id}`)?.focus());

/** One button per open document. Only rendered with two or more tabs. */
export function TabBar() {
  // Re-render on edits too: the active tab's dirty dot and label follow `doc`.
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const doc = useStore((s) => s.doc);
  const fileHandle = useStore((s) => s.fileHandle);
  const handleId = useStore((s) => s.handleId);
  const shown = syncedTabs({ tabs, activeTabId, doc, fileHandle, handleId });
  const labels = tabLabels(shown);
  /** Insertion point while a tab is dragged: before the tab at this index. */
  const [dropAt, setDropAt] = useState<number | null>(null);

  // Arrow keys move between tabs (WAI-ARIA tabs pattern); with Shift they
  // move the active tab itself, the keyboard way to reorder.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const index = shown.findIndex((tab) => tab.id === activeTabId);
    const step = e.key === 'ArrowRight' ? 1 : -1;
    if (e.shiftKey) {
      useStore.getState().moveTab(activeTabId, index + step);
      focusTab(activeTabId);
      return;
    }
    const next = shown[(index + step + shown.length) % shown.length];
    if (!next) return;
    void switchTab(next.id);
    focusTab(next.id);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>, index: number) => {
    if (!e.dataTransfer.types.includes(TAB_DRAG)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const box = e.currentTarget.getBoundingClientRect();
    setDropAt(e.clientX < box.left + box.width / 2 ? index : index + 1);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const id = e.dataTransfer.getData(TAB_DRAG);
    if (!id || dropAt === null) return;
    e.preventDefault();
    const from = shown.findIndex((tab) => tab.id === id);
    // moveTab counts positions without the moved tab.
    useStore.getState().moveTab(id, from < dropAt ? dropAt - 1 : dropAt);
    setDropAt(null);
  };

  return (
    <div
      className="tab-bar"
      role="tablist"
      aria-label={t('tabs.label')}
      onKeyDown={onKeyDown}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropAt(null);
      }}
    >
      {shown.map((tab, index) => {
        const active = tab.id === activeTabId;
        const label = labels[index] ?? tab.doc.fileName;
        const onAuxClick = (e: MouseEvent) => {
          if (e.button === 1) void closeTab(tab.id);
        };
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: drag and drop target; the keyboard path is Shift+Arrow on the tab button.
          <div
            key={tab.id}
            className="tab"
            data-active={active || undefined}
            data-drop={dropAt === index ? 'before' : dropAt === index + 1 ? 'after' : undefined}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(TAB_DRAG, tab.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            onDragOver={(e) => onDragOver(e, index)}
            onDrop={onDrop}
            onDragEnd={() => setDropAt(null)}
          >
            <button
              type="button"
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              className="tab-label"
              title={label}
              onClick={() => void switchTab(tab.id)}
              onAuxClick={onAuxClick}
            >
              <span className="tab-name">{label}</span>
              {isDirty(tab.doc) ? (
                <span className="dirty-dot" role="img" aria-label={t('toolbar.unsaved')}>
                  ●
                </span>
              ) : null}
            </button>
            <button
              type="button"
              className="tab-close"
              aria-label={t('tabs.close', { name: label })}
              // Only the hint goes through forPlatform: a file name may itself contain "Ctrl+".
              title={`${t('tabs.close', { name: label })} (${forPlatform('Alt+W', isMac())})`}
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
