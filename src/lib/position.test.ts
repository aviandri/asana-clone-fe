import { describe, expect, it } from 'vitest';
import { positionAtEnd, positionBetween, positionForIndex } from './position';

describe('position', () => {
  it('computes midpoints and ends', () => {
    expect(positionBetween(1000, 2000)).toBe(1500);
    expect(positionBetween(1000, null)).toBe(2000);
    expect(positionBetween(undefined, 1000)).toBe(0);
    expect(positionBetween(null, null)).toBe(1000);
  });
  it('never returns a duplicate for equal or inverted neighbours', () => {
    expect(positionBetween(2000, 2000)).toBe(3000);
    expect(positionBetween(3000, 2000)).toBe(4000);
  });
  it('appends after the max', () => {
    expect(positionAtEnd([])).toBe(1000);
    expect(positionAtEnd([{ position: 3000 }, { position: 1000 }])).toBe(4000);
  });
  it('positions for a target index', () => {
    const list = [{ position: 1000 }, { position: 2000 }, { position: 3000 }];
    expect(positionForIndex(list, 0)).toBe(0);
    expect(positionForIndex(list, 1)).toBe(1500);
    expect(positionForIndex(list, 3)).toBe(4000);
  });
});
