import { decodeHTML } from 'entities';
import { marked, type Token, type Tokens } from 'marked';

/**
 * Markdown → readable plain text: formatting marks removed, structure kept
 * (headings underlined, list bullets, tables as tab-separated rows, code as
 * is, link targets in brackets so they aren't lost).
 */
export function markdownToPlainText(markdown: string): string {
  return `${trimLines(blocks(marked.lexer(markdown), 0))}\n`;
}

/**
 * How many columns a heading takes in a monospaced view, for its underline:
 * one per character as the reader sees it (an emoji with modifiers is
 * one), two for East Asian wide characters.
 */
function displayWidth(text: string): number {
  const segments = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)];
  return segments.reduce(
    (width, { segment }) =>
      width +
      (/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]|\p{Extended_Pictographic}/u.test(
        segment
      )
        ? 2
        : 1),
    0
  );
}

/**
 * Drops blank lines around a block but keeps the first line's indent: a
 * leading quote is indented, and spaces in code are part of the code.
 */
const trimLines = (text: string) => text.replace(/^\s*\n/, '').trimEnd();

function inline(tokens: Token[] | undefined): string {
  let out = '';
  for (const t of tokens ?? []) {
    switch (t.type) {
      case 'link': {
        const text = inline((t as Tokens.Link).tokens);
        const href = (t as Tokens.Link).href;
        out += text === href ? href : `${text} (${href})`;
        break;
      }
      case 'image':
        out += `[${(t as Tokens.Image).text}]`;
        break;
      case 'br':
        out += '\n';
        break;
      case 'codespan':
        // Code text is the source as written: `&amp;` in code means those five characters.
        out += (t as Tokens.Codespan).text;
        break;
      default:
        out +=
          'tokens' in t && t.tokens ? inline(t.tokens) : decode('text' in t ? String(t.text) : '');
    }
  }
  return out;
}

/** `sep` joins sibling blocks: a blank line, or a single newline inside tight list items. */
function blocks(tokens: Token[], depth: number, sep = '\n\n'): string {
  const parts: string[] = [];
  const indent = '  '.repeat(depth);
  for (const t of tokens) {
    switch (t.type) {
      case 'heading': {
        const text = inline((t as Tokens.Heading).tokens);
        const level = (t as Tokens.Heading).depth;
        parts.push(
          level <= 2 ? `${text}\n${(level === 1 ? '=' : '-').repeat(displayWidth(text))}` : text
        );
        break;
      }
      case 'paragraph':
        parts.push(indent + inline((t as Tokens.Paragraph).tokens));
        break;
      case 'list': {
        const list = t as Tokens.List;
        const start = typeof list.start === 'number' ? list.start : 1;
        parts.push(
          list.items
            .map((item, i) => {
              const marker = list.ordered ? `${start + i}.` : '-';
              const check = item.task ? (item.checked ? '[x] ' : '[ ] ') : '';
              // Continuation lines line up with the text after the marker
              // ("10. " is wider than "- ").
              const hang = ' '.repeat(marker.length + 1);
              const body = trimLines(blocks(item.tokens, 0, list.loose ? '\n\n' : '\n'))
                .trimStart()
                .replace(/\n(?=.)/g, `\n${indent}${hang}`);
              return `${indent}${marker} ${check}${body}`;
            })
            .join('\n')
        );
        break;
      }
      case 'code':
        parts.push((t as Tokens.Code).text);
        break;
      case 'blockquote':
        parts.push(
          trimLines(blocks((t as Tokens.Blockquote).tokens, 0))
            .split('\n')
            .map((l) => (l ? `${indent}  ${l}` : ''))
            .join('\n')
        );
        break;
      case 'table': {
        const table = t as Tokens.Table;
        const row = (cells: Tokens.TableCell[]) => cells.map((c) => inline(c.tokens)).join('\t');
        parts.push([row(table.header), ...table.rows.map(row)].join('\n'));
        break;
      }
      case 'hr':
        parts.push('----');
        break;
      case 'space':
        break;
      case 'text':
        parts.push(indent + ('tokens' in t && t.tokens ? inline(t.tokens) : decode(t.text)));
        break;
      default:
        if ('text' in t && typeof t.text === 'string') parts.push(decode(t.text));
    }
  }
  return parts.join(sep);
}

/** marked leaves named entities (&copy;, &nbsp;, &mdash;…) encoded in its tokens. */
function decode(s: string): string {
  return decodeHTML(s);
}
