import { describe, expect, it } from 'vitest';
import { imageFileName, relativeImagePath } from './imagePaths';
import {
  attachmentDirectory,
  attachmentFileName,
  DEFAULT_VAULT_CONFIG,
  effectiveLinkStyle,
  encodeLinkPath,
  formatAttachmentLink,
  parseVaultConfig,
  type VaultConfig,
} from './vaultConfig';
import { buildVaultIndex, joinPath, resolveTarget } from './vaultIndex';

const cfg = (over: Partial<VaultConfig> = {}): VaultConfig => ({
  ...DEFAULT_VAULT_CONFIG,
  ...over,
});
const noneTaken = () => false;
const taken =
  (...names: string[]) =>
  (name: string) =>
    names.includes(name);
/** Local time, so the expected names do not depend on the machine's zone. */
const NOW = new Date(2026, 9, 12, 8, 30, 5);
const PNG = { name: 'image.png', type: 'image/png' };

describe('parseVaultConfig', () => {
  it('returns null without an .obsidian config (legacy vault)', () => {
    expect(parseVaultConfig(null)).toBeNull();
  });

  it('reads the three settings this app uses', () => {
    expect(
      parseVaultConfig(
        '{"attachmentFolderPath":"./media","useMarkdownLinks":true,"newLinkFormat":"relative"}'
      )
    ).toEqual({
      attachmentFolderPath: './media',
      useMarkdownLinks: true,
      newLinkFormat: 'relative',
    });
  });

  it.each(['{', '', 'not json', '{"a":1', '{"useMarkdownLinks":true,}'])(
    'gives defaults for invalid JSON %j',
    (json) => {
      expect(parseVaultConfig(json)).toEqual(DEFAULT_VAULT_CONFIG);
    }
  );

  it.each(['[]', '[{"useMarkdownLinks":true}]', 'null', '3', '"text"', 'true'])(
    'gives defaults when the JSON is not an object: %s',
    (json) => {
      expect(parseVaultConfig(json)).toEqual(DEFAULT_VAULT_CONFIG);
    }
  );

  it('gives defaults for an empty object', () => {
    expect(parseVaultConfig('{}')).toEqual(DEFAULT_VAULT_CONFIG);
  });

  it('falls back per field when a value has the wrong type', () => {
    expect(
      parseVaultConfig(
        '{"attachmentFolderPath":3,"useMarkdownLinks":"yes","newLinkFormat":"bogus"}'
      )
    ).toEqual(DEFAULT_VAULT_CONFIG);
    expect(
      parseVaultConfig(
        '{"attachmentFolderPath":null,"useMarkdownLinks":1,"newLinkFormat":"absolute"}'
      )
    ).toEqual({ attachmentFolderPath: '/', useMarkdownLinks: false, newLinkFormat: 'absolute' });
  });

  it.each(['shortest', 'relative', 'absolute'] as const)('accepts link format %s', (format) => {
    expect(parseVaultConfig(`{"newLinkFormat":"${format}"}`)?.newLinkFormat).toBe(format);
  });

  it('ignores unknown keys and prototype names without polluting Object.prototype', () => {
    const json =
      '{"alwaysUpdateLinks":true,"__proto__":{"useMarkdownLinks":true},' +
      '"constructor":"x","toString":1,"hasOwnProperty":2}';
    expect(parseVaultConfig(json)).toEqual(DEFAULT_VAULT_CONFIG);
    expect('useMarkdownLinks' in {}).toBe(false);
  });
});

describe('effectiveLinkStyle', () => {
  it('lets an explicit setting win over the vault config', () => {
    expect(effectiveLinkStyle('wikilink', null)).toBe('wikilink');
    expect(effectiveLinkStyle('wikilink', cfg({ useMarkdownLinks: true }))).toBe('wikilink');
    expect(effectiveLinkStyle('markdown', null)).toBe('markdown');
    expect(effectiveLinkStyle('markdown', cfg({ useMarkdownLinks: false }))).toBe('markdown');
  });

  it('follows the vault for auto, and uses Markdown links without a config (legacy)', () => {
    expect(effectiveLinkStyle('auto', null)).toBe('markdown');
    expect(effectiveLinkStyle('auto', cfg())).toBe('wikilink');
    expect(effectiveLinkStyle('auto', cfg({ useMarkdownLinks: true }))).toBe('markdown');
  });
});

