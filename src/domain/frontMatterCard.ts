/**
 * The few lines of YAML front matter a reader cares about, for the card Read
 * view shows in place of the raw block: a title, tags and plain fields.
 * Not a YAML parser. Nested maps, block scalars and anything else that is not
 * `key: value` or a list are left out, never guessed at.
 */

export type FrontMatterCard = {
  title: string | null;
  tags: string[];
  fields: { key: string; value: string }[];
};

const MAX_LINES = 200;
const MAX_FIELDS = 12;
const MAX_VALUE = 200;
const TAG_KEYS = new Set(['tags', 'tag', 'keywords', 'categories']);

const KEY_LINE = /^([A-Za-z_][\w -]{0,40}):[ \t]*(.*)$/;
const LIST_ITEM = /^[ \t]+-[ \t]+(.*)$/;

function unquote(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'"))
    return value.slice(1, -1).replaceAll("''", "'");
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"'))
    return value.slice(1, -1).replace(/\\(["\\])/g, '$1');
  // A trailing comment is only a comment on an unquoted value.
  const comment = value.indexOf(' #');
  return (comment < 0 ? value : value.slice(0, comment)).trim();
}

function splitInline(list: string): string[] {
  return list
    .split(',')
    .map((item) => unquote(item))
    .filter((item) => item !== '');
}

/** Null when the block holds nothing worth a card. */
export function parseFrontMatterCard(yaml: string): FrontMatterCard | null {
  const lines = yaml.split(/\r?\n/, MAX_LINES);
  let title: string | null = null;
  const tags: string[] = [];
  const fields: { key: string; value: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const match = KEY_LINE.exec(lines[i] ?? '');
    if (!match) continue;
    const key = (match[1] ?? '').trim();
    const rest = (match[2] ?? '').trim();
    let values: string[];
    if (rest === '') {
      values = [];
      while (i + 1 < lines.length) {
        const item = LIST_ITEM.exec(lines[i + 1] ?? '');
        if (!item) break;
        values.push(unquote(item[1] ?? ''));
        i++;
      }
    } else if (rest.startsWith('[') && rest.endsWith(']')) {
      values = splitInline(rest.slice(1, -1));
    } else if (/^[|>][-+0-9]*$/.test(rest) || rest.startsWith('{')) {
      continue;
    } else {
      values = [unquote(rest)];
    }
    values = values.filter((v) => v !== '');
    if (values.length === 0) continue;
    const lower = key.toLowerCase();
    if (lower === 'title') {
      title ??= (values[0] ?? '').slice(0, MAX_VALUE);
    } else if (TAG_KEYS.has(lower)) {
      for (const v of values.length === 1 ? (values[0] ?? '').split(/[\s,]+/) : values)
        if (v !== '') tags.push(v.replace(/^#/, ''));
    } else if (fields.length < MAX_FIELDS) {
      fields.push({ key, value: values.join(', ').slice(0, MAX_VALUE) });
    }
  }
  return title === null && tags.length === 0 && fields.length === 0
    ? null
    : { title, tags: [...new Set(tags)], fields };
}
