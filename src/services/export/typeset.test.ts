import { describe, expect, it } from 'vitest';
import { type Renderers, typesetForExport } from './typeset';

const drawn = {
  bytes: new Uint8Array([1, 2, 3]),
  width: 20,
  height: 10,
  displayWidth: 10,
  displayHeight: 5,
};

const fake = (over: Partial<Renderers> = {}): Renderers => ({
  mathMl: async (tex, display) =>
    `<math data-tex="${tex}" display="${display ? 'block' : 'inline'}"></math>`,
  mathPng: async () => drawn,
  diagram: async () => ({ svg: '<svg viewBox="0 0 400 200"></svg>', width: 400, height: 200 }),
  svgPng: async () => drawn,
  ...over,
});

const MD = 'Inline $a$ here.\n\n$$\nb\n$$\n\n```mermaid\ngraph TD\n```\n';

describe('typesetForExport', () => {
  it('gives a web page MathML and the diagram as it is', async () => {
    const { markdown, images } = await typesetForExport(MD, 'html', {}, fake());
    expect(markdown).toBe(
      'Inline ![a](typeset:1) here.\n\n![b](typeset:2)\n\n![Diagram](typeset:3)\n'
    );
    expect(images.get('typeset:1')?.html).toContain('display="inline"');
    expect(images.get('typeset:2')?.html).toContain('display="block"');
    const diagram = images.get('typeset:3');
    expect(diagram?.mime).toBe('image/svg+xml');
    expect(new TextDecoder().decode(diagram?.bytes)).toContain('<svg');
    expect([diagram?.displayWidth, diagram?.displayHeight]).toEqual([400, 200]);
  });

  it('gives Word pictures of everything', async () => {
    const { images } = await typesetForExport(MD, 'docx', {}, fake());
    expect([...images.keys()]).toEqual(['typeset:1', 'typeset:2', 'typeset:3']);
    expect(images.get('typeset:1')).toMatchObject({ type: 'png', displayWidth: 10 });
    expect(images.get('typeset:1')?.html).toBeUndefined();
  });

  it('keeps inline math as text in a PDF, and draws the rest', async () => {
    const { markdown, images } = await typesetForExport(MD, 'pdf', {}, fake());
    expect(markdown).toContain('Inline $a$ here.');
    expect([...images.keys()]).toEqual(['typeset:1', 'typeset:2']);
  });

  it('leaves a plain text export, and a document without math, untouched', async () => {
    expect((await typesetForExport(MD, 'txt', {}, fake())).markdown).toBe(MD);
    const plain = 'No math, a price of $5.';
    expect(await typesetForExport(plain, 'html', {}, fake())).toEqual({
      markdown: plain,
      images: new Map(),
    });
  });

  it('writes back the text of what it could not draw', async () => {
    const failing = fake({
      mathPng: async () => null,
      diagram: async () => {
        throw new Error('no');
      },
    });
    const { markdown, images } = await typesetForExport(MD, 'docx', {}, failing);
    expect(markdown).toBe(MD);
    expect(images.size).toBe(0);
  });

  it('draws diagrams dark for a dark page', async () => {
    const seen: boolean[] = [];
    await typesetForExport(
      MD,
      'html',
      { dark: true },
      fake({
        diagram: async (_source, dark) => {
          seen.push(dark);
          return null;
        },
      })
    );
    expect(seen).toEqual([true]);
  });
});
