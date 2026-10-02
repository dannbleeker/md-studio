import { describe, expect, it } from 'vitest';
import { dataUrlBytes, imageInfo } from './imageInfo';

const bytes = (...b: number[]) => Uint8Array.from(b);

/** A 1×1 transparent PNG. */
const PNG_1x1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('imageInfo', () => {
  it('reads PNG size from the IHDR chunk', () => {
    const png = dataUrlBytes(`data:image/png;base64,${PNG_1x1}`);
    expect(png && imageInfo(png)).toEqual({ type: 'png', width: 1, height: 1 });
  });

  it('reads GIF size', () => {
    expect(imageInfo(bytes(0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x20, 0x03, 0x58, 0x02))).toEqual({
      type: 'gif',
      width: 800,
      height: 600,
    });
  });

  it('finds the JPEG frame after other segments', () => {
    const jpeg = bytes(
      0xff,
      0xd8,
      0xff,
      0xe0,
      0x00,
      0x04,
      0x00,
      0x00, // APP0, length 4
      0xff,
      0xc0,
      0x00,
      0x11,
      0x08,
      0x01,
      0xe0,
      0x02,
      0x80,
      0x03,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0
    );
    expect(imageInfo(jpeg)).toEqual({ type: 'jpg', width: 640, height: 480 });
  });

  it('rejects other formats and truncated files', () => {
    expect(imageInfo(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBeNull();
    expect(imageInfo(bytes(0xff, 0xd8, 0xff))).toBeNull();
    expect(imageInfo(bytes())).toBeNull();
  });
});

describe('dataUrlBytes', () => {
  it('decodes base64 image data URLs only', () => {
    expect(dataUrlBytes('data:image/png;base64,AAE=')).toEqual(bytes(0, 1));
    expect(dataUrlBytes('data:text/html;base64,AAE=')).toBeNull();
    expect(dataUrlBytes('images/a.png')).toBeNull();
    expect(dataUrlBytes('data:image/png;base64,!!')).toBeNull();
  });
});
