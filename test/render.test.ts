import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { addDays } from '../src/lib/numbering';
import { renderInvoice, type InvoiceDocument } from '../src/lib/render';

/**
 * Renders a whole invoice, using amounts and names taken from a real Nigerian
 * gift-box business's sales record — naira, long descriptions, a fractional
 * quantity and a deposit. Set OUT to also write the file somewhere to look at.
 */
describe('renderInvoice', () => {
  it('produces a valid PDF with the content it was given', async () => {
    const doc: InvoiceDocument = {
      number: 'INV-2026-018',
      issued: new Date(2026, 1, 14),
      due: addDays(new Date(2026, 1, 14), 14),
      currency: 'NGN',
      title: 'Invoice',
      from: {
        name: 'Bloom & Box',
        details:
          'Gift boxes and surprise packages\n12 Adeola Odeku Street\nVictoria Island, Lagos\nhello@bloomandbox.ng · +234 801 234 5678',
      },
      to: {
        name: 'Mr. Sheyirotimi Adebayo',
        details: 'Icon Media Ltd\n7 Ozumba Mbadiwe Avenue\nVictoria Island, Lagos',
      },
      items: [
        {
          id: '1',
          description: "Valentine's package — premium bouquet, chocolate box and handwritten card",
          quantity: 1,
          unitPrice: 7_500_000,
        },
        { id: '2', description: 'Jewellery box', quantity: 2, unitPrice: 3_500_000 },
        { id: '3', description: 'Hot air balloon arrangement', quantity: 1, unitPrice: 3_500_000 },
        { id: '4', description: 'Personal shopping and sourcing', quantity: 2.5, unitPrice: 2_000_000 },
        { id: '5', description: 'Delivery within Lagos', quantity: 1, unitPrice: 500_000 },
      ],
      tax: { rate: 7.5, inclusive: false, label: 'VAT' },
      discount: { kind: 'percent', percent: 5 },
      deposit: 5_000_000,
      notes:
        'Thank you for your business. Items are prepared to order, so changes to the package contents need at least 48 hours notice.',
      payment:
        'Bank transfer — Bloom & Box Ltd\nGTBank · 0123456789\nPlease quote INV-2026-018 as the reference.',
    };

    const read = (path: string) => {
      const buffer = readFileSync(path);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    };

    const blob = await renderInvoice(doc, {
      regular: read('src/assets/inter-regular.ttf'),
      bold: read('src/assets/inter-semibold.ttf'),
    });

    const bytes = Buffer.from(await blob.arrayBuffer());
    if (process.env.OUT) writeFileSync(process.env.OUT, bytes);

    expect(blob.type).toBe('application/pdf');
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');

    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThanOrEqual(1);
    // The title is what a filing system shows, so it carries the reference.
    expect(parsed.getTitle()).toBe('Invoice INV-2026-018');
  });

  it('renders an empty invoice rather than throwing', async () => {
    // The preview renders while someone is still typing, so every intermediate
    // state has to survive being drawn.
    const read = (path: string) => {
      const buffer = readFileSync(path);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    };

    const blob = await renderInvoice(
      {
        number: 'INV-001',
        issued: new Date(2026, 0, 1),
        due: null,
        currency: 'NGN',
        title: 'Invoice',
        from: { name: '', details: '' },
        to: { name: '', details: '' },
        items: [],
        tax: { rate: 0, inclusive: false, label: 'VAT' },
        discount: { kind: 'none' },
        deposit: 0,
        notes: '',
        payment: '',
      },
      { regular: read('src/assets/inter-regular.ttf'), bold: read('src/assets/inter-semibold.ttf') },
    );

    const bytes = Buffer.from(await blob.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('starts a new page rather than running off the bottom', async () => {
    const read = (path: string) => {
      const buffer = readFileSync(path);
      return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    };

    const many = Array.from({ length: 60 }, (_, index) => ({
      id: String(index),
      description: `Gift box number ${index + 1} with a description long enough to wrap onto a second line`,
      quantity: 1,
      unitPrice: 4_500_000,
    }));

    const blob = await renderInvoice(
      {
        number: 'INV-002',
        issued: new Date(2026, 0, 1),
        due: null,
        currency: 'NGN',
        title: 'Invoice',
        from: { name: 'Bloom & Box', details: '' },
        to: { name: 'A long client list', details: '' },
        items: many,
        tax: { rate: 7.5, inclusive: false, label: 'VAT' },
        discount: { kind: 'none' },
        deposit: 0,
        notes: '',
        payment: '',
      },
      { regular: read('src/assets/inter-regular.ttf'), bold: read('src/assets/inter-semibold.ttf') },
    );

    const parsed = await PDFDocument.load(Buffer.from(await blob.arrayBuffer()));
    expect(parsed.getPageCount()).toBeGreaterThan(1);
  });
});
