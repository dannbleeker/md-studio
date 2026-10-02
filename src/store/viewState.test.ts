import { afterEach, describe, expect, it } from 'vitest';
import { captureView, registerViewPart } from './viewState';

describe('captureView', () => {
  const cleanups: Array<() => void> = [];
  afterEach(() => {
    for (const fn of cleanups.splice(0)) fn();
  });

  it('returns the previous view when no pane is registered', () => {
    expect(captureView(undefined)).toBeUndefined();
  });

  it('merges every pane’s part over the previous view', () => {
    cleanups.push(registerViewPart(() => ({ textAnchor: 4, textHead: 9, textScroll: 120 })));
    cleanups.push(registerViewPart(() => ({})));
    const previous = { textAnchor: 0, textHead: 0, textScroll: 0, visualScroll: 300 };
    expect(captureView(previous)).toEqual({
      textAnchor: 4,
      textHead: 9,
      textScroll: 120,
      visualScroll: 300,
    });
    expect(previous.textAnchor).toBe(0);
  });

  it('stops asking a pane once it unregisters', () => {
    const off = registerViewPart(() => ({ visualScroll: 5 }));
    off();
    expect(captureView(undefined)).toBeUndefined();
  });
});
