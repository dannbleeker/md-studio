import { frontMatterEnd } from './frontMatter';

/**
 * What a link's hover card shows of the note it points to: its title and the
 * first lines of text, as plain text. Only the start of the note is read, so
 * a huge note costs no more than a small one.
 */

export type NotePreview = { title: string | null; text: string };

const SCAN = 6000;
const HEADING = /^#{1,6}[ \t]+(.*)$/;
const FENCE = /^ {0,3}(?:`{3,}|~{3,})/;

/** One line of Markdown as plain words. Every pattern is bounded, so none can run away. */
function plain(line: string): string {
  return line
    .replace(/^(?:>[ \t]?){1,6}/, '')
    .replace(/^[ \t]*(?:[-*+]|\d{1,3}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/, '')
    .replace(/\[![A-Za-z][\w-]{0,29}\][+-]?/g, '')
    .replace(/!\[\[[^\]]{0,300}\]\]/g, '')
    .replace(/\[\[([^\]|]{0,300})\|([^\]]{0,300})\]\]/g, '$2')
    .replace(/\[\[([^\]]{0,300})\]\]/g, '$1')
    .replace(/!?\[([^\]]{0,300})\]\([^)]{0,500}\)/g, '$1')
    .replace(/[*`]+|~~/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function notePreview(markdown: string, maxChars = 280): NotePreview {
  const end = frontMatterEnd(markdown);
  const body = (end < 0 ? markdown : markdown.slice(end + 1)).slice(0, SCAN);
  let title: string | null = null;
  let text = '';
  let fenced = false;
  for (const raw of body.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced || line.trim() === '' || /^[ \t]*(?:[-*_]{3,}|\|.*)$/.test(line)) continue;
    const heading = HEADING.exec(line);
    if (heading) {
      if (title === null && text === '') title = plain(heading[1] ?? '');
      else if (text !== '') break;
      continue;
    }
    const words = plain(line);
    if (words === '') continue;
    text = text === '' ? words : `${text} ${words}`;
    if (text.length >= maxChars) break;
  }
  return {
    title: title === '' ? null : title,
    text: text.length > maxChars ? `${text.slice(0, maxChars).trimEnd()}…` : text,
  };
}
