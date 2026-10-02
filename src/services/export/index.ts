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
import { hasCharactersPdfCantShow } from '@/domain/pdfCharacters';
import { t } from '@/i18n';
import { useStore } from '@/store';
import { showToast } from '@/store/ui';
import { saveBlobAs } from '../fileSystem';

export type ExportOptions = { htmlTheme: HtmlTheme };

async function render(
  format: ExportFormat,
  markdown: string,
  title: string,
  options: ExportOptions
): Promise<Blob> {
  const { mime } = formatInfo(format);
  const images = async () => (await import('./exportImages')).loadExportImages(markdown);
  switch (format) {
    case 'html': {
      const { markdownToHtml } = await import('./html');
      return new Blob([markdownToHtml(markdown, title, options.htmlTheme)], {
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
  const { doc } = useStore.getState();
  const name = exportFileName(doc.fileName, format);
  const title = documentTitle(doc.markdown) || name.replace(/\.[^.]+$/, '');
  try {
    // The exporters have no footnote support; see domain/footnotes.ts.
    const blob = await render(format, inlineFootnotes(doc.markdown), title, options);
    const result = await saveBlobAs(blob, name, formatInfo(format));
    if (!result) return;
    showToast(
      t(result.kind === 'written' ? 'toast.exported' : 'toast.downloaded', { name: result.name })
    );
    if (format === 'pdf' && hasCharactersPdfCantShow(doc.markdown)) {
      showToast(t('toast.pdfMissingCharacters'), undefined, 10000);
    }
  } catch {
    showToast(t('toast.exportFailed'));
  }
}
