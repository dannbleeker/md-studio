import { useEffect, useMemo, useState } from 'react';
import { buildTree, type TreeNode } from '@/domain/folderTree';
import { fuzzyFilter } from '@/domain/fuzzy';
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

const MAX_FILTERED = 100;

/** Every folder on the way to `path`, so the open note is visible in the tree. */
function ancestors(path: string | null): string[] {
  if (!path) return [];
  const parts = path.split('/');
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join('/'));
}

function Tree({
  nodes,
  expanded,
  toggle,
  current,
  depth = 0,
}: {
  nodes: TreeNode[];
  expanded: ReadonlySet<string>;
  toggle: (path: string) => void;
  current: string | null;
  depth?: number;
}) {
  return (
    <ul className="folder-tree">
      {nodes.map((node) => {
        const pad = { paddingLeft: `${0.4 + depth * 0.9}rem` };
        if (node.children) {
          const open = expanded.has(node.path);
          return (
            <li key={node.path}>
              <button
                type="button"
                className="folder-item folder-dir"
                style={pad}
                aria-expanded={open}
                onClick={() => toggle(node.path)}
              >
                <span aria-hidden="true">{open ? '▾' : '▸'}</span> {node.name}
              </button>
              {open ? (
                <Tree
                  nodes={node.children}
                  expanded={expanded}
                  toggle={toggle}
                  current={current}
                  depth={depth + 1}
                />
              ) : null}
            </li>
          );
        }
        return (
          <li key={node.path}>
            <button
              type="button"
              className="folder-item"
              style={pad}
              aria-current={node.path === current ? 'page' : undefined}
              title={node.path}
              onClick={() => void openFolderNote(node.path)}
            >
              {node.name.replace(/\.(?:md|markdown|mdown|mkd)$/i, '')}
            </button>
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
                onClick={() => void openFolderNote(path)}
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
  const toggle = (path: string) =>
    setExpanded((open) => {
      const next = new Set(open);
      if (!next.delete(path)) next.add(path);
      return next;
    });

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
          <div className="folder-list">
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
                        onClick={() => void openFolderNote(path)}
                      >
                        {path.replace(/\.(?:md|markdown|mdown|mkd)$/i, '')}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <Tree nodes={tree} expanded={expanded} toggle={toggle} current={current} />
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
