/**
 * Subsequence fuzzy match for the command palette: every query character
 * must appear in order. Scores reward consecutive runs and matches at word
 * starts, so "vt" ranks "View: text only" above "Toggle linked scroll".
 * Returns null when the query doesn't match.
 */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const s = target.toLowerCase();
  let score = 0;
  let qi = 0;
  let prev = -2;
  for (let i = 0; i < s.length && qi < q.length; i++) {
    if (s[i] !== q[qi]) continue;
    if (q[qi] === ' ') {
      qi++;
      prev = i;
      continue;
    }
    score += 1;
    if (i === prev + 1) score += 2;
    if (i === 0 || /[\s:/-]/.test(s[i - 1] ?? '')) score += 3;
    prev = i;
    qi++;
  }
  return qi === q.length ? score : null;
}

export function fuzzyFilter<T>(
  items: readonly T[],
  query: string,
  label: (item: T) => string
): T[] {
  return items
    .map((item, index) => ({ item, index, score: fuzzyScore(query, label(item)) }))
    .filter((r): r is { item: T; index: number; score: number } => r.score !== null)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item);
}
