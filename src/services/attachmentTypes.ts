/** The attachments service's public types; callers import them from attachments.ts. */
import type { EmbedKind } from '@/domain/embeds';
import type { VaultConfig } from '@/domain/vaultConfig';
import type { VaultIndex } from '@/domain/vaultIndex';

export interface DocContext {
  fileHandle: FileSystemFileHandle | null;
  handleId: string | null;
}

export type AttachmentStatus =
  | { kind: 'unsupported' }
  | { kind: 'no-note-file' }
  | { kind: 'no-folder' }
  | { kind: 'needs-permission'; folderName: string }
  | { kind: 'ready'; folderName: string; isVaultRoot: boolean; misses: number; scanning: boolean };

export type AttachmentUnavailable =
  | 'unsupported'
  | 'no-note-file'
  | 'no-folder'
  | 'needs-permission';

export interface VaultSnapshot {
  index: VaultIndex;
  config: VaultConfig | null;
  notePath: string | null;
  truncated: boolean;
  complete: boolean;
}

export type ResolvedAttachment =
  | { state: 'ok'; path: string; name: string; kind: EmbedKind; url: string; ambiguous: boolean }
  | { state: 'scanning' }
  | { state: 'missing'; rootLooksLikeVault: boolean; tooLarge?: true }
  | { state: 'unavailable'; reason: AttachmentUnavailable };

export interface ResolveOptions {
  /** undefined is the host note; null means no note to resolve from. */
  fromNotePath?: string | null;
  markdown?: boolean;
  /** Literal paths retried when the decoded one misses. */
  alternates?: readonly string[];
}

export type NoteRead =
  | {
      state: 'ok';
      path: string;
      text: string;
      lastModified: number;
      size: number;
      /** Several files share the name; the nearest was read. */
      ambiguous?: true;
    }
  | { state: 'scanning' }
  // tooLarge: the note exists but is over the embed size limit, which is not the same as not found.
  | { state: 'missing'; rootLooksLikeVault: boolean; tooLarge?: true }
  | { state: 'unavailable'; reason: AttachmentUnavailable };

export interface SavedAttachment {
  path: string;
  name: string;
  kind: EmbedKind;
  markdown: string;
}

export type SaveResult =
  | { ok: true; saved: SavedAttachment }
  | {
      ok: false;
      reason: 'unsupported' | 'no-note-file' | 'no-folder' | 'needs-permission' | 'failed';
    };
