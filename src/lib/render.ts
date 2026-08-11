/**
 * Drawing the invoice.
 *
 * Everything here is layout; the arithmetic lives in `invoice.ts` and the
 * wrapping in `layout.ts`, so this file can be read as "where things go" and
 * nothing else.
 *
 * The design is deliberately plain. An invoice is read by someone deciding
 * whether to pay it and by an accountant filing it, and both want the number,
 * the reference and the due date found without effort. Anything decorative
 * competes with that.
 */

import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import { formatAmount } from './money';
import { lineTotal, meaningfulItems, totalsOf, type Discount, type LineItem, type TaxSettings } from './invoice';
import { formatDate } from './numbering';
import { wrapText } from './layout';

export interface Party {
  name: string;
  /** Free text — address, tax id, email, whatever belongs under the name. */
  details: string;
}

export interface InvoiceDocument {
  number: string;
  issued: Date;
  due: Date | null;
  currency: string;
  from: Party;
  to: Party;
  items: LineItem[];
  tax: TaxSettings;
  discount: Discount;
  /** Already paid, in minor units. */
  deposit: number;
  notes: string;
  /** Bank details, payment link, whatever tells someone how to pay. */
  payment: string;
  /** Heading — "Invoice", "Receipt", "Quote". */
  title: string;
}

/* A4 in points, which is what PDF measures in. */
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = 48;
const CONTENT = PAGE.width - MARGIN * 2;

const INK = rgb(0.09, 0.09, 0.1);
const MUTED = rgb(0.45, 0.46, 0.48);
const LINE = rgb(0.85, 0.86, 0.87);
const ACCENT = rgb(0.06, 0.36, 0.53);

/** Column geometry for the items table, as fractions of the content width. */
const COLUMNS = {
  description: 0.5,
  quantity: 0.12,
  unitPrice: 0.19,
  amount: 0.19,
};

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/** A cursor that knows how to start a new page when it runs out of room. */
class Sheet {
  page: PDFPage;
  y: number;
  readonly fonts: Fonts;
  private readonly doc: PDFDocument;

  constructor(doc: PDFDocument, fonts: Fonts) {
    this.doc = doc;
    this.fonts = fonts;
    this.page = doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN;
  }

  /** Ensure `needed` points remain, starting a page if not. */
  reserve(needed: number): boolean {
    if (this.y - needed >= MARGIN + 40) return false;
    this.page = this.doc.addPage([PAGE.width, PAGE.height]);
    this.y = PAGE.height - MARGIN;
    return true;
  }

  text(
    value: string,
    options: { x?: number; size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; align?: 'left' | 'right' } = {},
  ) {
    const size = options.size ?? 10;
    const font = options.bold ? this.fonts.bold : this.fonts.regular;
    const width = font.widthOfTextAtSize(value, size);
    const x = options.align === 'right' ? (options.x ?? PAGE.width - MARGIN) - width : options.x ?? MARGIN;

    this.page.drawText(value, { x, y: this.y, size, font, color: options.color ?? INK });
  }

  rule(color = LINE) {
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE.width - MARGIN, y: this.y },
      thickness: 0.75,
      color,
    });
  }

  down(amount: number) {
    this.y -= amount;
  }
}

/** Draw a block of wrapped text, returning the height used. */
function paragraph(
  sheet: Sheet,
  text: string,
  options: { x: number; width: number; size?: number; color?: ReturnType<typeof rgb>; bold?: boolean },
): number {
  const size = options.size ?? 9.5;
  const font = options.bold ? sheet.fonts.bold : sheet.fonts.regular;

  const lines = wrapText(text, options.width, (value) => font.widthOfTextAtSize(value, size));

  const lineHeight = size * 1.45;
  for (const line of lines) {
    sheet.text(line, { x: options.x, size, color: options.color, bold: options.bold });
    sheet.down(lineHeight);
  }

  return lines.length * lineHeight;
}

/**
 * Build the PDF.
 *
 * Fonts arrive as bytes rather than being fetched here, so the caller decides
 * when to pay for them — they are only needed at the moment someone asks for a
 * PDF, and loading them earlier would be a download nobody asked for.
 */
