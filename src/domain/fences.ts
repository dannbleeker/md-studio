/**
 * CommonMark fenced code boundaries, shared by the heading scanner and the
 * block splitter so both agree with the parser. Getting this wrong swallows
 * the rest of the document as "code": a line like "```npm i```" is inline
 * code, not a fence, and "```js" inside a ``` block doesn't close it.
 */

/** The fence a line opens ("```", "~~~~"…), or null. */
export function openFence(line: string): string | null {
  const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!m?.[1]) return null;
  // A backtick fence's info string may not contain a backtick.
  if (m[1].startsWith('`') && m[2]?.includes('`')) return null;
  return m[1];
}

/** True when `line` closes `fence`: same character, at least as long, nothing else on the line. */
export function closesFence(line: string, fence: string): boolean {
  const m = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
  return !!m?.[1] && m[1][0] === fence[0] && m[1].length >= fence.length;
}
