export type ChapterMetadata = {
  filename: string;
  slug: string;
  title: string;
  subtitle: string | null;
  raw: string;
};
export const PUBLIC_DIR: string;
export const BOOK_ID: string;
export const BOOK_TITLE: string;
export const BOOK_SUBTITLE: string;
export const BOOK_AUTHOR: string;
export const BOOK_LANG: string;
export const BOOK_PUBLISHER: string;
export const BOOK_SUBJECTS: string[];
export const BOOK_SLUG: string;
export function readChapterMetadata(): Promise<ChapterMetadata[]>;
export const TOC_GROUPS: { label: string; match: (c: ChapterMetadata) => boolean }[];
