import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { buildTree, type TreeNode } from '@/domain/folderTree';
import { fuzzyFilter } from '@/domain/fuzzy';
import { treeKey, visibleRows } from '@/domain/treeNav';
import { t } from '@/i18n';
import { type Backlinks, findBacklinks } from '@/services/backlinks';
import {
  allowFolder,
  closeFolder,
  currentFolderPath,
  folderRoot,
  openFolder,
  openFolderNote,
  refreshFolder,
  useFolder,
} from '@/services/folder';
import { useStore } from '@/store';
import { closeDrawers } from '../ui/drawers';

const MAX_FILTERED = 100;

/** Opens a note from the panel and, on a phone, slides the panel away. */
function pick(path: string): void {
  void openFolderNote(path);
  closeDrawers();
}

/** Every folder on the way to `path`, so the open note is visible in the tree. */
function ancestors(path: string | null): string[] {
  if (!path) return [];
  const parts = path.split('/');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}

type TreeProps = {
  nodes: TreeNode[];
  expanded: ReadonlySet<string>;
  current: string | null;
  /** The one row in the tab order; the arrow keys move it. */
  tabbable: string | null;
  onKey: (event: KeyboardEvent<HTMLElement>, path: string) => void;
  onActivate: (path: string, isDir: boolean) => void;
  depth?: number;
};

/**
 * An ARIA tree: one row is in the tab order and the arrow keys move between
 * rows (see `treeKey`). The row is the `li` itself, so a screen reader reads
 * "name, expanded, level 2" and a folder's contents are its group.
 */
