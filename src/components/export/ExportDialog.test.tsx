import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetStoreForTest, useStore } from '@/store';
import { ExportDialog } from './ExportDialog';

const exportDocument = vi.fn();
vi.mock('@/services/export', () => ({
  exportDocument: (...args: unknown[]) => exportDocument(...args),
}));

describe('ExportDialog', () => {
  beforeEach(() => {
    resetStoreForTest();
    exportDocument.mockReset();
    useStore.getState().setExportOpen(true);
  });

  it('offers the four formats, PDF selected', () => {
    render(<ExportDialog />);
    for (const name of [/Web page/, /^PDF/, /Word document/, /Plain text/]) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    }
    expect(screen.getByRole('radio', { name: /^PDF/ })).toBeChecked();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('shows the theme choice for HTML and passes it on', () => {
    render(<ExportDialog />);
    fireEvent.click(screen.getByRole('radio', { name: /Web page/ }));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dark' } });
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    expect(exportDocument).toHaveBeenCalledWith('html', { htmlTheme: 'dark' });
    expect(useStore.getState().exportOpen).toBe(false);
  });
});
