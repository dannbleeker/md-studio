/**
 * Markdown → PDF renderer shared by the app's Export (PDF) and the book
 * builder (scripts/build-book-pdf.mjs). Plain ESM JavaScript so Node can
 * import it without a build step; types in markdownPdf.d.mts.
 *
 * Pure pdf-lib + marked, ported from mindmap-studio's book builder. Uses the
 * PDF standard fonts, so text is limited to WinAnsi (Latin, including
 * Danish æ/ø/å, and common punctuation); emoji and other scripts are dropped
 * rather than failing the export.
 */

import { marked } from 'marked';
import { PDFDocument, PDFName, PDFString, rgb, StandardFonts } from 'pdf-lib';

const PAGE = { w: 595.28, h: 841.89 }; // A4 portrait, points
const M = { top: 68, bottom: 64, left: 66, right: 66 };
const CONTENT_W = PAGE.w - M.left - M.right;

const INK = rgb(0.12, 0.16, 0.22);
const HEAD = rgb(0.07, 0.09, 0.15);
const MUTED = rgb(0.42, 0.45, 0.5);
// Slate accent #3d5170, matching the app theme.
const ACCENT = rgb(0.239, 0.318, 0.439);
const CODE_INK = rgb(0.239, 0.318, 0.439);
const CODE_BG = rgb(0.95, 0.96, 0.97);
const QUOTE_BG = rgb(0.933, 0.945, 0.965);
const RULE = rgb(0.9, 0.91, 0.93);
const TABLE_HEAD_BG = rgb(0.945, 0.957, 0.973);

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

// Standard fonts use WinAnsi: it covers Latin + common punctuation (em dash,
// curly quotes, ellipsis, bullet) but not arrows or emoji. Map the few arrows
// we might use and strip emoji/dingbats/UI-icon glyphs so a draw never throws.
// The stripped blocks cover emoji (1F000-1FAFF), misc symbols + dingbats
// (2600-27BF), misc symbols & arrows (2B00-2BFF), supplemental arrows-B & misc
// math symbols-B (2900-29FF, e.g. ⧉ used as the Copy-outline button glyph), and
// arrows (2190-21FF). Prose may name a toolbar button by its icon (e.g. "⧉ Copy
// outline", "🔎 All maps"); the EPUB shows the glyph, the PDF drops it and keeps
// the words. (Box-drawing in code fences renders via codeBlock's safe path.)
function pdfText(s) {
  return decodeEntities(s)
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/↔/g, '<->')
    .replace(/⇒/g, '=>')
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2900}-\u{29FF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}]/gu,
      ''
    )
    .replace(/️/g, '');
}

/**
 * Render Markdown sources to a PDF and return its bytes.
 *
 * `sources` are rendered in order; each H1 starts a new page. With `cover`
 * set, the document gets a cover page, a clickable contents page and one
 * bookmark per H1 (the book); without it, the first page starts straight
 * with the content (single-document export).
 */
