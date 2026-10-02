/**
 * The PDF export uses the standard PDF fonts, which only know WinAnsi:
 * Latin-1 (Danish æøå included) plus a few typographic marks. Anything
 * else (Greek, Cyrillic, Chinese, Arabic, emoji) is left out of the PDF,
 * so the user is told and pointed at Word or HTML, which keep it.
 */
const WINANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
/** Arrows the PDF writes as ASCII instead (see markdownPdf.mjs). */
const MAPPED = new Set('→←↔⇒');

export function hasCharactersPdfCantShow(markdown: string): boolean {
  for (const ch of markdown) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x100 || WINANSI_EXTRA.has(ch) || MAPPED.has(ch)) continue;
    // Variation selectors and zero-width joiners only modify a neighbour.
    if (code === 0xfe0f || code === 0x200d) continue;
    return true;
  }
  return false;
}
