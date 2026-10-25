import { describe, expect, it, vi } from 'vitest';

const mounts = vi.hoisted(() => [] as { token: string; markdown: boolean | undefined }[]);
const updates = vi.hoisted(() => [] as string[]);
const destroyed = vi.hoisted(() => ({ count: 0 }));

vi.mock('./embedRender', () => ({
  mountEmbed: (_dom: HTMLElement, token: string, opts: { markdown?: boolean }) => {
    mounts.push({ token, markdown: opts.markdown });
    return {
      update: (next: string) => updates.push(next),
      destroy: () => {
        destroyed.count++;
      },
    };
  },
}));

const { mountLiveEmbed, withEmbedRender } = await import('./embedView');
const loaded = () => new Promise<void>((resolve) => withEmbedRender(() => resolve()));

describe('mountLiveEmbed', () => {
  // One test: the render module loads once per file, and both cases need it not loaded yet.
  it('mounts the latest token once the module arrives, and nothing for a view gone by then', async () => {
    const dom = document.createElement('span');
    const kept = mountLiveEmbed(dom, '![[a.png]]', true);
    const gone = mountLiveEmbed(document.createElement('span'), '[[Note]]');
    expect(dom.querySelector('.md-embed-loading')).not.toBeNull();
    // Edited, and the other view closed, before the render module arrived.
    kept.update('![[b.png]]');
    gone.destroy();
    await loaded();
    expect(mounts).toEqual([{ token: '![[b.png]]', markdown: true }]);
    kept.update('![[c.png]]');
    expect(updates.at(-1)).toBe('![[c.png]]');
    kept.destroy();
    expect(destroyed.count).toBe(1);
  });
});
