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

/** `webImages` defaults to the setting; false keeps web images out of the export. */
export type ExportOptions = { htmlTheme: HtmlTheme; frontMatter: boolean; webImages?: boolean };

/**
 * Obsidian embeds and plain wikilinks only matter to a document that has
 * them; the vault code stays unloaded for everyone else. The test is cheap
 * and errs on the side of loading.
 */
const mayHaveEmbeds = (markdown: string): boolean =>
  markdown.includes('[[') || (markdown.includes('![') && /!\[[^\]\n]*\|/.test(markdown));

async function expandVaultEmbeds(
  markdown: string,
  ctx: DocContext
): Promise<{ markdown: string; unavailable: boolean }> {
  if (!mayHaveEmbeds(markdown)) return { markdown, unavailable: false };
  const [
    { expandEmbeds },
    attachments,
    { classifyTarget },
    { resolveTarget },
    { MAX_TRANSCLUSION_DEPTH },
  ] = await Promise.all([
    import('@/domain/embedExport'),
    import('../attachments'),
    import('@/domain/embeds'),
    import('@/domain/vaultIndex'),
    import('@/domain/transclusion'),
  ]);
  // The whole index: an embed must not be reported missing because the scan is still running.
  const vault = await attachments.getVault(ctx, { complete: true });
  let unavailable = false;
  const kindLabel = {
    pdf: 'embed.pdf',
    audio: 'embed.audio',
    video: 'embed.video',
    other: 'embed.file',
    note: 'embed.link',
  } as const;
  const expanded = await expandEmbeds(markdown, vault?.notePath ?? null, {
    unavailable: vault === null,
    maxDepth: MAX_TRANSCLUSION_DEPTH,
    async resolve(target, fromNotePath, opts) {
      if (!vault) return null;
      const found = resolveTarget(vault.index, target, fromNotePath, opts);
      return found ? { path: found.path, kind: classifyTarget(found.path) } : null;
    },
    async readNote(path) {
      const read = await attachments.readNoteText(ctx, path);
      return read.state === 'ok' ? read.text : null;
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
        case 'note-missing':
          return t('embed.noteMissing', { name });
        default:
          return t(kindLabel[kind], { name });
      }
    },
  });
  return { markdown: expanded, unavailable };
}

async function render(
  format: ExportFormat,
  markdown: string,
  title: string,
  options: ExportOptions,
  ctx: DocContext
): Promise<Blob> {
  const { mime } = formatInfo(format);
  const images = async (options?: { keepPastedRasters?: boolean }) =>
    (await import('./exportImages')).loadExportImages(markdown, ctx, options);
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
    const blob = await render(format, inlineFootnotes(expanded.markdown), title, options, ctx);
    const result = await saveBlobAs(blob, name, formatInfo(format));
    if (!result) return;
    showToast(
      t(result.kind === 'written' ? 'toast.exported' : 'toast.downloaded', { name: result.name })
    );
    if (format === 'pdf' && hasCharactersPdfCantShow(markdown)) {
      showToast(t('toast.pdfMissingCharacters'), undefined, 10000);
    }
  } catch {
    showToast(t('toast.exportFailed'));
  }
}