export async function renderInvoice(
  invoice: InvoiceDocument,
  fontBytes: { regular: ArrayBuffer; bold: ArrayBuffer },
  logo?: { bytes: ArrayBuffer; type: string } | null,
): Promise<Blob> {
  const doc = await PDFDocument.create();

  const fontkit = (await import('@pdf-lib/fontkit')).default;
  doc.registerFontkit(fontkit);

  const regular = await doc.embedFont(fontBytes.regular, { subset: true });
  const bold = await doc.embedFont(fontBytes.bold, { subset: true });

  doc.setTitle(`${invoice.title} ${invoice.number}`);
  doc.setCreator('receipt');
  doc.setProducer('receipt');

  const sheet = new Sheet(doc, { regular, bold });
  const currency = invoice.currency;
  const items = meaningfulItems(invoice.items);
  const totals = totalsOf(items, invoice.tax, invoice.discount, invoice.deposit);

  await drawHeader(sheet, invoice, logo, doc);
  drawParties(sheet, invoice);
  drawTable(sheet, items, currency);
  drawTotals(sheet, totals, invoice, currency);
  drawFooter(sheet, invoice);

  const bytes = await doc.save();
  return new Blob([bytes as BlobPart], { type: 'application/pdf' });
}

async function drawHeader(
  sheet: Sheet,
  invoice: InvoiceDocument,
  logo: { bytes: ArrayBuffer; type: string } | null | undefined,
  doc: PDFDocument,
) {
  const top = sheet.y;

  // Right side first: the title and reference block, which is what someone
  // filing this looks for.
  sheet.y = top;
  sheet.text(invoice.title.toUpperCase(), {
    align: 'right',
    size: 22,
    bold: true,
    color: ACCENT,
  });
  sheet.down(24);

  const meta: Array<[string, string]> = [['Number', invoice.number], ['Issued', formatDate(invoice.issued)]];
  if (invoice.due) meta.push(['Due', formatDate(invoice.due)]);

  for (const [label, value] of meta) {
    sheet.text(label, { align: 'right', x: PAGE.width - MARGIN - 110, size: 9, color: MUTED });
    sheet.text(value, { align: 'right', size: 9.5, bold: label === 'Due' });
    sheet.down(14);
  }

  const rightBottom = sheet.y;

  // Left side: who is sending it.
  sheet.y = top;

  if (logo) {
    try {
      const image = /png/i.test(logo.type)
        ? await doc.embedPng(logo.bytes)
        : await doc.embedJpg(logo.bytes);
      const height = 40;
      const width = (image.width / image.height) * height;
      sheet.page.drawImage(image, { x: MARGIN, y: sheet.y - height + 10, width, height });
      sheet.down(height + 8);
    } catch {
      // A logo that will not decode must not stop the invoice being produced.
    }
  }

  sheet.text(invoice.from.name || 'Your business', { size: 15, bold: true });
  sheet.down(17);

  if (invoice.from.details.trim()) {
    paragraph(sheet, invoice.from.details, { x: MARGIN, width: CONTENT * 0.45, color: MUTED });
  }

  sheet.y = Math.min(sheet.y, rightBottom) - 18;
  sheet.rule();
  sheet.down(24);
}

function drawParties(sheet: Sheet, invoice: InvoiceDocument) {
  sheet.text('Billed to', { size: 8.5, color: MUTED });
  sheet.down(15);
  sheet.text(invoice.to.name || '—', { size: 11.5, bold: true });
  sheet.down(15);

  if (invoice.to.details.trim()) {
    paragraph(sheet, invoice.to.details, { x: MARGIN, width: CONTENT * 0.55, color: MUTED });
  }

  sheet.down(14);
}

function columnX() {
  const description = MARGIN;
  const quantity = MARGIN + CONTENT * COLUMNS.description;
  const unitPrice = quantity + CONTENT * COLUMNS.quantity;
  const amount = PAGE.width - MARGIN;
  return { description, quantity, unitPrice, amount };
}

function drawTableHead(sheet: Sheet, currency: string) {
  const x = columnX();

  sheet.text('Description', { x: x.description, size: 8.5, color: MUTED });
  sheet.text('Qty', { x: x.quantity + CONTENT * COLUMNS.quantity, align: 'right', size: 8.5, color: MUTED });
  sheet.text('Unit price', {
    x: x.unitPrice + CONTENT * COLUMNS.unitPrice,
    align: 'right',
    size: 8.5,
    color: MUTED,
  });
  sheet.text(`Amount (${currency})`, { x: x.amount, align: 'right', size: 8.5, color: MUTED });

  sheet.down(8);
  sheet.rule();
  sheet.down(16);
}

