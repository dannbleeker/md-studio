import { extOf } from './vaultIndex';

/** The folder panel's tree of notes: folders first, then files, each in natural order. */

const NOTE_EXTENSIONS: ReadonlySet<string> = new Set(['md', 'markdown', 'mdown', 'mkd']);

export const isNotePath = (path: string): boolean => NOTE_EXTENSIONS.has(extOf(path));

export type TreeNode = {
  name: string;
  /** Vault-relative path, '/'-separated. */
  path: string;
  /** Null for a note; the contents for a folder. */
  children: TreeNode[] | null;
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function sortTree(nodes: TreeNode[]): void {
  nodes.sort((a, b) => {
    if ((a.children === null) !== (b.children === null)) return a.children === null ? 1 : -1;
    return collator.compare(a.name, b.name);
  });
  for (const node of nodes) if (node.children) sortTree(node.children);
}

/** The notes among `paths` as a tree. A folder without notes in it does not appear. */
export function buildTree(paths: readonly string[]): TreeNode[] {
  const root: TreeNode[] = [];
  const folders = new Map<string, TreeNode>();
  for (const path of paths) {
    if (!isNotePath(path)) continue;
    const parts = path.split('/');
    let siblings = root;
    let prefix = '';
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i] as string;
      prefix = prefix === '' ? name : `${prefix}/${name}`;
      let folder = folders.get(prefix);
      if (!folder) {
        folder = { name, path: prefix, children: [] };
        folders.set(prefix, folder);
        siblings.push(folder);
      }
      siblings = folder.children as TreeNode[];
    }
    siblings.push({ name: parts[parts.length - 1] as string, path, children: null });
  }
  sortTree(root);
  return root;
}

/** The notes of `paths`, sorted by name: what the filter box searches. */
export function notePaths(paths: readonly string[]): string[] {
  return paths.filter(isNotePath).sort((a, b) => collator.compare(a, b));
}
