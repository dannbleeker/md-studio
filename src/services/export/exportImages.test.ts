import { describe, expect, it } from 'vitest';
import { loadExportImages } from './exportImages';

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('loadExportImages', () => {
  it('loads pasted images wherever they appear, and never web images', async () => {
    const md = `Intro ![a](${PNG})\n\n- item ![b](${PNG})\n\n| x |\n| - |\n| ![c](${PNG}) |\n\n![web](https://example.com/x.png)`;
    const images = await loadExportImages(md);
    expect([...images.keys()]).toEqual([PNG]);
    expect(images.get(PNG)).toMatchObject({ type: 'png', width: 1, height: 1 });
  });

  it('skips relative images when the document has no folder access', async () => {
    expect((await loadExportImages('![x](images/x.png)')).size).toBe(0);
  });
});
