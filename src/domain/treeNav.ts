import type { TreeNode } from './folderTree';

/** One line of the folder tree as shown: what keyboard navigation moves between. */
export type TreeRow = {
  path: string;
  isDir: boolean;
  /** 1 for the top level, as aria-level counts. */
  level: number;
  parent: string | null;
  expanded: boolean;
};

/** The rows the tree shows now, in order: a folder's contents only while it is open. */
export function visibleRows(nodes: readonly TreeNode[], expanded: ReadonlySet<string>): TreeRow[] {
  const rows: TreeRow[] = [];
  const walk = (list: readonly TreeNode[], level: number, parent: string | null) => {
    for (const node of list) {
      const isDir = node.children !== null;
      const open = isDir && expanded.has(node.path);
      rows.push({ path: node.path, isDir, level, parent, expanded: open });
      if (open && node.children) walk(node.children, level + 1, node.path);
    }
  };
  walk(nodes, 1, null);
  return rows;
}

/** What a key press in the tree asks for; every field is optional, none is set for a key that does nothing. */
export type TreeMove = {
  focus?: string;
  expand?: string;
  collapse?: string;
  /** A note to open. */
  activate?: string;
};

/**
 * The WAI-ARIA tree keys. Up and Down step through the visible rows, Home and
 * End jump to the ends, Right opens a folder and then enters it, Left closes
 * one and then climbs to its parent, Enter or Space opens a folder or a note.
 */
export function treeKey(rows: readonly TreeRow[], focused: string, key: string): TreeMove | null {
  const at = rows.findIndex((r) => r.path === focused);
  const row = rows[at];
  if (!row) return null;
  const go = (target: TreeRow | undefined): TreeMove | null =>
    target && target.path !== focused ? { focus: target.path } : null;
  switch (key) {
    case 'ArrowDown':
      return go(rows[at + 1]);
    case 'ArrowUp':
      return go(rows[at - 1]);
    case 'Home':
      return go(rows[0]);
    case 'End':
      return go(rows[rows.length - 1]);
    case 'ArrowRight': {
      if (!row.isDir) return null;
      if (!row.expanded) return { expand: row.path };
      const child = rows[at + 1];
      return child && child.parent === row.path ? { focus: child.path } : null;
    }
    case 'ArrowLeft': {
      if (row.isDir && row.expanded) return { collapse: row.path };
      return row.parent === null ? null : { focus: row.parent };
    }
    case 'Enter':
    case ' ':
      if (!row.isDir) return { activate: row.path };
      return row.expanded ? { collapse: row.path } : { expand: row.path };
    default:
      return null;
  }
}
