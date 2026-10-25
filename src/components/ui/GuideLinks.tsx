import { t } from '@/i18n';
import { openUserGuide } from '@/services/documentActions';
import { BOOK_EPUB, BOOK_PDF, GUIDE_PDF } from '@/services/links';

/**
 * The user guide and the book, as the start screen and the settings both
 * offer them. `beforeGuide` runs before the guide opens (the settings
 * dialog closes first).
 */
export function GuideLinks({ beforeGuide }: { beforeGuide?: () => void }) {
  return (
    <>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          beforeGuide?.();
          void openUserGuide();
        }}
      >
        {t('start.guide')}
      </button>
      <a href={GUIDE_PDF} target="_blank" rel="noopener">
        {t('start.guidePdf')}
      </a>
      <a href={BOOK_PDF} target="_blank" rel="noopener">
        {t('start.bookPdf')}
      </a>
      <a href={BOOK_EPUB} download>
        {t('start.bookEpub')}
      </a>
    </>
  );
}
