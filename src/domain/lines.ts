/**
 * Calls `visit` with each line of `text` (without its "\n" or "\r\n") and
 * the offset it starts at. Lines starting at or before `skipThrough` (the
 * end of a front matter block, say) are passed over.
 */
export function forEachLine(
  text: string,
  visit: (line: string, start: number) => void,
  skipThrough = -1
): void {
  for (let pos = 0; pos <= text.length; ) {
    const nl = text.indexOf('\n', pos);
    const end = nl < 0 ? text.length : nl;
    const start = pos;
    pos = end + 1;
    if (start <= skipThrough) continue;
    visit(text.slice(start, text[end - 1] === '\r' && end > start ? end - 1 : end), start);
  }
}