describe('attachmentDirectory', () => {
  it('uses an images folder beside the note without a config (legacy)', () => {
    expect(attachmentDirectory(null, 'n.md')).toBe('images');
    expect(attachmentDirectory(null, 'Notes/Daily/n.md')).toBe('Notes/Daily/images');
  });

  it('uses the vault root for "/" and for an empty value', () => {
    for (const folder of ['/', '']) {
      expect(attachmentDirectory(cfg({ attachmentFolderPath: folder }), 'n.md')).toBe('');
      expect(attachmentDirectory(cfg({ attachmentFolderPath: folder }), 'A/B/n.md')).toBe('');
    }
  });

  it('ignores slashes around the folder, however many, in linear time', () => {
    const folder = `a${'/'.repeat(80_000)}b`;
    const started = performance.now();
    expect(attachmentDirectory(cfg({ attachmentFolderPath: folder }), 'n.md')).toBe('a/b');
    expect(performance.now() - started).toBeLessThan(500);
    expect(attachmentDirectory(cfg({ attachmentFolderPath: '//Att//' }), 'n.md')).toBe('Att');
    expect(attachmentDirectory(cfg({ attachmentFolderPath: '///' }), 'n.md')).toBe('');
  });

  it('uses the note folder for "." and "./"', () => {
    for (const folder of ['.', './']) {
      expect(attachmentDirectory(cfg({ attachmentFolderPath: folder }), 'n.md')).toBe('');
      expect(attachmentDirectory(cfg({ attachmentFolderPath: folder }), 'Notes/Daily/n.md')).toBe(
        'Notes/Daily'
      );
    }
  });

  it('uses a subfolder of the note folder for "./sub"', () => {
    const sub = cfg({ attachmentFolderPath: './media' });
    expect(attachmentDirectory(sub, 'n.md')).toBe('media');
    expect(attachmentDirectory(sub, 'Notes/n.md')).toBe('Notes/media');
    expect(attachmentDirectory(cfg({ attachmentFolderPath: './media/' }), 'Notes/n.md')).toBe(
      'Notes/media'
    );
  });

  it('uses a fixed vault folder for any other value', () => {
    expect(attachmentDirectory(cfg({ attachmentFolderPath: 'attachments' }), 'n.md')).toBe(
      'attachments'
    );
    expect(attachmentDirectory(cfg({ attachmentFolderPath: 'attachments' }), 'A/B/n.md')).toBe(
      'attachments'
    );
  });

  it('strips leading and trailing slashes and normalises fixed folders', () => {
    const fixed = (folder: string) =>
      attachmentDirectory(cfg({ attachmentFolderPath: folder }), 'n.md');
    expect(fixed('/attachments/')).toBe('attachments');
    expect(fixed('//x//')).toBe('x');
    expect(fixed('a/./b')).toBe('a/b');
    expect(fixed('a//b')).toBe('a/b');
    expect(fixed('a\\b')).toBe('a/b');
    expect(fixed('//')).toBe('');
  });

  it('resolves "./" folders that climb within the vault', () => {
    expect(
      attachmentDirectory(cfg({ attachmentFolderPath: './../shared' }), 'Notes/Daily/n.md')
    ).toBe('Notes/shared');
    expect(
      attachmentDirectory(cfg({ attachmentFolderPath: './../../x' }), 'Notes/Daily/n.md')
    ).toBe('x');
  });

  it('returns the root for any path that leaves the vault', () => {
    const folders = ['../outside', 'a/../../x', '..', './..', './../x'];
    for (const folder of folders) {
      expect(attachmentDirectory(cfg({ attachmentFolderPath: folder }), 'n.md')).toBe('');
    }
    expect(attachmentDirectory(cfg({ attachmentFolderPath: './../x' }), 'Notes/n.md')).toBe('x');
    expect(attachmentDirectory(cfg({ attachmentFolderPath: './../../x' }), 'Notes/n.md')).toBe('');
  });

  it('reads the folder from a parsed app.json', () => {
    const config = parseVaultConfig('{"attachmentFolderPath":"./media"}');
    expect(attachmentDirectory(config, 'Notes/n.md')).toBe('Notes/media');
  });
});

