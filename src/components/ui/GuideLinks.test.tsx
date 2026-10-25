import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n';
import { openUserGuide } from '@/services/documentActions';
import { BOOK_EPUB, BOOK_PDF, GUIDE_PDF } from '@/services/links';
import { GuideLinks } from './GuideLinks';

vi.mock('@/services/documentActions', () => ({ openUserGuide: vi.fn(async () => {}) }));

describe('GuideLinks', () => {
  it('links the guide and the book', () => {
    render(<GuideLinks />);
    expect(screen.getByRole('link', { name: t('start.guidePdf') })).toHaveAttribute(
      'href',
      GUIDE_PDF
    );
    expect(screen.getByRole('link', { name: t('start.bookPdf') })).toHaveAttribute(
      'href',
      BOOK_PDF
    );
    expect(screen.getByRole('link', { name: t('start.bookEpub') })).toHaveAttribute(
      'href',
      BOOK_EPUB
    );
  });

  it('opens the guide, after what has to happen first', () => {
    const order: string[] = [];
    vi.mocked(openUserGuide).mockImplementation(async () => {
      order.push('guide');
    });
    render(<GuideLinks beforeGuide={() => order.push('close')} />);
    fireEvent.click(screen.getByRole('button', { name: t('start.guide') }));
    expect(order).toEqual(['close', 'guide']);
  });
});
