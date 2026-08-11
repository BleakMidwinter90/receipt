/**
 * The embedded fonts, fetched once and only when needed.
 *
 * Kept out of the preview component so that file exports components and
 * nothing else — and so the download path can load them without importing any
 * UI.
 *
 * 220 kB is not something to spend on someone who opened the page to look, so
 * this runs the first time a PDF is actually drawn.
 */

let cache: { regular: ArrayBuffer; bold: ArrayBuffer } | null = null;

export async function loadFonts(): Promise<{ regular: ArrayBuffer; bold: ArrayBuffer }> {
  if (cache) return cache;

  const [regularUrl, boldUrl] = await Promise.all([
    import('../assets/inter-regular.ttf?url'),
    import('../assets/inter-semibold.ttf?url'),
  ]);

  const [regular, bold] = await Promise.all([
    fetch(regularUrl.default).then((response) => response.arrayBuffer()),
    fetch(boldUrl.default).then((response) => response.arrayBuffer()),
  ]);

  cache = { regular, bold };
  return cache;
}
