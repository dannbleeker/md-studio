import { describe, expect, it } from 'vitest';
import { swipeDirection } from './swipe';

const at = (x: number, y: number, time: number) => ({ x, y, time });

describe('swipeDirection', () => {
  it('reads a swipe right as back and a swipe left as forward', () => {
    expect(swipeDirection(at(50, 300, 0), at(200, 310, 200))).toBe('back');
    expect(swipeDirection(at(300, 300, 0), at(120, 290, 200))).toBe('forward');
  });

  it('ignores a short move', () => {
    expect(swipeDirection(at(50, 300, 0), at(120, 300, 100))).toBeNull();
  });

  it('ignores a slow drag, which is a text selection', () => {
    expect(swipeDirection(at(50, 300, 0), at(250, 300, 1500))).toBeNull();
  });

  it('ignores a diagonal move, which is a scroll that wandered', () => {
    expect(swipeDirection(at(50, 300, 0), at(200, 420, 200))).toBeNull();
    expect(swipeDirection(at(50, 300, 0), at(200, 359, 200))).toBe('back');
  });

  it('ignores a clock that ran backwards', () => {
    expect(swipeDirection(at(50, 300, 500), at(250, 300, 100))).toBeNull();
  });
});
