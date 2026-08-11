import { describe, expect, it } from 'vitest';

import { linesThatFit, truncate, wrapText, type Measure } from '../src/lib/layout';

/** Every character is 10 wide, so widths are easy to reason about. */
const measure: Measure = (text) => text.length * 10;

describe('wrapText', () => {
  it('keeps short text on one line', () => {
    expect(wrapText('Gift box', 200, measure)).toEqual(['Gift box']);
  });

  it('wraps at word boundaries', () => {
    // "three four" is exactly 100 wide, so it fits — the limit is inclusive.
    expect(wrapText('one two three four', 100, measure)).toEqual(['one two', 'three four']);
    expect(wrapText('one two three four', 90, measure)).toEqual(['one two', 'three', 'four']);
  });

  it('breaks a word too long for the column', () => {
    // A pasted URL or part number would otherwise run off the page edge.
    expect(wrapText('supercalifragilistic', 50, measure)).toEqual([
      'super',
      'calif',
      'ragil',
      'istic',
    ]);
  });

  it('breaks a long word that follows other words', () => {
    const lines = wrapText('see supercalifragilistic', 50, measure);
    expect(lines[0]).toBe('see');
    expect(lines.slice(1).join('')).toBe('supercalifragilistic');
  });

  it('keeps explicit line breaks', () => {
    expect(wrapText('one\ntwo', 200, measure)).toEqual(['one', 'two']);
  });

  it('keeps a blank line rather than collapsing it', () => {
    // Address blocks use them for spacing.
    expect(wrapText('one\n\ntwo', 200, measure)).toEqual(['one', '', 'two']);
  });

  it('collapses runs of spaces within a line', () => {
    expect(wrapText('one    two', 200, measure)).toEqual(['one two']);
  });

  it('never loses characters', () => {
    // The property that matters: text can move and words can be broken across
    // lines, but no character may disappear. Compared with whitespace removed,
    // since wrapping is entirely about where the whitespace goes.
    const text = 'Personal shopping for a client in Lagos, including delivery';
    const expected = text.replace(/\s/g, '');

    for (const width of [30, 50, 90, 130, 400]) {
      const produced = wrapText(text, width, measure).join('').replace(/\s/g, '');
      expect(produced, `width ${width}`).toBe(expected);
    }
  });

  it('never produces a line wider than the column', () => {
    const text = 'Personal shopping including a supercalifragilisticexpialidocious item';
    for (const width of [30, 50, 90, 400]) {
      for (const line of wrapText(text, width, measure)) {
        expect(measure(line), `width ${width}: "${line}"`).toBeLessThanOrEqual(width);
      }
    }
  });

  it('returns the text rather than looping forever on a zero width', () => {
    expect(wrapText('anything', 0, measure)).toEqual(['anything']);
  });

  it('handles an empty string', () => {
    expect(wrapText('', 100, measure)).toEqual(['']);
  });
});

describe('truncate', () => {
  it('leaves text that fits alone', () => {
    expect(truncate('short', 100, measure)).toBe('short');
  });

  it('shortens with an ellipsis that also fits', () => {
    const result = truncate('a very long description indeed', 100, measure);
    expect(measure(result)).toBeLessThanOrEqual(100);
    expect(result.endsWith('…')).toBe(true);
  });

  it('returns just an ellipsis when nothing fits', () => {
    expect(truncate('anything', 5, measure)).toBe('…');
  });
});

describe('linesThatFit', () => {
  it('divides the space', () => {
    expect(linesThatFit(100, 20)).toBe(5);
    expect(linesThatFit(95, 20)).toBe(4);
  });

  it('is zero when there is no room', () => {
    expect(linesThatFit(10, 20)).toBe(0);
    expect(linesThatFit(-5, 20)).toBe(0);
  });

  it('does not divide by zero', () => {
    expect(linesThatFit(100, 0)).toBe(0);
  });
});
