/**
 * In-memory stand-ins for the File System Access handles, shared by the
 * attachment, embed and paste tests. They implement only what the app calls,
 * and fail the way Chromium does (NotFoundError, TypeMismatchError), so a
 * missing file or a wrong kind behaves like the real thing.
 */
import { vi } from 'vitest';

type Permission = 'granted' | 'prompt' | 'denied';

interface Owner {
  permission: Permission;
  written: Map<string, Uint8Array>;
}

interface FileNode {
  kind: 'file';
  name: string;
  path: string[];
  owner: Owner;
  data: Uint8Array;
  lastModified: number;
  handle?: FileSystemFileHandle;
}

interface DirNode {
  kind: 'directory';
  name: string;
  path: string[];
  owner: Owner;
  children: Map<string, Node>;
  handle?: FileSystemDirectoryHandle;
}

type Node = FileNode | DirNode;

/** Handle back to its node: resolve() and isSameEntry() compare handles by what they stand for. */
const nodeOf = new WeakMap<object, Node>();

const encoder = new TextEncoder();

const notFound = (name: string) => new DOMException(`${name} was not found`, 'NotFoundError');
const mismatch = (name: string) =>
  new DOMException(`${name} is not the expected kind`, 'TypeMismatchError');

async function toBytes(data: Blob | string | Uint8Array): Promise<Uint8Array> {
  if (typeof data === 'string') return encoder.encode(data);
  if (data instanceof Uint8Array) return data;
  return new Uint8Array(await data.arrayBuffer());
}

const concat = (chunks: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
};

function handleOf(node: DirNode): FileSystemDirectoryHandle;
function handleOf(node: FileNode): FileSystemFileHandle;
function handleOf(node: Node): FileSystemHandle;
function handleOf(node: Node): FileSystemHandle {
  if (node.handle) return node.handle;
  const handle = node.kind === 'directory' ? directoryHandle(node) : fileHandle(node);
  node.handle = handle as never;
  nodeOf.set(handle, node);
  return handle;
}

function permissionMethods(owner: Owner) {
  return {
    queryPermission: async () => owner.permission,
    // Asking the user: a prompt becomes a grant, a denial stays one.
    requestPermission: async () => {
      if (owner.permission === 'prompt') owner.permission = 'granted';
      return owner.permission;
    },
  };
}

function sameEntry(node: Node) {
  return async (other: FileSystemHandle) => nodeOf.get(other) === node;
}

function fileHandle(node: FileNode): FileSystemFileHandle {
  return {
    kind: 'file',
    name: node.name,
    isSameEntry: sameEntry(node),
    ...permissionMethods(node.owner),
    async getFile() {
      return new File([node.data as BlobPart], node.name, { lastModified: node.lastModified });
    },
    async createWritable() {
      const chunks: Uint8Array[] = [];
      return {
        async write(data: Blob | string | Uint8Array) {
          chunks.push(await toBytes(data));
        },
        async close() {
          node.data = concat(chunks);
          node.lastModified = Date.now();
          node.owner.written.set(node.path.join('/'), node.data);
        },
        async abort() {
          chunks.length = 0;
        },
      };
    },
  } as unknown as FileSystemFileHandle;
}

function child(dir: DirNode, name: string, kind: 'file' | 'directory', create: boolean): Node {
  const existing = dir.children.get(name);
  if (existing) {
    if (existing.kind !== kind) throw mismatch(name);
    return existing;
  }
  if (!create) throw notFound(name);
  const path = [...dir.path, name];
  const made: Node =
    kind === 'directory'
      ? { kind, name, path, owner: dir.owner, children: new Map() }
      : { kind, name, path, owner: dir.owner, data: new Uint8Array(0), lastModified: Date.now() };
  dir.children.set(name, made);
  return made;
}

function directoryHandle(node: DirNode): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name: node.name,
    isSameEntry: sameEntry(node),
    ...permissionMethods(node.owner),
    async getDirectoryHandle(name: string, options?: { create?: boolean }) {
      return handleOf(child(node, name, 'directory', options?.create === true) as DirNode);
    },
    async getFileHandle(name: string, options?: { create?: boolean }) {
      return handleOf(child(node, name, 'file', options?.create === true) as FileNode);
    },
    async removeEntry(name: string) {
      if (!node.children.delete(name)) throw notFound(name);
    },
    async *values() {
      for (const entry of node.children.values()) yield handleOf(entry);
    },
    async *keys() {
      yield* node.children.keys();
    },
    async resolve(possibleDescendant: FileSystemHandle) {
      const other = nodeOf.get(possibleDescendant);
      if (!other || other.owner !== node.owner) return null;
      const inside = node.path.every((segment, i) => other.path[i] === segment);
      return inside && other.path.length >= node.path.length
        ? other.path.slice(node.path.length)
        : null;
    },
  } as unknown as FileSystemDirectoryHandle;
}

/**
 * A folder tree built from vault-relative paths ('Notes/a.md'). Writes made
 * through createWritable land in the tree and in `written`, keyed by path.
 * One mutable permission answers queryPermission and requestPermission for
 * every handle of the vault.
 */
export function fakeVault(
  files: Record<string, string | Uint8Array>,
  opts?: { permission?: Permission }
): {
  root: FileSystemDirectoryHandle;
  file(path: string): FileSystemFileHandle;
  written: Map<string, Uint8Array>;
  setPermission(p: Permission): void;
  setLastModified(path: string, ms: number): void;
} {
  const owner: Owner = { permission: opts?.permission ?? 'granted', written: new Map() };
  const rootNode: DirNode = {
    kind: 'directory',
    name: 'vault',
    path: [],
    owner,
    children: new Map(),
  };
  const nodeAt = (path: string): FileNode => {
    let dir = rootNode;
    const segments = path.split('/');
    for (const segment of segments.slice(0, -1))
      dir = child(dir, segment, 'directory', false) as DirNode;
    return child(dir, segments.at(-1) ?? '', 'file', false) as FileNode;
  };
  for (const [path, content] of Object.entries(files)) {
    let dir = rootNode;
    const segments = path.split('/');
    for (const segment of segments.slice(0, -1))
      dir = child(dir, segment, 'directory', true) as DirNode;
    const leaf = child(dir, segments.at(-1) ?? '', 'file', true) as FileNode;
    leaf.data = typeof content === 'string' ? encoder.encode(content) : content;
    leaf.lastModified = 1_000;
  }
  return {
    root: handleOf(rootNode),
    file: (path) => handleOf(nodeAt(path)),
    written: owner.written,
    setPermission(p) {
      owner.permission = p;
    },
    setLastModified(path, ms) {
      nodeAt(path).lastModified = ms;
    },
  };
}

/**
 * jsdom ships no URL.createObjectURL or revokeObjectURL, so spying on them
 * would fail. Assigning stubs first gives code under test something to call.
 */
export function stubObjectUrls(): {
  create: ReturnType<typeof vi.fn>;
  revoke: ReturnType<typeof vi.fn>;
} {
  let n = 0;
  const create = vi.fn(() => `blob:fake/${++n}`);
  const revoke = vi.fn();
  URL.createObjectURL = create as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revoke as unknown as typeof URL.revokeObjectURL;
  return { create, revoke };
}
