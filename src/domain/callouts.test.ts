import { describe, expect, it } from 'vitest';
import { parseCallout } from './callouts';

describe('parseCallout', () => {
  it('reads the type and a custom title', () => {
    expect(parseCallout('[!warning] Careful here\nbody')).toEqual({
      type: 'warning',
      kind: 'warning',
      label: 'Warning',
      title: 'Careful here',
      hideLength: '[!warning] '.length,
      titleEnd: '[!warning] Careful here'.length,
    });
  });

  it('has no title for a bare marker, and hides its line break', () => {
    const callout = parseCallout('[!tip]\nbody');
    expect(callout?.title).toBeNull();
    expect(callout?.hideLength).toBe('[!tip]\n'.length);
    expect(callout?.kind).toBe('tip');
  });

  it('accepts the fold markers and any case', () => {
    expect(parseCallout('[!NOTE]- Folded')?.title).toBe('Folded');
    expect(parseCallout('[!Note]+')?.type).toBe('note');
  });

  it('maps aliases to a kind and an unknown type to a note', () => {
    expect(parseCallout('[!error]')?.kind).toBe('danger');
    expect(parseCallout('[!tldr]')?.kind).toBe('abstract');
    expect(parseCallout('[!invented]')?.kind).toBe('note');
  });

  it('leaves ordinary quotes alone', () => {
    for (const text of ['plain', '[!]', '[! note]', ' [!note]', '[!note', '[!1x]', ''])
      expect(parseCallout(text)).toBeNull();
  });

  it('handles a marker with nothing after it', () => {
    expect(parseCallout('[!note]')).toMatchObject({ title: null, hideLength: 7, titleEnd: 7 });
  });
});
