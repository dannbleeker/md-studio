import { useMemo, useState } from 'react';
import { fuzzyFilter } from '@/domain/fuzzy';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { Dialog } from '../ui/Dialog';
import { COMMANDS, type Command } from './commands';

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

/** Mounted only while open, so the query and selection reset each time. */
function PaletteBody({ onDone }: { onDone: () => void }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const results = useMemo(() => fuzzyFilter(COMMANDS, query, (c) => t(c.label)), [query]);

  const run = (command: Command | undefined) => {
    if (!command) return;
    onDone();
    command.run();
  };

  return (
    <div className="palette-body">
      <input
        className="palette-input"
        // biome-ignore lint/a11y/noAutofocus: the palette exists to be typed into.
        autoFocus
        role="combobox"
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
            run(results[active]);
          }
        }}
      />
      <div id="palette-list" role="listbox" className="palette-list">
        {results.length === 0 ? (
          <div className="muted palette-empty">{t('palette.empty')}</div>
        ) : null}
        {results.map((command, i) => (
          <div
            key={command.id}
            tabIndex={-1}
            id={`cmd-${command.id}`}
            role="option"
            aria-selected={i === active}
            className="palette-item"
            onPointerMove={() => setActive(i)}
            onClick={() => run(command)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') run(command);
            }}
          >
            <span>{t(command.label)}</span>
            {command.shortcut ? <kbd>{command.shortcut}</kbd> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