function Tree({ nodes, expanded, current, tabbable, onKey, onActivate, depth = 0 }: TreeProps) {
  return (
    <ul
      className="folder-tree"
      role={depth === 0 ? 'tree' : 'group'}
      aria-label={depth === 0 ? t('folder.title') : undefined}
    >
      {nodes.map((node) => {
        const isDir = node.children !== null;
        const open = isDir && expanded.has(node.path);
        const label = isDir ? node.name : node.name.replace(/\.(?:md|markdown|mdown|mkd)$/i, '');
        return (
          <li
            key={node.path}
            role="treeitem"
            aria-level={depth + 1}
            aria-label={label}
            aria-expanded={isDir ? open : undefined}
            aria-selected={node.path === current}
            data-path={node.path}
            tabIndex={node.path === tabbable ? 0 : -1}
            title={isDir ? undefined : node.path}
            onKeyDown={(e) => {
              // Keys of a row inside this one belong to that row.
              if (e.target === e.currentTarget) onKey(e, node.path);
            }}
            onClick={(e) => {
              if ((e.target as Element).closest('li') === e.currentTarget)
                onActivate(node.path, isDir);
            }}
          >
            <div
              className={isDir ? 'folder-item folder-dir' : 'folder-item'}
              style={{ paddingLeft: `${0.4 + depth * 0.9}rem` }}
              aria-current={node.path === current ? 'page' : undefined}
            >
              {isDir ? <span aria-hidden="true">{open ? '▾' : '▸'} </span> : null}
              {label}
            </div>
            {open && node.children ? (
              <Tree
                nodes={node.children}
                expanded={expanded}
                current={current}
                tabbable={tabbable}
                onKey={onKey}
                onActivate={onActivate}
                depth={depth + 1}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Notes that link to the open one, found by reading the folder's notes. */
function LinkedFrom({ current }: { current: string | null }) {
  const notes = useFolder((s) => s.notes);
  const [result, setResult] = useState<Backlinks | 'working' | null>(null);

  useEffect(() => {
    const root = folderRoot();
    if (!root || !current) {
      setResult(null);
      return;
    }
    const controller = new AbortController();
    setResult('working');
    // A short pause, so stepping through notes does not start a search for each.
    const timer = setTimeout(() => {
      void findBacklinks(root, notes, current, controller.signal)
        .then((found) => {
          if (!controller.signal.aborted) setResult(found);
        })
        .catch(() => {
          if (!controller.signal.aborted) setResult(null);
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [current, notes]);

  return (
    <section className="folder-linked" aria-label={t('folder.linkedFrom')}>
      <h3 className="outline-title">{t('folder.linkedFrom')}</h3>
      {!current ? (
        <p className="muted outline-empty">{t('folder.linkedFromOutside')}</p>
      ) : result === 'working' || result === null ? (
        <p className="muted outline-empty">{t('folder.linkedFromWorking')}</p>
      ) : result.paths.length === 0 ? (
        <p className="muted outline-empty">{t('folder.linkedFromNone')}</p>
      ) : (
        <ul className="folder-tree">
          {result.paths.map((path) => (
            <li key={path}>
              <button
                type="button"
                className="folder-item"
                style={{ paddingLeft: '0.4rem' }}
                title={path}
                onClick={() => pick(path)}
              >
                {path.replace(/\.(?:md|markdown|mdown|mkd)$/i, '')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {result && result !== 'working' && result.tooMany ? (
        <p className="muted outline-empty">{t('folder.linkedFromMany')}</p>
      ) : null}
    </section>
  );
}

/** The folder opened for browsing: its notes as a tree, a filter, and what links to the open note. */
export function FolderPanel() {
  const { name, status, notes, truncated } = useFolder();
  const fileHandle = useStore((s) => s.fileHandle);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [current, setCurrent] = useState<string | null>(null);

  // The open note's place in the folder follows tab switches and opens.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `status` and `notes` say the folder changed.
  useEffect(() => {
    let live = true;
    void currentFolderPath().then((path) => {
      if (!live) return;
      setCurrent(path);
      if (path) setExpanded((open) => new Set([...open, ...ancestors(path)]));
    });
    return () => {
      live = false;
    };
  }, [fileHandle, status, notes]);

  const tree = useMemo(() => buildTree(notes), [notes]);
  const filtered = useMemo(
    () => (query.trim() === '' ? null : fuzzyFilter(notes, query, (p) => p).slice(0, MAX_FILTERED)),
    [notes, query]
  );
  const rows = useMemo(() => visibleRows(tree, expanded), [tree, expanded]);
  const [active, setActive] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  // The row in the tab order: the one last moved to, else the open note, else the first.
  const tabbable =
    [active, current].find((p) => p !== null && rows.some((r) => r.path === p)) ??
    rows[0]?.path ??
    null;

  const setOpen = (path: string, open: boolean) =>
    setExpanded((all) => {
      const next = new Set(all);
      if (open) next.add(path);
      else next.delete(path);
      return next;
    });
  const onActivate = (path: string, isDir: boolean) => {
    setActive(path);
    if (isDir) setOpen(path, !expanded.has(path));
    else {
      pick(path);
    }
  };
  const onKey = (event: KeyboardEvent<HTMLElement>, path: string) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const move = treeKey(rows, path, event.key);
    if (!move) return;
    event.preventDefault();
    if (move.expand) setOpen(move.expand, true);
    if (move.collapse) setOpen(move.collapse, false);
    if (move.activate) {
      pick(move.activate);
    }
    if (move.focus) {
      refocus.current = true;
      setActive(move.focus);
    }
  };
  // Moves focus after the render that made the target the tab stop.
  useEffect(() => {
    if (!refocus.current || active === null) return;
    refocus.current = false;
    listRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(active)}"]`)?.focus();
  }, [active]);

  return (
    <nav className="folder-panel" aria-label={t('folder.title')}>
      <div className="folder-head">
        <h2 className="outline-title" title={name ?? undefined}>
          {name ?? t('folder.title')}
        </h2>
        {name ? (
          <>
            <button
              type="button"
              className="btn-icon"
              onClick={() => void refreshFolder()}
              title={t('folder.refresh')}
              aria-label={t('folder.refresh')}
            >
              ↻
            </button>
            <button
              type="button"
              className="btn-icon"
              onClick={() => void closeFolder()}
              title={t('folder.close')}
              aria-label={t('folder.close')}
            >
              ×
            </button>
          </>
        ) : null}
      </div>

      {status === 'none' ? (
        <div className="folder-empty">
          <p className="muted">{t('folder.openHint')}</p>
          <button type="button" className="btn" onClick={() => void openFolder()}>
            {t('folder.open')}
          </button>
        </div>
      ) : status === 'needs-permission' ? (
        <div className="folder-empty">
          <button type="button" className="btn btn-primary" onClick={() => void allowFolder()}>
            {t('folder.allow', { name: name ?? '' })}
          </button>
          <p className="muted">{t('folder.allowHint')}</p>
        </div>
      ) : status === 'scanning' ? (
        <p className="muted outline-empty">{t('folder.scanning')}</p>
      ) : (
        <>
          <input
            className="findbar-input folder-filter"
            type="search"
            placeholder={t('folder.filter')}
            aria-label={t('folder.filter')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="folder-list" ref={listRef}>
            {notes.length === 0 ? (
              <p className="muted outline-empty">{t('folder.empty')}</p>
            ) : filtered ? (
              filtered.length === 0 ? (
                <p className="muted outline-empty">{t('folder.noMatch')}</p>
              ) : (
                <ul className="folder-tree">
                  {filtered.map((path) => (
                    <li key={path}>
                      <button
                        type="button"
                        className="folder-item"
                        style={{ paddingLeft: '0.4rem' }}
                        aria-current={path === current ? 'page' : undefined}
                        title={path}
                        onClick={() => pick(path)}
                      >
                        {path.replace(/\.(?:md|markdown|mdown|mkd)$/i, '')}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <Tree
                nodes={tree}
                expanded={expanded}
                current={current}
                tabbable={tabbable}
                onKey={onKey}
                onActivate={onActivate}
              />
            )}
            {truncated ? <p className="muted outline-empty">{t('folder.truncated')}</p> : null}
          </div>
          <LinkedFrom current={current} />
          <button
            type="button"
            className="link-button folder-change"
            onClick={() => void openFolder()}
          >
            {t('folder.change')}
          </button>
        </>
      )}
    </nav>
  );
}
