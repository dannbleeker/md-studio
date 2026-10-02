export type MarkdownPdfOptions = {
  /** Markdown documents, rendered in order; each H1 starts a page. */
  sources: string[];
  title: string;
  author?: string;
  subject?: string;
  producer?: string;
  creator?: string;
  keywords?: string[];
  /** Images to embed, by source as written in the Markdown (PNG and JPEG). */
  images?: ReadonlyMap<
    string,
    { type: 'png' | 'jpg' | 'gif'; bytes: Uint8Array; width: number; height: number }
  >;
  /** Book mode: cover page, clickable contents and bookmarks. */
  cover?: { eyebrow?: string } | null;
};
export function markdownToPdf(options: MarkdownPdfOptions): Promise<Uint8Array>;
