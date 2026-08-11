/**
 * Cut Inter down to what an invoice actually prints.
 *
 * The full family is about 800 kB across two weights, which is a lot to ship so
 * that someone can put a naira sign on a PDF. Subsetting to Latin plus the
 * currency symbols brings it to a few tens of kilobytes.
 *
 * Run when the font is updated:  node scripts/subset-fonts.mjs <path-to-ttf-dir>
 * The results are committed, so a normal build and a clone need neither this
 * script nor the original font files.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import subsetFont from 'subset-font';

const source = process.argv[2];
if (!source) {
  console.error('usage: node scripts/subset-fonts.mjs <directory containing Inter-*.ttf>');
  process.exit(1);
}

/** Everything an invoice can print. */
function characters() {
  const set = new Set();

  // Printable ASCII.
  for (let code = 0x20; code <= 0x7e; code++) set.add(String.fromCodePoint(code));
  // Latin-1 supplement, for accented names and £ ¥ ¢ §.
  for (let code = 0xa0; code <= 0xff; code++) set.add(String.fromCodePoint(code));
  // Latin Extended-A, for the rest of European name spelling.
  for (let code = 0x100; code <= 0x17f; code++) set.add(String.fromCodePoint(code));

  // Typography an invoice genuinely uses.
  for (const character of '‘’“”–—…•·→') set.add(character);

  // Currency symbols, which is the entire reason for embedding a font at all:
  // WinAnsi cannot encode ₦, so a naira invoice is impossible without this.
  for (const character of '₦₹₵₽¥€£$₴₺₩₪₫₡₱฿') set.add(character);

  return [...set].join('');
}

const text = characters();

for (const [weight, file] of [
  ['regular', 'Inter-Regular.ttf'],
  ['semibold', 'Inter-SemiBold.ttf'],
]) {
  const original = await readFile(join(source, file));
  const subset = await subsetFont(original, text, { targetFormat: 'truetype' });

  const target = new URL(`../src/assets/inter-${weight}.ttf`, import.meta.url);
  await writeFile(target, subset);

  const percent = ((subset.length / original.length) * 100).toFixed(1);
  console.log(
    `${file}: ${(original.length / 1024).toFixed(0)} kB -> ${(subset.length / 1024).toFixed(0)} kB (${percent}%)`,
  );
}