describe('attachmentFileName: clipboard images with a vault config', () => {
  it('names pasted images by local time, to the second', () => {
    expect(attachmentFileName(PNG, 'paste', NOW, noneTaken, cfg())).toBe(
      'Pasted image 20261012083005.png'
    );
  });

  it('zero-pads every field', () => {
    expect(attachmentFileName(PNG, 'paste', new Date(2026, 0, 2, 3, 4, 5), noneTaken, cfg())).toBe(
      'Pasted image 20260102030405.png'
    );
  });

  it.each([
    ['image/jpeg', 'jpg'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
    ['image/svg+xml', 'svg'],
    ['image/avif', 'avif'],
  ])('takes the extension from the type %s', (type, ext) => {
    expect(attachmentFileName({ name: 'x', type }, 'paste', NOW, noneTaken, cfg())).toBe(
      `Pasted image 20261012083005.${ext}`
    );
  });

  it('uses the file extension for an unknown image type, and png when there is none', () => {
    expect(
      attachmentFileName({ name: 'shot.bmp', type: 'image/bmp' }, 'paste', NOW, noneTaken, cfg())
    ).toBe('Pasted image 20261012083005.bmp');
    expect(
      attachmentFileName({ name: 'x.HEIC', type: 'image/heic' }, 'paste', NOW, noneTaken, cfg())
    ).toBe('Pasted image 20261012083005.heic');
    expect(
      attachmentFileName({ name: 'capture', type: 'image/tiff' }, 'paste', NOW, noneTaken, cfg())
    ).toBe('Pasted image 20261012083005.png');
  });

  it('numbers collisions before the extension', () => {
    const first = 'Pasted image 20261012083005.png';
    expect(attachmentFileName(PNG, 'paste', NOW, taken(first), cfg())).toBe(
      'Pasted image 20261012083005 1.png'
    );
    expect(
      attachmentFileName(
        PNG,
        'paste',
        NOW,
        taken(first, 'Pasted image 20261012083005 1.png'),
        cfg()
      )
    ).toBe('Pasted image 20261012083005 2.png');
  });
});

describe('attachmentFileName: legacy path without a vault config', () => {
  it('uses the image-YYYYMMDD-HHmmss name the app always used', () => {
    expect(attachmentFileName(PNG, 'paste', NOW, noneTaken, null)).toBe(
      'image-20261012-083005.png'
    );
    expect(
      attachmentFileName({ name: 'x.jpg', type: 'image/jpeg' }, 'paste', NOW, noneTaken, null)
    ).toBe('image-20261012-083005.jpg');
  });

  it('matches imageFileName exactly, collisions included', () => {
    const names = ['image-20261012-083005.png', 'image-20261012-083005-2.png'];
    const isTaken = taken(...names);
    expect(attachmentFileName(PNG, 'paste', NOW, isTaken, null)).toBe(
      imageFileName(NOW, 'png', isTaken)
    );
    expect(attachmentFileName(PNG, 'paste', NOW, isTaken, null)).toBe(
      'image-20261012-083005-3.png'
    );
  });

  it('keeps imageExtension for unknown types, as it always did', () => {
    expect(
      attachmentFileName({ name: 'shot.bmp', type: 'image/bmp' }, 'paste', NOW, noneTaken, null)
    ).toBe('image-20261012-083005.png');
  });
});

describe('attachmentFileName: dropped files and non-image pastes', () => {
  it('keeps the original name, case included', () => {
    expect(
      attachmentFileName(
        { name: 'holiday photo.JPG', type: 'image/jpeg' },
        'drop',
        NOW,
        noneTaken,
        cfg()
      )
    ).toBe('holiday photo.JPG');
    expect(attachmentFileName({ name: 'README.MD', type: '' }, 'drop', NOW, noneTaken, cfg())).toBe(
      'README.MD'
    );
  });

  it('keeps the original name without a vault config too', () => {
    expect(
      attachmentFileName(
        { name: 'holiday photo.JPG', type: 'image/jpeg' },
        'drop',
        NOW,
        noneTaken,
        null
      )
    ).toBe('holiday photo.JPG');
  });

  it('keeps the name of a non-image paste', () => {
    expect(
      attachmentFileName(
        { name: 'report.pdf', type: 'application/pdf' },
        'paste',
        NOW,
        noneTaken,
        cfg()
      )
    ).toBe('report.pdf');
  });

  it('does not rename a file just because its name looks like a pasted image', () => {
    const name = 'Pasted image 20261012083005.png';
    expect(attachmentFileName({ name, type: 'image/png' }, 'drop', NOW, noneTaken, cfg())).toBe(
      name
    );
    expect(attachmentFileName({ name, type: 'image/png' }, 'drop', NOW, taken(name), cfg())).toBe(
      'Pasted image 20261012083005 1.png'
    );
  });

  it('keeps letters outside ASCII and ordinary punctuation', () => {
    expect(
      attachmentFileName(
        { name: 'Årsrapport æøå (final).pdf', type: 'application/pdf' },
        'drop',
        NOW,
        noneTaken,
        cfg()
      )
    ).toBe('Årsrapport æøå (final).pdf');
    expect(
      attachmentFileName(
        { name: 'Résumé 2026.pdf', type: 'application/pdf' },
        'drop',
        NOW,
        noneTaken,
        cfg()
      )
    ).toBe('Résumé 2026.pdf');
  });
});

describe('attachmentFileName: dropped images without a usable extension', () => {
  const drop = (name: string, type: string, config: VaultConfig | null = cfg()) =>
    attachmentFileName({ name, type }, 'drop', NOW, noneTaken, config);

  it('adds the extension of the MIME type when the name has none', () => {
    expect(drop('photo', 'image/jpeg')).toBe('photo.jpg');
    expect(drop('download', 'image/webp')).toBe('download.webp');
    expect(drop('photo', 'image/jpeg', null)).toBe('photo.jpg');
  });

  it('keeps a dotfile-like name usable', () => {
    expect(drop('.png', 'image/png')).toBe('png.png');
  });

  it('swaps an extension a browser cannot show for the one the type names', () => {
    expect(drop('x.jfif', 'image/jpeg')).toBe('x.jpg');
    expect(drop('x.jpe', 'image/jpeg')).toBe('x.jpg');
    expect(drop('anim.apng', 'image/apng')).toBe('anim.png');
  });

  it('names a type without a browser-safe extension after the type itself', () => {
    expect(drop('shot', 'image/heic')).toBe('shot.heic');
    expect(drop('shot', 'image/tiff')).toBe('shot.tiff');
    expect(drop('logo', 'image/x-icon')).toBe('logo.ico');
    expect(drop('logo', 'image/vnd.microsoft.icon')).toBe('logo.ico');
  });

  it('keeps the own extension of such a file', () => {
    expect(drop('x.heic', 'image/heic')).toBe('x.heic');
    expect(drop('x.tiff', 'image/tiff')).toBe('x.tiff');
    expect(drop('logo.ico', 'image/x-icon')).toBe('logo.ico');
  });

  it('leaves recognised image names and non-image types alone', () => {
    expect(drop('a.PNG', 'image/png')).toBe('a.PNG');
    expect(drop('a.jpg', 'image/png')).toBe('a.jpg');
    expect(drop('notes', 'text/plain')).toBe('notes');
    expect(drop('blob', '')).toBe('blob');
  });

  it('does not take a hostile MIME subtype as an extension', () => {
    expect(drop('x', 'image/../../etc')).toBe('x');
    expect(drop('x', 'image/')).toBe('x');
  });

  it('still avoids collisions after adding the extension', () => {
    expect(
      attachmentFileName(
        { name: 'photo', type: 'image/jpeg' },
        'drop',
        NOW,
        taken('photo.jpg'),
        cfg()
      )
    ).toBe('photo 1.jpg');
  });
});

describe('attachmentFileName: sanitising', () => {
  const drop = (name: string) =>
    attachmentFileName({ name, type: 'application/octet-stream' }, 'drop', NOW, noneTaken, cfg());

  it('replaces reserved characters with a dash', () => {
    expect(drop('a\\b/c:d*e?f"g<h>i|j#k^l[m]n.png')).toBe('a-b-c-d-e-f-g-h-i-j-k-l-m-n.png');
  });

  it('replaces control characters, tabs and newlines included', () => {
    expect(drop('x\u0001y\u007fz\u0085w.txt')).toBe('x-y-z-w.txt');
    expect(drop('a\tb\nc.txt')).toBe('a-b-c.txt');
  });

  it('collapses whitespace runs, including non-breaking spaces', () => {
    expect(drop('my   file   name.png')).toBe('my file name.png');
  });

  it('trims dots and spaces from both ends', () => {
    expect(drop('...hidden.txt...')).toBe('hidden.txt');
    expect(drop('  spaced.txt  ')).toBe('spaced.txt');
  });

  it.each(['', '.', '   ', '...', ' . '])('falls back to "attachment" for %j', (name) => {
    expect(drop(name)).toBe('attachment');
  });

  it('numbers an empty fallback name like any other collision', () => {
    expect(
      attachmentFileName({ name: '', type: '' }, 'drop', NOW, taken('attachment'), cfg())
    ).toBe('attachment 1');
  });

  it('truncates to 120 characters and keeps the extension', () => {
    expect(drop(`${'a'.repeat(200)}.pdf`)).toBe(`${'a'.repeat(116)}.pdf`);
    expect(drop('b'.repeat(300))).toBe('b'.repeat(120));
  });

  it('does not keep an implausibly long extension, so the cut stays at 120', () => {
    const name = drop(`x.${'e'.repeat(150)}`);
    expect(name).toBe(`x.${'e'.repeat(118)}`);
    expect(name.length).toBe(120);
  });

  it('counts characters, not UTF-16 units, when truncating', () => {
    const name = drop(`${'𝒳'.repeat(130)}.png`);
    expect(name).toBe(`${'𝒳'.repeat(116)}.png`);
    expect(Array.from(name)).toHaveLength(120);
  });
});

describe('attachmentFileName: collisions', () => {
  const drop = (name: string, isTaken: (n: string) => boolean) =>
    attachmentFileName({ name, type: 'application/octet-stream' }, 'drop', NOW, isTaken, cfg());

  it('inserts " 1", " 2" before the extension until a name is free', () => {
    expect(drop('a.png', taken('a.png'))).toBe('a 1.png');
    expect(drop('a.png', taken('a.png', 'a 1.png'))).toBe('a 2.png');
  });

  it('appends the number when there is no extension', () => {
    expect(drop('README', taken('README'))).toBe('README 1');
  });

  it('numbers the last dot only', () => {
    expect(drop('archive.tar.gz', taken('archive.tar.gz'))).toBe('archive.tar 1.gz');
  });

  it('numbers a collision with a sanitised name', () => {
    expect(drop('a:b.png', taken('a-b.png'))).toBe('a-b 1.png');
  });
});

describe('encodeLinkPath', () => {
  it('encodes spaces per segment and keeps the slashes', () => {
    expect(encodeLinkPath('images/my file.png')).toBe('images/my%20file.png');
  });

  it('encodes parentheses, which Markdown destinations need', () => {
    expect(encodeLinkPath('a/b (1).png')).toBe('a/b%20%281%29.png');
  });

  it('encodes angle brackets, square brackets, hash, question mark, percent, ampersand and backslash', () => {
    expect(encodeLinkPath('<x>[y]#z?w%v&q\\r.png')).toBe('%3Cx%3E%5By%5D%23z%3Fw%25v%26q%5Cr.png');
  });

  it('encodes tabs and other whitespace', () => {
    expect(encodeLinkPath('a\tb.png')).toBe('a%09b.png');
  });

  it('keeps non-ASCII readable', () => {
    expect(encodeLinkPath('Notes/Årsrapport é.png')).toBe('Notes/Årsrapport%20é.png');
  });

  it('leaves plain names and relative segments alone', () => {
    expect(encodeLinkPath('images/image-20261012-083005.png')).toBe(
      'images/image-20261012-083005.png'
    );
    expect(encodeLinkPath('../images/a.png')).toBe('../images/a.png');
  });
});

describe('formatAttachmentLink: wikilinks', () => {
  const index = buildVaultIndex([
    'Notes/n.md',
    'Notes/Daily/x.png',
    'images/x.png',
    'Notes/Daily/Plan.md',
    'Projects/Plan.md',
    'images/my file (1).png',
    'files/report.docx',
  ]);
  const link = (over: Partial<Parameters<typeof formatAttachmentLink>[0]>) =>
    formatAttachmentLink({
      style: 'wikilink',
      config: cfg(),
      index,
      targetPath: 'images/x.png',
      notePath: 'Notes/n.md',
      kind: 'image',
      ...over,
    });

  it('uses the shortest unique path by default', () => {
    expect(link({})).toBe('![[images/x.png]]');
    expect(link({ targetPath: 'Notes/Daily/x.png' })).toBe('![[Daily/x.png]]');
  });

  it('drops .md for notes in the shortest format only', () => {
    expect(link({ targetPath: 'Notes/Daily/Plan.md', kind: 'note' })).toBe('![[Daily/Plan]]');
    expect(
      link({
        targetPath: 'Notes/Daily/Plan.md',
        kind: 'note',
        config: cfg({ newLinkFormat: 'absolute' }),
      })
    ).toBe('![[Notes/Daily/Plan.md]]');
  });

  it('writes the alt text after a pipe', () => {
    expect(link({ alt: 'Diagram' })).toBe('![[images/x.png|Diagram]]');
  });

  it('uses the path relative to the note folder for "relative"', () => {
    const config = cfg({ newLinkFormat: 'relative' });
    expect(link({ config, notePath: 'Notes/Daily/n.md' })).toBe('![[../../images/x.png]]');
    expect(
      link({ config, notePath: 'Notes/n.md', targetPath: 'Notes/Daily/Plan.md', kind: 'note' })
    ).toBe('![[Daily/Plan.md]]');
  });

  it('uses the full vault path for "absolute"', () => {
    expect(link({ config: cfg({ newLinkFormat: 'absolute' }), notePath: 'Notes/Daily/n.md' })).toBe(
      '![[images/x.png]]'
    );
  });

  it('uses the root when there is no note path', () => {
    expect(link({ config: cfg({ newLinkFormat: 'relative' }), notePath: null })).toBe(
      '![[images/x.png]]'
    );
  });

  it('defaults to shortest without a config (legacy)', () => {
    expect(link({ config: null, targetPath: 'images/x.png' })).toBe('![[images/x.png]]');
  });
});

describe('formatAttachmentLink: relative wikilinks', () => {
  const index = buildVaultIndex(['photo.png', 'Notes/photo.png', 'Notes/n.md', 'Notes/Sub/p.png']);
  const link = (targetPath: string, notePath: string) =>
    formatAttachmentLink({
      style: 'wikilink',
      config: cfg({ newLinkFormat: 'relative' }),
      index,
      targetPath,
      notePath,
      kind: 'image',
    });

  it('marks a same-folder file as note-relative so a root file of that name is not picked', () => {
    const text = link('Notes/photo.png', 'Notes/n.md');
    expect(text).toBe('![[./photo.png]]');
    const target = text.slice(3, -2);
    expect(resolveTarget(index, target, 'Notes/n.md')?.path).toBe('Notes/photo.png');
  });

  it('leaves paths with a folder part and root notes as they were', () => {
    expect(link('Notes/Sub/p.png', 'Notes/n.md')).toBe('![[Sub/p.png]]');
    expect(link('photo.png', 'Notes/n.md')).toBe('![[../photo.png]]');
    expect(link('photo.png', 'n.md')).toBe('![[photo.png]]');
  });
});

describe('formatAttachmentLink: Markdown links', () => {
  const none = buildVaultIndex([]);
  const md = (over: Partial<Parameters<typeof formatAttachmentLink>[0]>) =>
    formatAttachmentLink({
      style: 'markdown',
      config: null,
      index: none,
      targetPath: 'images/x.png',
      notePath: 'n.md',
      kind: 'image',
      ...over,
    });

  it('gives a note-relative image link without a config (legacy)', () => {
    expect(
      md({ targetPath: 'images/image-20261012-083005.png', alt: 'image-20261012-083005' })
    ).toBe('![image-20261012-083005](images/image-20261012-083005.png)');
    expect(
      md({
        targetPath: 'Notes/images/image-20261012-083005.png',
        notePath: 'Notes/Daily/n.md',
        alt: 'image-20261012-083005',
      })
    ).toBe('![image-20261012-083005](../images/image-20261012-083005.png)');
  });

  it('encodes spaces and parentheses in the destination but leaves the alt readable', () => {
    expect(md({ targetPath: 'images/my file (1).png', alt: 'my file (1)' })).toBe(
      '![my file (1)](images/my%20file%20%281%29.png)'
    );
  });

  it('escapes brackets, backslash and pipe in alt text', () => {
    expect(md({ alt: 'a [b] c\\d|e' })).toBe('![a \\[b\\] c\\\\d\\|e](images/x.png)');
  });

  it('gives a link without a bang for other files', () => {
    expect(md({ targetPath: 'files/report.docx', kind: 'other' })).toBe(
      '[report.docx](files/report.docx)'
    );
    expect(md({ targetPath: 'files/report.docx', kind: 'other', alt: 'Quarterly report' })).toBe(
      '[Quarterly report](files/report.docx)'
    );
  });

  it('gives a link without a bang for notes', () => {
    const index = buildVaultIndex(['Notes/n.md', 'Notes/Daily/Plan.md']);
    expect(
      md({ index, notePath: 'Notes/n.md', targetPath: 'Notes/Daily/Plan.md', kind: 'note' })
    ).toBe('[Plan.md](Daily/Plan.md)');
  });

  it('gives a bang for pdf, audio and video', () => {
    expect(md({ targetPath: 'docs/a.pdf', kind: 'pdf', alt: 'Spec' })).toBe('![Spec](docs/a.pdf)');
    expect(md({ targetPath: 'media/a.mp3', kind: 'audio' })).toBe('![](media/a.mp3)');
    expect(md({ targetPath: 'media/a.mp4', kind: 'video' })).toBe('![](media/a.mp4)');
  });

  it('uses the shortest path when the config asks for Markdown links', () => {
    const index = buildVaultIndex(['Notes/n.md', 'files/report.docx']);
    const config = cfg({ useMarkdownLinks: true });
    expect(
      formatAttachmentLink({
        style: 'markdown',
        config,
        index,
        targetPath: 'files/report.docx',
        notePath: 'Notes/n.md',
        kind: 'other',
      })
    ).toBe('[report.docx](report.docx)');
  });

  it('uses the absolute path when the config asks for it', () => {
    expect(
      md({
        config: cfg({ newLinkFormat: 'absolute', useMarkdownLinks: true }),
        targetPath: 'images/my file (1).png',
        alt: 'x',
      })
    ).toBe('![x](images/my%20file%20%281%29.png)');
  });

  it('never writes angle-bracket destinations', () => {
    expect(md({ targetPath: 'images/my file (1).png', alt: 'x' })).not.toContain('<');
  });

  it('matches the old relativeImagePath output for plain names, from any folder', () => {
    const cases: [string[], string[]][] = [
      [['n.md'], ['images', 'image-20261012-083005.png']],
      [
        ['Notes', 'n.md'],
        ['Notes', 'images', 'my file.png'],
      ],
      [
        ['Notes', 'Daily', 'n.md'],
        ['Notes', 'images', 'a b.png'],
      ],
      [
        ['Notes', 'Daily', 'n.md'],
        ['images', 'x.png'],
      ],
    ];
    for (const [docPath, imagePath] of cases) {
      const notePath = docPath.join('/');
      const targetPath = imagePath.join('/');
      const legacy = `![alt](${relativeImagePath(docPath, imagePath)})`;
      expect(md({ notePath, targetPath, alt: 'alt' })).toBe(legacy);
    }
  });
});

describe('vault conventions end to end', () => {
  it('builds a pasted image link in a configured folder', () => {
    const config = parseVaultConfig('{"attachmentFolderPath":"./media"}');
    const folder = attachmentDirectory(config, 'Notes/n.md');
    const name = attachmentFileName(PNG, 'paste', NOW, noneTaken, config);
    const target = joinPath(folder, name);
    expect(target).toBe('Notes/media/Pasted image 20261012083005.png');
    expect(
      formatAttachmentLink({
        style: 'wikilink',
        config,
        index: buildVaultIndex([target ?? '']),
        targetPath: target ?? '',
        notePath: 'Notes/n.md',
        kind: 'image',
      })
    ).toBe('![[Pasted image 20261012083005.png]]');
  });
});
