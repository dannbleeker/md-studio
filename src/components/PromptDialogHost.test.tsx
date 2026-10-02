import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { requestPrompt } from '@/store/ui';
import { PromptDialogHost } from './PromptDialogHost';

describe('PromptDialogHost', () => {
  it('resolves with the entered value', async () => {
    render(<PromptDialogHost />);
    const answer = requestPrompt({
      title: 'Link',
      label: 'Address',
      initial: 'https://',
      confirmLabel: 'OK',
    });
    const input = await screen.findByRole('textbox', { name: 'Address' });
    expect(input).toHaveValue('https://');
    fireEvent.change(input, { target: { value: 'https://x.dk' } });
    fireEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(await answer).toBe('https://x.dk');
  });

  it('resolves null on cancel', async () => {
    render(<PromptDialogHost />);
    const answer = requestPrompt({
      title: 'Link',
      label: 'Address',
      initial: '',
      confirmLabel: 'OK',
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(await answer).toBeNull();
  });
});