function drawTable(sheet: Sheet, items: readonly LineItem[], currency: string) {
  drawTableHead(sheet, currency);
  const x = columnX();
  const descriptionWidth = CONTENT * COLUMNS.description - 12;

  for (const item of items) {
    const lines = wrapText(item.description || '—', descriptionWidth, (value) =>
      sheet.fonts.regular.widthOfTextAtSize(value, 10),
    );
    const height = Math.max(lines.length * 14, 18);

    // Decide before drawing, so a row is never split across a page break.
    if (sheet.reserve(height + 12)) drawTableHead(sheet, currency);

    const rowTop = sheet.y;

    for (const line of lines) {
      sheet.text(line, { x: x.description, size: 10 });
      sheet.down(14);
    }

    sheet.y = rowTop;
    sheet.text(formatQuantity(item.quantity), {
      x: x.quantity + CONTENT * COLUMNS.quantity,
      align: 'right',
      size: 10,
      color: MUTED,
    });
    sheet.text(formatAmount(item.unitPrice, currency, { symbol: false }), {
      x: x.unitPrice + CONTENT * COLUMNS.unitPrice,
      align: 'right',
      size: 10,
      color: MUTED,
    });
    sheet.text(formatAmount(lineTotal(item), currency, { symbol: false }), {
      x: x.amount,
      align: 'right',
      size: 10,
    });

    sheet.y = rowTop - height;
    sheet.down(6);
    sheet.rule(rgb(0.93, 0.93, 0.94));
    sheet.down(14);
  }

  if (items.length === 0) {
    sheet.text('No items yet', { size: 10, color: MUTED });
    sheet.down(20);
  }
}

/** Whole numbers print plainly; fractions keep only what they need. */
function formatQuantity(quantity: number): string {
  if (Number.isInteger(quantity)) return String(quantity);
  return String(Number(quantity.toFixed(3)));
}

function drawTotals(
  sheet: Sheet,
  totals: ReturnType<typeof totalsOf>,
  invoice: InvoiceDocument,
  currency: string,
) {
  sheet.reserve(140);
  sheet.down(6);

  const labelX = PAGE.width - MARGIN - 150;

  const row = (label: string, value: string, options: { bold?: boolean; color?: ReturnType<typeof rgb> } = {}) => {
    sheet.text(label, { x: labelX, size: 9.5, color: options.color ?? MUTED });
    sheet.text(value, { align: 'right', size: 9.5, bold: options.bold, color: options.color });
    sheet.down(16);
  };

  row('Subtotal', formatAmount(totals.subtotal, currency, { symbol: false }));

  if (totals.discount > 0) {
    row('Discount', `-${formatAmount(totals.discount, currency, { symbol: false })}`);
  }

  if (invoice.tax.rate > 0) {
    const label = `${invoice.tax.label} ${invoice.tax.rate}%${invoice.tax.inclusive ? ' (included)' : ''}`;
    row(label, formatAmount(totals.tax, currency, { symbol: false }));
  }

  sheet.down(2);
  sheet.page.drawLine({
    start: { x: labelX, y: sheet.y + 8 },
    end: { x: PAGE.width - MARGIN, y: sheet.y + 8 },
    thickness: 0.75,
    color: LINE,
  });
  sheet.down(6);

  row('Total', formatAmount(totals.total, currency), { bold: true, color: INK });

  if (invoice.deposit !== 0) {
    row('Paid', `-${formatAmount(invoice.deposit, currency, { symbol: false })}`);
    row('Balance due', formatAmount(totals.balance, currency), { bold: true, color: ACCENT });
  }

  sheet.down(10);
}

function drawFooter(sheet: Sheet, invoice: InvoiceDocument) {
  const blocks: Array<[string, string]> = [];
  if (invoice.payment.trim()) blocks.push(['How to pay', invoice.payment]);
  if (invoice.notes.trim()) blocks.push(['Notes', invoice.notes]);

  if (blocks.length === 0) return;

  sheet.reserve(120);
  sheet.down(10);
  sheet.rule();
  sheet.down(20);

  for (const [heading, body] of blocks) {
    sheet.reserve(60);
    sheet.text(heading, { size: 8.5, color: MUTED });
    sheet.down(15);
    paragraph(sheet, body, { x: MARGIN, width: CONTENT * 0.7, size: 9.5 });
    sheet.down(10);
  }
}

/** Used by the preview, so the on-screen figure and the PDF cannot disagree. */
export function summarise(invoice: InvoiceDocument) {
  const items = meaningfulItems(invoice.items);
  return totalsOf(items, invoice.tax, invoice.discount, invoice.deposit);
}

