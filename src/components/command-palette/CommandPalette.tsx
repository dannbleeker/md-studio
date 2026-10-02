import { useEffect, useMemo, useState } from 'react';
import { fuzzyFilter } from '@/domain/fuzzy';
import { findHeadings } from '@/domain/headings';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { jumpToHeading } from '../editor/jumpToHeading';
import { Dialog } from '../ui/Dialog';
import { COMMANDS } from './commands';

export function CommandPalette() {
  const open = useStore((s) => s.paletteOpen);
  const setOpen = useStore((s) => s.setPaletteOpen);
  return (
    <Dialog
      open={open}
      title={t('toolbar.commands')}
      onClose={() => setOpen(false)}
      className="palette"
    >
      <PaletteBody onDone={() => setOpen(false)} />
    </Dialog>
  );
}

type Item = { id: string; text: string; hint?: string; level?: number; pick: () => void };

/** Mounted only while open, so the query and selection reset each time. */
function PaletteBody({ onDone }: { onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const markdown = useStore((s) => s.doc.markdown);
  const inEditor = useStore((s) => s.screen === 'editor');
  // A leading "#" searches the document's headings instead of commands.
  const headingMode = query.startsWith('#');

  const results = useMemo<Item[]>(() => {
    if (headingMode) {
      if (!inEditor) return [];
      const headings = findHeadings(markdown);
      const items = headings.map((h, index) => ({
        id: `h-${index}`,
        text: h.text || '—',
        hint: `H${h.level}`,
        level: h.level,
        pick: () => {
          onDone();
          jumpToHeading(headings, index);
        },
      }));
      return fuzzyFilter(items, query.slice(1).trim(), (item) => item.text);
    }
    const items = COMMANDS.map((c) => ({
      id: c.id,
      text: t(c.label),
      ...(c.shortcut ? { hint: c.shortcut } : {}),
      pick: () => {
        if (c.query !== undefined) {
          setQuery(c.query);
          setActive(0);
          return;
        }
        onDone();
        c.run();
      },
    }));
    return fuzzyFilter(items, query, (item) => item.text);
  }, [headingMode, inEditor, markdown, query, onDone]);

  // Keep the keyboard selection visible in a long list.
  useEffect(() => {
    const id = results[active]?.id;
    if (id) document.getElementById(`cmd-${id}`)?.scrollIntoView?.({ block: 'nearest' });
  }, [active, results]);

  const emptyText = !headingMode
    ? t('palette.empty')
    : query.length > 1 && inEditor && findHeadings(markdown).length > 0
      ? t('palette.empty')
      : t('palette.noHeadings');

  return (
    <div className="palette-body">
      <input
        className="palette-input"
        // biome-ignore lint/a11y/noAutofocus: the palette exists to be typed into.
        autoFocus
        role="combobox"
        aria-label={t('toolbar.commands')}
        aria-expanded="true"
        aria-controls="palette-list"
        aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
        placeholder={t('palette.placeholder')}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            results[active]?.pick();
          }
        }}
      />
      <div id="palette-list" role="listbox" className="palette-list">
        {results.length === 0 ? <div className="muted palette-empty">{emptyText}</div> : null}
        {results.map((item, i) => (
          <div
            key={item.id}
            tabIndex={-1}
            id={`cmd-${item.id}`}
            role="option"
            aria-selected={i === active}
            className="palette-item"
            style={item.level ? { paddingLeft: `${0.75 + (item.level - 1) * 0.75}rem` } : undefined}
            onPointerMove={() => setActive(i)}
            onClick={() => item.pick()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') item.pick();
            }}
          >
            <span>{item.text}</span>
            {item.hint ? <kbd>{item.hint}</kbd> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