export async function markdownToPdf({
  sources,
  title,
  author = '',
  subject = '',
  producer = 'MD Studio (pdf-lib)',
  creator = '',
  keywords = [],
  cover = null,
  images = new Map(),
}) {
  const pdf = await PDFDocument.create();
  const F = {
    regular: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    italic: await pdf.embedFont(StandardFonts.HelveticaOblique),
    boldItalic: await pdf.embedFont(StandardFonts.HelveticaBoldOblique),
    mono: await pdf.embedFont(StandardFonts.Courier),
  };

  // `fresh`: nothing drawn on the current page yet, so an H1 can use it
  // instead of leaving a blank page (single-document export starts this way).
  const S = { page: null, y: M.top, fresh: false };
  const addPage = () => {
    S.page = pdf.addPage([PAGE.w, PAGE.h]);
    S.y = M.top;
    S.fresh = true;
    return S.page;
  };
  const space = (h) => {
    if (S.y + h > PAGE.h - M.bottom) addPage();
  };
  const safeDraw = (page, str, opts) => {
    if (page === S.page) S.fresh = false;
    try {
      page.drawText(str, opts);
    } catch {
      page.drawText(str.replace(/[^\x20-\x7E]/g, ''), opts);
    }
  };
  // Measure with the same ASCII fallback safeDraw uses: a glyph that slipped past
  // pdfText can never throw here, and the measured width matches what is drawn.
  const safeWidth = (font, str, size) => {
    try {
      return font.widthOfTextAtSize(str, size);
    } catch {
      return font.widthOfTextAtSize(str.replace(/[^\x20-\x7E]/g, ''), size);
    }
  };

  const fontFor = (run) => {
    if (run.code) return F.mono;
    if (run.b && run.i) return F.boldItalic;
    if (run.b) return F.bold;
    if (run.i) return F.italic;
    return F.regular;
  };

  // Flatten marked inline tokens into styled runs.
  function inlineRuns(tokens, style = {}) {
    const out = [];
    for (const t of tokens || []) {
      if (t.type === 'strong') out.push(...inlineRuns(t.tokens, { ...style, b: true }));
      else if (t.type === 'em') out.push(...inlineRuns(t.tokens, { ...style, i: true }));
      else if (t.type === 'codespan') out.push({ text: t.text, code: true, ...style });
      else if (t.type === 'del') out.push(...inlineRuns(t.tokens, { ...style, s: true }));
      else if (t.type === 'link') out.push(...inlineRuns(t.tokens, { ...style, link: true }));
      else if (t.type === 'br') out.push({ text: '\n', ...style });
      else if (t.type === 'image') {
        const img = images.get(t.href);
        // pdf-lib embeds PNG and JPEG; anything else keeps its alt text.
        if (img && (img.type === 'png' || img.type === 'jpg')) out.push({ image: img, ...style });
        else out.push({ text: t.text ? `[${t.text}]` : '', i: true, ...style });
      } else if (t.type === 'text' && t.tokens) out.push(...inlineRuns(t.tokens, style));
      else out.push({ text: t.text ?? t.raw ?? '', ...style });
    }
    return out;
  }

  // Word-wrap styled runs into lines and draw them, paginating as needed.
  function flow(runs, opts = {}) {
    const {
      x = M.left,
      width = CONTENT_W,
      size = 10.5,
      lineHeight = 15.5,
      color = INK,
      leftBar = null,
      bg = null,
    } = opts;
    const spaceW = F.regular.widthOfTextAtSize(' ', size);

    // tokenize runs into words (style-carrying) + explicit breaks
    const words = [];
    for (const r of runs) {
      if (r.image) {
        words.push({ img: r.image });
        continue;
      }
      if (r.text === '\n') {
        words.push({ br: true });
        continue;
      }
      for (const p of pdfText(r.text).split(/\s+/)) {
        if (p !== '') words.push({ text: p, run: r });
      }
    }

    let line = [];
    let lineW = 0;
    const drawLine = () => {
      space(lineHeight);
      const top = S.y;
      const boxBottom = PAGE.h - top - lineHeight;
      if (bg)
        S.page.drawRectangle({
          x: x - 8,
          y: boxBottom,
          width: width + 12,
          height: lineHeight,
          color: bg,
        });
      if (leftBar)
        S.page.drawRectangle({
          x: x - 10,
          y: boxBottom,
          width: 3,
          height: lineHeight,
          color: leftBar,
        });
      let cx = x;
      for (const w of line) {
        const f = fontFor(w.run);
        const col = w.run.code ? CODE_INK : w.run.link ? ACCENT : color;
        safeDraw(S.page, w.text, { x: cx, y: PAGE.h - top - size, font: f, size, color: col });
        const ww = safeWidth(f, w.text, size);
        if (w.run.s) {
          // Strikethrough: a rule through the word at x-height.
          const yMid = PAGE.h - top - size + size * 0.3;
          S.page.drawLine({
            start: { x: cx, y: yMid },
            end: { x: cx + ww, y: yMid },
            thickness: Math.max(0.6, size / 18),
            color: col,
          });
        }
        cx += ww + spaceW;
      }
      S.y += lineHeight;
      line = [];
      lineW = 0;
    };

    for (const w of words) {
      if (w.img) {
        if (line.length > 0) drawLine();
        drawImage(w.img, x, width);
        continue;
      }
      if (w.br) {
        drawLine();
        continue;
      }
      const f = fontFor(w.run);
      const ww = safeWidth(f, w.text, size);
      if (line.length > 0 && lineW + ww > width) drawLine();
      line.push(w);
      lineW += ww + spaceW;
    }
    if (line.length > 0) drawLine();
  }

  // Images sit on their own lines, fitted to the column and to two thirds of
  // a page; one embedding per image however often it appears.
  const embedded = new Map();
  async function embedImages() {
    for (const img of images.values()) {
      if (embedded.has(img)) continue;
      try {
        embedded.set(
          img,
          img.type === 'png' ? await pdf.embedPng(img.bytes) : await pdf.embedJpg(img.bytes)
        );
      } catch {
        // Unreadable image data: it is skipped rather than failing the export.
      }
    }
  }
  function drawImage(img, x, width) {
    const ref = embedded.get(img);
    if (!ref) return;
    const maxH = (PAGE.h - M.top - M.bottom) * 0.66;
    const scale = Math.min(1, width / img.width, maxH / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    space(h + 6);
    S.page.drawImage(ref, { x, y: PAGE.h - S.y - h - 3, width: w, height: h });
    S.fresh = false;
    S.y += h + 6;
  }

  const gap = (h) => {
    S.y += h;
    if (S.y > PAGE.h - M.bottom) addPage();
  };

  // --- block renderers --------------------------------------------------------
  function heading(token, dest) {
    const depth = token.depth;
    const runs = inlineRuns(token.tokens);
    if (depth === 1) {
      if (!S.fresh) addPage();
      if (dest) dest.push({ title: token.text, pageRef: S.page.ref, y: PAGE.h - M.top + 6 });
      flow(runs, { size: 23, lineHeight: 28, color: HEAD });
      gap(6);
      S.afterH1 = true;
      return;
    }
    if (depth === 3 && S.afterH1) {
      // the subtitle line right under a chapter title
      flow(runs, { size: 12.5, lineHeight: 17, color: MUTED });
      gap(8);
      S.afterH1 = false;
      return;
    }
    S.afterH1 = false;
    gap(depth === 2 ? 10 : 6);
    flow(
      runs,
      depth === 2
        ? { size: 15, lineHeight: 20, color: HEAD }
        : { size: 12.5, lineHeight: 17, color: HEAD }
    );
    gap(3);
  }

  // Lists nest: an item's own text, then its sub-lists and any further
  // paragraphs (loose lists), each indented one step deeper.
  function list(token, depth = 0) {
    const indent = depth * 18;
    let i = token.start || 1;
    for (const item of token.items) {
      const marker = item.task ? (item.checked ? '[x]' : '[ ]') : token.ordered ? `${i}.` : '•';
      i++;
      // marked puts a task item's box first, as its own token.
      const blocks = (item.tokens ?? []).filter((t) => t.type !== 'checkbox');
      const [first, ...rest] = blocks;
      const inline =
        first && (first.type === 'text' || first.type === 'paragraph')
          ? (first.tokens ?? [{ type: 'text', text: first.text }])
          : [];
      const textX = M.left + 22 + indent + (item.task ? 6 : 0);
      space(15.5);
      const top = S.y;
      safeDraw(S.page, marker, {
        x: M.left + 4 + indent,
        y: PAGE.h - top - 10.5,
        font: F.regular,
        size: 10.5,
        color: MUTED,
      });
      flow(inlineRuns(inline), { x: textX, width: CONTENT_W - (textX - M.left) });
      for (const block of inline.length ? rest : blocks) {
        if (block.type === 'list') list(block, depth + 1);
        else if (block.type === 'paragraph' || block.type === 'text') {
          gap(3);
          flow(inlineRuns(block.tokens), { x: textX, width: CONTENT_W - (textX - M.left) });
        } else if (block.type === 'code') codeBlock(block);
      }
      gap(1.5);
    }
    if (depth === 0) gap(4);
  }

  function codeBlock(token) {
    const lines = String(token.text).split('\n');
    const size = 9;
    const lh = 12.5;
    const wrapped = [];
    const maxChars = Math.floor((CONTENT_W - 16) / F.mono.widthOfTextAtSize('M', size));
    for (const ln of lines) {
      if (ln.length <= maxChars) wrapped.push(ln);
      else for (let j = 0; j < ln.length; j += maxChars) wrapped.push(ln.slice(j, j + maxChars));
    }
    // Draw in per-page segments so a block taller than one page paginates cleanly
    // — each page segment gets its own background — instead of one background that
    // spills later lines onto the next page without one. A block that fits on a
    // page is kept whole (moved to a fresh page if the remaining space is short).
    const wholeHeight = wrapped.length * lh + 12;
    if (wholeHeight <= PAGE.h - M.top - M.bottom) space(wholeHeight);
    let i = 0;
    while (i < wrapped.length) {
      space(lh + 12);
      const segTop = S.y;
      const avail = PAGE.h - M.bottom - segTop - 10;
      const fit = Math.max(1, Math.min(wrapped.length - i, Math.floor(avail / lh)));
      S.page.drawRectangle({
        x: M.left,
        y: PAGE.h - segTop - (fit * lh + 10),
        width: CONTENT_W,
        height: fit * lh + 10,
        color: CODE_BG,
        borderColor: RULE,
        borderWidth: 0.5,
      });
      S.y += 6;
      for (let k = 0; k < fit; k++, i++) {
        safeDraw(S.page, pdfText(wrapped[i]), {
          x: M.left + 8,
          y: PAGE.h - S.y - size,
          font: F.mono,
          size,
          color: INK,
        });
        S.y += lh;
      }
      S.y += 4;
      if (i < wrapped.length) addPage();
    }
    gap(6);
  }

  // Tables: equal-width columns, cell text wrapped inside each column, a
  // shaded header row. Rows never split across pages.
  function table(token) {
    const size = 9.5;
    const lh = 13;
    const pad = 5;
    const cols = token.header.length;
    const colW = CONTENT_W / cols;
    const wrapCell = (cell, font) => {
      const words = pdfText(cell.text).split(/\s+/).filter(Boolean);
      const lines = [];
      let ln = '';
      for (const w of words) {
        const test = ln ? `${ln} ${w}` : w;
        if (ln && safeWidth(font, test, size) > colW - 2 * pad) {
          lines.push(ln);
          ln = w;
        } else ln = test;
      }
      if (ln) lines.push(ln);
      return lines.length ? lines : [''];
    };
    const drawRow = (cells, header) => {
      const font = header ? F.bold : F.regular;
      const wrapped = cells.map((c) => wrapCell(c, font));
      const rowH = Math.max(...wrapped.map((l) => l.length)) * lh + 2 * pad - 3;
      space(rowH);
      const top = S.y;
      wrapped.forEach((lines, ci) => {
        const x = M.left + ci * colW;
        S.page.drawRectangle({
          x,
          y: PAGE.h - top - rowH,
          width: colW,
          height: rowH,
          color: header ? TABLE_HEAD_BG : undefined,
          borderColor: RULE,
          borderWidth: 0.75,
        });
        lines.forEach((text, li) => {
          safeDraw(S.page, text, {
            x: x + pad,
            y: PAGE.h - top - pad - size - li * lh,
            font,
            size,
            color: header ? HEAD : INK,
          });
        });
      });
      S.y += rowH;
    };
    gap(2);
    drawRow(token.header, true);
    for (const row of token.rows) drawRow(row, false);
    gap(10);
  }

  function blockquote(token) {
    gap(2);
    for (const inner of token.tokens) {
      if (inner.type === 'paragraph') {
        flow(inlineRuns(inner.tokens), {
          x: M.left + 12,
          width: CONTENT_W - 16,
          leftBar: ACCENT,
          bg: QUOTE_BG,
          color: rgb(0.3, 0.33, 0.4),
        });
      } else if (inner.type === 'list') {
        list(inner);
      }
    }
    gap(8);
  }

  function renderTokens(tokens, dest) {
    for (const token of tokens) {
      switch (token.type) {
        case 'heading':
          heading(token, dest);
          break;
        case 'paragraph':
          flow(inlineRuns(token.tokens));
          gap(7);
          break;
        case 'list':
          list(token);
          break;
        case 'code':
          codeBlock(token);
          break;
        case 'blockquote':
          blockquote(token);
          break;
        case 'hr':
          space(14);
          S.page.drawLine({
            start: { x: M.left, y: PAGE.h - S.y - 6 },
            end: { x: PAGE.w - M.right, y: PAGE.h - S.y - 6 },
            thickness: 0.75,
            color: RULE,
          });
          gap(14);
          break;
        case 'table':
          table(token);
          break;
        case 'html':
          // Raw HTML (comments, embeds) has no PDF rendering; the EPUB keeps it.
          break;
        case 'space':
          gap(3);
          break;
        default:
          if (token.tokens) renderTokens(token.tokens, dest);
      }
    }
  }

  const dateIso = new Date().toISOString().split('T')[0];
  const center = (page, str, font, size, color, yFromTop) => {
    const s = pdfText(str);
    const tw = safeWidth(font, s, size);
    safeDraw(page, s, { x: (PAGE.w - tw) / 2, y: PAGE.h - yFromTop - size, font, size, color });
  };

  // --- cover + reserved contents page (book only) -----------------------------
  let tocPage = null;
  if (cover) {
    const page = addPage();
    if (cover.eyebrow) center(page, cover.eyebrow, F.bold, 11, ACCENT, 250);
    center(page, title, F.bold, 42, HEAD, 300);
    if (subject) {
      // subtitle, wrapped + centred
      const words = pdfText(subject).split(/\s+/);
      const size = 13;
      let ln = '';
      let yft = 372;
      const flush = () => {
        if (ln) {
          center(page, ln, F.italic, size, rgb(0.29, 0.34, 0.41), yft);
          yft += 19;
        }
      };
      for (const w of words) {
        const test = ln ? `${ln} ${w}` : w;
        if (safeWidth(F.italic, test, size) > 360) {
          flush();
          ln = w;
        } else ln = test;
      }
      flush();
    }
    if (author) center(page, author, F.regular, 12, INK, 470);
    center(page, `Generated ${dateIso}`, F.regular, 9, MUTED, 496);
    if (creator) center(page, creator, F.regular, 9, MUTED, 510);
    // Filled after the content, once page refs are known. Not `fresh`:
    // the first chapter must start on a page of its own.
    tocPage = addPage();
    S.fresh = false;
  }

  // --- content ----------------------------------------------------------------
  if (!cover) addPage();
  const dest = [];
  await embedImages();
  for (const source of sources) renderTokens(marked.lexer(source), dest);

  // --- table of contents (clickable) ------------------------------------------
  if (tocPage) {
    S.page = tocPage;
    S.y = M.top;
    flow([{ text: 'Contents', b: true }], { size: 22, lineHeight: 28, color: HEAD });
    gap(10);
    const linkAnnots = [];
    for (const d of dest) {
      space(19);
      const top = S.y;
      const label = pdfText(d.title);
      safeDraw(tocPage, label, {
        x: M.left + 4,
        y: PAGE.h - top - 11,
        font: F.regular,
        size: 11.5,
        color: INK,
      });
      // clickable rect over the whole line
      const ctx = pdf.context;
      const action = ctx.obj({
        S: PDFName.of('GoTo'),
        D: ctx.obj([d.pageRef, PDFName.of('XYZ'), null, d.y, null]),
      });
      const annot = ctx.obj({
        Type: PDFName.of('Annot'),
        Subtype: PDFName.of('Link'),
        Rect: ctx.obj([M.left, PAGE.h - top - 16, PAGE.w - M.right, PAGE.h - top]),
        Border: ctx.obj([0, 0, 0]),
        A: action,
      });
      linkAnnots.push(ctx.register(annot));
      S.y += 19;
    }
    tocPage.node.set(PDFName.of('Annots'), pdf.context.obj(linkAnnots));
  }

  // --- chapter bookmarks (PDF outline) ----------------------------------------
  if (cover && dest.length > 0) {
    const ctx = pdf.context;
    const outlineRef = ctx.nextRef();
    const itemRefs = dest.map(() => ctx.nextRef());
    dest.forEach((d, i) => {
      const fields = {
        Title: PDFString.of(pdfText(d.title)),
        Parent: outlineRef,
        Dest: ctx.obj([d.pageRef, PDFName.of('XYZ'), null, d.y, null]),
      };
      if (i > 0) fields.Prev = itemRefs[i - 1];
      if (i < dest.length - 1) fields.Next = itemRefs[i + 1];
      ctx.assign(itemRefs[i], ctx.obj(fields));
    });
    ctx.assign(
      outlineRef,
      ctx.obj({
        Type: PDFName.of('Outlines'),
        First: itemRefs[0],
        Last: itemRefs.at(-1),
        Count: dest.length,
      })
    );
    pdf.catalog.set(PDFName.of('Outlines'), outlineRef);
  }

  // --- metadata ---------------------------------------------------------------
  pdf.setTitle(title);
  if (author) pdf.setAuthor(author);
  if (subject) pdf.setSubject(subject);
  pdf.setProducer(producer);
  if (creator) pdf.setCreator(creator);
  if (keywords.length) pdf.setKeywords(keywords);
  // Pin dates to date-only (midnight UTC) so two builds on the same day are
  // byte-identical — the Rebuild-book workflow then only commits on real changes.
  const stamp = new Date(`${dateIso}T00:00:00Z`);
  pdf.setCreationDate(stamp);
  pdf.setModificationDate(stamp);

  return pdf.save();
}
