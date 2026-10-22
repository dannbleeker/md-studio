/**
 * Export: write the open document to another format as a separate file.
 * The converters (and their libraries: marked, docx, pdf-lib) load on first
 * use, so they stay out of the start-up bundle.
 */

import { documentTitle } from '@/domain/document';
import {
  type ExportFormat,
  exportFileName,
  formatInfo,
  type HtmlTheme,
} from '@/domain/exportFormats';
import { inlineFootnotes } from '@/domain/footnotes';
import { frontMatterForExport } from '@/domain/frontMatter';
import { hasCharactersPdfCantShow } from '@/domain/pdfCharacters';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { showToast } from '@/store/ui';
import type { DocContext } from '../attachments';
import { saveBlobAs } from '../fileSystem';
import type { ExportImages } from './exportImages';

/** `webImages` defaults to the setting; false keeps web images out of the export. */
export type ExportOptions = { htmlTheme: HtmlTheme; frontMatter: boolean; webImages?: boolean };

/**
 * A Markdown image with a size in its alt (`![alt|300](x.png)`): the one embed
 * form that has no `![[`. One pass, so a line of unclosed `![` stays linear.
 */
function hasSizedImage(markdown: string): boolean {
  let open = false;
  for (let i = 0; i < markdown.length; i++) {
    const c = markdown.charCodeAt(i);
    if (c === 33 && markdown.charCodeAt(i + 1) === 91) {
      open = true;
      i++;
    } else if (c === 93 || c === 10) open = false;
    else if (c === 124 && open) return true;
  }
  return false;
}

/**
 * Obsidian embeds and plain wikilinks only matter to a document that has
 * them; the vault code stays unloaded for everyone else. The test is cheap
 * and errs on the side of loading.
 */
const mayHaveEmbeds = (markdown: string): boolean =>
  markdown.includes('[[') || hasSizedImage(markdown);

/** Cheap test, so a document without math or diagrams never loads the typesetting code. */
const mayNeedTypesetting = (markdown: string): boolean =>
  markdown.includes('$') || /mermaid/i.test(markdown);

/** Only an embed (not a plain wikilink, which prints its own text) needs to look in the vault. */
const needsVault = (markdown: string): boolean =>
  markdown.includes('![[') || hasSizedImage(markdown);

async function expandVaultEmbeds(
  markdown: string,
  ctx: DocContext
): Promise<{ markdown: string; unavailable: boolean; images: ReadonlySet<string> }> {
  // The vault pictures the expansion linked to: the image loader reads no other `attachment:` path.
  const images = new Set<string>();
  if (!mayHaveEmbeds(markdown)) return { markdown, unavailable: false, images };
  const wantsVault = needsVault(markdown);
  const [
    { expandEmbeds },
    attachments,
    { classifyTarget },
    { resolveTarget },
    { MAX_TRANSCLUSION_DEPTH },
  ] = await Promise.all([
    import('@/domain/embedExport'),
    wantsVault ? import('../attachments') : null,
    import('@/domain/embeds'),
    import('@/domain/vaultIndex'),
    import('@/domain/transclusion'),
  ]);
  // The whole index: an embed must not be reported missing because the scan is still running.
  const vault = attachments ? await attachments.getVault(ctx, { complete: true }) : null;
  let unavailable = false;
  const kindLabel = {
    pdf: 'embed.pdf',
    audio: 'embed.audio',
    video: 'embed.video',
    other: 'embed.file',
    note: 'embed.link',
  } as const;
  const expanded = await expandEmbeds(markdown, vault?.notePath ?? null, {
    unavailable: wantsVault && vault === null,
    maxDepth: MAX_TRANSCLUSION_DEPTH,
    async resolve(target, fromNotePath, opts) {
      if (!vault) return null;
      const found = resolveTarget(vault.index, target, fromNotePath, opts);
      if (!found) return null;
      const kind = classifyTarget(found.path);
      if (kind === 'image') images.add(found.path);
      return { path: found.path, kind };
    },
    async readNote(path) {
      const read = await attachments?.readNoteText(ctx, path);
      return read?.state === 'ok' ? read.text : null;
    },
    label(kind, name) {
      switch (kind) {
        case 'missing':
          return t('export.embedMissing', { name });
        case 'unavailable':
          unavailable = true;
          return t('export.embedUnavailable', { name });
        case 'cycle':
          return t('export.embedCycle', { name });
        case 'depth':
          return t('export.embedDepth', { name });
        case 'limit':
          return t('export.embedLimit', { name });
        case 'note-missing':
          return t('embed.noteMissing', { name });
        default:
          return t(kindLabel[kind], { name });
      }
    },
  });
  return { markdown: expanded, unavailable, images };
}

