// Static files published next to the app (public/). BASE_URL keeps them
// right if the app is ever served from a sub-path.
const base = import.meta.env.BASE_URL;

export const BOOK_PDF = `${base}Writing-in-Plain-Text.pdf`;
export const BOOK_EPUB = `${base}Writing-in-Plain-Text.epub`;
export const DASHBOARD = `${base}dashboard.html`;
