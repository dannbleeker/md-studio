import { describe, expect, it } from 'vitest';
import { hasCharactersPdfCantShow } from './pdfCharacters';

describe('hasCharactersPdfCantShow', () => {
  it('accepts Latin text, Danish letters and typographic marks', () => {
    expect(hasCharactersPdfCantShow('Blåbærgrød — “quoted” … € 5 → done')).toBe(false);
  });

  it('flags scripts and emoji the PDF fonts lack', () => {
    for (const text of ['Ελληνικά', '日本語', 'العربية', 'Привет', 'ok 👍'])
      expect(hasCharactersPdfCantShow(text), text).toBe(true);
  });
});