/** The document without the `attachment:` pictures an embed turned into (their alt is a file name). */
export const printedText = (markdown: string): string =>
  markdown.includes('](attachment:')
    ? // Both parts are bounded: an unclosed start would otherwise scan to the end of its line.
      markdown.replace(/!\[[^\]\n]{0,500}\]\(attachment:[^)\n]{0,1024}\)/g, '')
    : markdown;

async function render(
  format: ExportFormat,
  markdown: string,
  title: string,
  options: ExportOptions,
  ctx: DocContext,
  attachments: ReadonlySet<string>,
  typeset: ExportImages = new Map()
): Promise<Blob> {
  const { mime } = formatInfo(format);
  const images = async (loadOptions?: { keepPastedRasters?: boolean }) =>
    // The typeset pictures after the document's own, which never use the typeset: scheme.
    new Map([
      ...(await (
        await import('./exportImages')
      ).loadExportImages(markdown, ctx, {
        ...loadOptions,
        attachments,
      })),
      ...typeset,
    ]);
  switch (format) {
    case 'html': {
      const { markdownToHtml } = await import('./html');
      const html = markdownToHtml(
        markdown,
        title,
        options.htmlTheme,
        await images({ keepPastedRasters: true }),
        options.webImages ?? useStore.getState().settings.webImages
      );
      return new Blob([html], {
        type: `${mime};charset=utf-8`,
      });
    }
    case 'txt': {
      const { markdownToPlainText } = await import('./plainText');
      return new Blob([markdownToPlainText(markdown)], { type: `${mime};charset=utf-8` });
    }
    case 'docx': {
      const { markdownToDocx } = await import('./docx');
      return markdownToDocx(markdown, title, await images());
    }
    case 'pdf': {
      const { markdownToPdf } = await import('./markdownPdf.mjs');
      const bytes = await markdownToPdf({ sources: [markdown], title, images: await images() });
      return new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
    }
  }
}

export async function exportDocument(format: ExportFormat, options: ExportOptions): Promise<void> {
  // Taken before any await: switching tabs mid-export must not read another document's vault.
  // (currentDocContext() in services/attachments, inlined so this eager module doesn't import it.)
  const { doc, fileHandle, handleId } = useStore.getState();
  const ctx: DocContext = { fileHandle, handleId };
  const name = exportFileName(doc.fileName, format);
  const title = documentTitle(doc.markdown) || name.replace(/\.[^.]+$/, '');
  const markdown = frontMatterForExport(doc.markdown, options.frontMatter);
  try {
    const expanded = await expandVaultEmbeds(markdown, ctx);
    if (expanded.unavailable) showToast(t('export.attachmentsUnavailable'));
    // The exporters have no footnote support; see domain/footnotes.ts.
    const inlined = inlineFootnotes(expanded.markdown);
    // Formulas and diagrams become pictures (or MathML) where the format can show them.
    const typeset = mayNeedTypesetting(inlined)
      ? await (await import('./typeset')).typesetForExport(inlined, format, {
          dark: options.htmlTheme === 'dark',
        })
      : { markdown: inlined, images: new Map() };
    const blob = await render(
      format,
      typeset.markdown,
      title,
      options,
      ctx,
      expanded.images,
      typeset.images
    );
    const result = await saveBlobAs(blob, name, formatInfo(format));
    if (!result) return;
    showToast(
      t(result.kind === 'written' ? 'toast.exported' : 'toast.downloaded', { name: result.name })
    );
    if (format === 'html') {
      const { imagesLeftOut } = await import('./html');
      if (imagesLeftOut() > 0) showToast(t('toast.htmlImagesLeftOut'), undefined, 10000);
    }
    // The text that was rendered, not the host alone: an embedded note brings its own characters,
    // and the name of an embedded picture is not printed.
    if (format === 'pdf' && hasCharactersPdfCantShow(printedText(expanded.markdown))) {
      showToast(t('toast.pdfMissingCharacters'), undefined, 10000);
    }
  } catch {
    showToast(t('toast.exportFailed'));
  }
}
