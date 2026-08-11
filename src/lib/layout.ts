/**
 * Text layout, without a PDF in sight.
 *
 * Wrapping takes a `measure` function rather than a font, so the awkward parts —
 * a word longer than the column, a description someone pasted with no spaces in
 * it, a line that must not silently vanish — can be tested without rendering
 * anything.
 */

/** Measures a string at the size it will be drawn. */
export type Measure = (text: string) => number;

/**
 * Break text into lines that fit within `maxWidth`.
 *
 * A single word too long for the column is broken rather than allowed to run
 * off the edge — an item description like a URL or a part number is common, and
 * an invoice with text disappearing past the margin is not usable.
 */
export function wrapText(text: string, maxWidth: number, measure: Measure): string[] {
  if (maxWidth <= 0) return [text];

  const lines: string[] = [];

  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }

    let current = '';

    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = current === '' ? word : `${current} ${word}`;

      if (measure(candidate) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current !== '') {
        lines.push(current);
        current = '';
      }

      // The word alone still may not fit.
      if (measure(word) <= maxWidth) {
        current = word;
        continue;
      }

      const pieces = breakWord(word, maxWidth, measure);
      lines.push(...pieces.slice(0, -1));
      current = pieces[pieces.length - 1];
    }

    lines.push(current);
  }

  return lines;
}

/** Split an over-long word into chunks that fit. */
function breakWord(word: string, maxWidth: number, measure: Measure): string[] {
  const pieces: string[] = [];
  let current = '';

  for (const character of word) {
    const candidate = current + character;
    if (current !== '' && measure(candidate) > maxWidth) {
      pieces.push(current);
      current = character;
    } else {
      current = candidate;
    }
  }

  pieces.push(current);
  return pieces;
}

/**
 * Shorten to fit on one line, with an ellipsis.
 *
 * Used where wrapping would break a layout — a column header, a filename — and
 * never for anything a reader needs in full, such as an amount.
 */
export function truncate(text: string, maxWidth: number, measure: Measure): string {
  if (measure(text) <= maxWidth) return text;

  const ellipsis = '…';
  let result = '';

  for (const character of text) {
    if (measure(result + character + ellipsis) > maxWidth) break;
    result += character;
  }

  return result === '' ? ellipsis : result + ellipsis;
}

/**
 * How many lines of text fit in a height.
 *
 * Used to decide whether a table row still fits on the page before drawing it,
 * rather than discovering halfway down that it does not.
 */
export function linesThatFit(height: number, lineHeight: number): number {
  if (lineHeight <= 0) return 0;
  return Math.max(0, Math.floor(height / lineHeight));
}
