import { extOf } from './vaultIndex';

/**
 * The file kinds this app treats as notes, in one place: the folder tree,
 * link following, the file pickers and window drops all decide from here.
 */
export const NOTE_EXTENSIONS: readonly string[] = ['md', 'markdown', 'mdown', 'mkd'];

const NOTES: ReadonlySet<string> = new Set(NOTE_EXTENSIONS);

export const isNoteExtension = (ext: string): boolean => NOTES.has(ext.toLowerCase());

export const isNotePath = (path: string): boolean => isNoteExtension(extOf(path));

/**
 * A dropped file the window opens as a document: a note, or plain text.
 * The editor panes leave exactly these to the window and embed the rest.
 */
export const opensAsDocument = (name: string): boolean => isNotePath(name) || extOf(name) === 'txt';

/** "Ideas.md" → "Ideas", for showing a note by name; other files keep theirs. */
export function withoutNoteExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 && isNoteExtension(name.slice(dot + 1)) ? name.slice(0, dot) : name;
}
