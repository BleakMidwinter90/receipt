/**
 * End-to-end smoke test, run against a real browser.
 *
 *   npm run smoke
 *
 * The unit tests cover the arithmetic. This covers what they cannot: that
 * typing into the real form produces a real PDF with the right numbers in it.
 *
 * One thing worth knowing before reading the preview checks: headless Chromium
 * has no PDF viewer, so an embedded PDF renders as an empty frame. That is a
 * property of the browser, not the app — confirmed by fetching the blob and
 * parsing it — so these checks read the bytes rather than looking at the frame.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { PDFDocument, PDFName } from 'pdf-lib';

const DIST = fileURLToPath(new URL('../dist/', import.meta.url));
const PORT = 4184;

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
};

const server = createServer(async (request, response) => {
  const path = request.url === '/' ? '/index.html' : request.url.split('?')[0];
  try {
    const body = await readFile(join(DIST, path));
    const type = MIME[extname(path)];
    if (!type) console.warn(`  no content type for ${extname(path)} (${path}) — add it to MIME`);
    response.writeHead(200, { 'Content-Type': type ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404).end('not found');
  }
});
await new Promise((resolve) => server.listen(PORT, resolve));

const failures = [];
const check = (label, condition, detail = '') => {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  if (!condition) failures.push(label);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));

await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'networkidle' });
check('page loads', (await page.locator('h1').innerText()).includes('receipt'));

/* Fill it in the way someone actually would, with grouped thousands. */
await page.fill('#business-name', 'Bloom & Box');
await page.fill('#business-details', '12 Adeola Odeku Street\nVictoria Island, Lagos');
await page.fill('#client-name', 'Mr. Sheyirotimi');
await page.fill('#description-line-1', "Valentine's package — bouquet and chocolate box");
await page.fill('#price-line-1', '75,000');

await page.click('text=+ Add a line');
await page.fill('#description-line-2', 'Jewellery box');
await page.fill('#quantity-line-2', '2');
await page.fill('#price-line-2', '35,000');

// The line total proves the grouped-thousands parse survived the round trip.
const secondRow = await page.locator('li').nth(1).innerText();
check('a grouped amount is understood', /70,000\.00/.test(secondRow), secondRow.replace(/\n/g, ' | '));

await page.fill('#tax-rate', '7.5');
await page.fill('#deposit', '50,000');
await page.waitForTimeout(1200);

const summary = await page.locator('dl').innerText();
check('subtotal adds the lines', /145,000\.00/.test(summary), summary.replace(/\n/g, ' | '));
// 145,000 + 7.5% = 155,875; less the 50,000 already paid = 105,875.
check('tax is added on top', /10,875\.00/.test(summary));
check('total includes tax', /155,875\.00/.test(summary));
check('balance subtracts what was paid', /105,875\.00/.test(summary));

/*
 * The preview must be the real file.
 *
 * Its bytes are fetched and parsed rather than looked at, because headless
 * Chromium cannot display a PDF at all — a frame that looks empty here is
 * expected, and a frame that looks full would prove nothing either.
 */
const previewSrc = await page
  .locator('iframe[title="Invoice preview"]')
  .getAttribute('src')
  .catch(() => null);

check('the preview produced a document', Boolean(previewSrc));

if (previewSrc) {
  const previewBytes = Buffer.from(
    await page.evaluate(async (url) => {
      const buffer = await (await fetch(url.split('#')[0])).arrayBuffer();
      return Array.from(new Uint8Array(buffer));
    }, previewSrc),
  );

  check('the preview really is a PDF', previewBytes.subarray(0, 5).toString() === '%PDF-');
  const previewDoc = await PDFDocument.load(previewBytes);
  check('and carries the reference in its title', previewDoc.getTitle()?.includes('INV-') === true, previewDoc.getTitle() ?? '');
}

/* The download is the thing being sold, so it is checked on its own. */
const downloading = page.waitForEvent('download', { timeout: 30_000 });
await page.getByRole('button', { name: /Download PDF/ }).click();
const download = await downloading.catch(() => null);

if (download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const bytes = Buffer.concat(chunks);

  check('the download is a PDF', bytes.subarray(0, 5).toString() === '%PDF-');
  check('named after the document', /INV-/.test(download.suggestedFilename()), download.suggestedFilename());

  const doc = await PDFDocument.load(bytes);
  check('with at least one page', doc.getPageCount() >= 1);

  /*
   * A font must genuinely be embedded, because that is the only way ₦ can be
   * drawn — the standard PDF fonts cannot encode it.
   *
   * The document objects are walked rather than the raw bytes searched: pdf-lib
   * writes compressed object streams, so grepping the file finds nothing even
   * when the font is there. That version of this check failed against a
   * perfectly good PDF.
   */
  let embeddedFonts = 0;
  const fontNames = [];
  for (const [, object] of doc.context.enumerateIndirectObjects()) {
    const dict = object?.dict;
    if (!dict) continue;
    if (dict.get(PDFName.of('FontFile2'))) embeddedFonts += 1;
    const base = dict.get(PDFName.of('BaseFont'));
    if (base) fontNames.push(String(base));
  }

  check('a font is embedded rather than falling back', embeddedFonts > 0, [...new Set(fontNames)].join(', '));
  check('and it is the one that can draw ₦', fontNames.some((name) => name.includes('Inter')));
} else {
  check('the download is a PDF', false, 'no download appeared');
}

/* Business details are meant to survive a reload; a client list is the point. */
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(600);
check(
  'the business details were remembered',
  (await page.inputValue('#business-name')) === 'Bloom & Box',
  await page.inputValue('#business-name'),
);
check(
  'the invoice number moved on after sending one',
  (await page.inputValue('#number')) !== 'INV-2026-001',
  await page.inputValue('#number'),
);
const savedClients = await page.locator('select[aria-label="Use a saved client"]').count();
check('the client was saved for next time', savedClients > 0);

check('no uncaught page errors', pageErrors.length === 0, pageErrors.join('; '));

await browser.close();
server.close();

console.log(
  `\n${failures.length === 0 ? 'all checks passed' : `${failures.length} FAILED: ${failures.join(', ')}`}`,
);
process.exit(failures.length === 0 ? 0 : 1);
