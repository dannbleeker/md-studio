import { describe, expect, it } from 'vitest';
import { planTypeset } from './typesetPlan';

const all = { inlineMath: true, displayMath: true, diagrams: true };

describe('planTypeset', () => {
  it('replaces math and diagrams with image links and lists what they were', () => {
    const md = 'Let $a_1$ be.\n\n$$\nx^2\n$$\n\n```mermaid\ngraph TD\n  A --> B\n```\n\nEnd';
    const plan = planTypeset(md, all);
    expect(plan.markdown).toBe(
      'Let ![a_1](typeset:1) be.\n\n![x^2](typeset:2)\n\n![Diagram](typeset:3)\n\nEnd'
    );
    expect(plan.items.map((i) => [i.id, i.kind])).toEqual([
      ['typeset:1', 'math'],
      ['typeset:2', 'math'],
      ['typeset:3', 'diagram'],
    ]);
    expect(plan.items[1]).toMatchObject({ display: true, tex: 'x^2' });
    expect(plan.items[2]).toMatchObject({ source: 'graph TD\n  A --> B' });
  });

  it('leaves what a format cannot use alone', () => {
    const md = 'Inline $a$ and\n\n$$b$$\n';
    expect(planTypeset(md, { inlineMath: false, displayMath: true, diagrams: true }).markdown).toBe(
      'Inline $a$ and\n\n![b](typeset:1)\n'
    );
    expect(planTypeset(md, { inlineMath: false, displayMath: false, diagrams: false })).toEqual({
      markdown: md,
      items: [],
    });
  });

  it('keeps prices, code and other fences as they are', () => {
    const md = 'It costs $5 and $10, `$x$`.\n\n```js\n$y$\n```\n';
    expect(planTypeset(md, all)).toEqual({ markdown: md, items: [] });
  });

  it('makes a safe alt text from a formula', () => {
    const plan = planTypeset('$a [b] \\\\ c$', all);
    expect(plan.markdown).toBe('![a b c](typeset:1)');
  });

  it('stops at the limit and leaves the rest as written', () => {
    const md = Array.from({ length: 5 }, (_, i) => `$x_${i}$`).join(' ');
    const plan = planTypeset(md, all, 2);
    expect(plan.items).toHaveLength(2);
    expect(plan.markdown).toBe('![x_0](typeset:1) ![x_1](typeset:2) $x_2$ $x_3$ $x_4$');
  });
});
