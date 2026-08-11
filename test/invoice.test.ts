import { describe, expect, it } from 'vitest';

import {
  discountOf,
  emptyItem,
  lineTotal,
  meaningfulItems,
  NO_TAX,
  subtotalOf,
  totalsOf,
  type LineItem,
  type TaxSettings,
} from '../src/lib/invoice';

const item = (description: string, quantity: number, unitPrice: number): LineItem => ({
  id: description,
  description,
  quantity,
  unitPrice,
});

const VAT: TaxSettings = { rate: 7.5, inclusive: false, label: 'VAT' };
const VAT_INCLUSIVE: TaxSettings = { rate: 7.5, inclusive: true, label: 'VAT' };

describe('lineTotal', () => {
  it('multiplies price by quantity', () => {
    expect(lineTotal(item('Gift box', 2, 4_500_000))).toBe(9_000_000);
  });

  it('rounds a fractional quantity once', () => {
    expect(lineTotal(item('Consulting', 2.5, 3000))).toBe(7500);
  });
});

describe('subtotalOf', () => {
  it('adds the lines', () => {
    expect(
      subtotalOf([item('Gift box', 1, 4_500_000), item('Balloon', 1, 3_500_000)]),
    ).toBe(8_000_000);
  });

  it('is zero for no lines', () => {
    expect(subtotalOf([])).toBe(0);
  });
});

describe('discountOf', () => {
  it('takes a percentage of the subtotal', () => {
    expect(discountOf(10_000_000, { kind: 'percent', percent: 10 })).toBe(1_000_000);
  });

  it('takes a fixed amount', () => {
    expect(discountOf(10_000_000, { kind: 'fixed', amount: 500_000 })).toBe(500_000);
  });

  it('never discounts more than the invoice is worth', () => {
    // A negative total is not a helpful way to report a typo.
    expect(discountOf(3_000_000, { kind: 'fixed', amount: 5_000_000 })).toBe(3_000_000);
  });

  it('ignores a negative discount', () => {
    expect(discountOf(3_000_000, { kind: 'fixed', amount: -100 })).toBe(0);
  });

  it('is zero when there is none', () => {
    expect(discountOf(10_000, { kind: 'none' })).toBe(0);
  });
});

describe('totalsOf', () => {
  const lines = [item('Gift box', 1, 4_500_000), item('Jewellery box', 1, 3_500_000)];

  it('adds tax on top when prices exclude it', () => {
    const totals = totalsOf(lines, VAT);
    expect(totals.subtotal).toBe(8_000_000);
    expect(totals.tax).toBe(600_000);
    expect(totals.total).toBe(8_600_000);
  });

  it('extracts tax from within the price when prices include it', () => {
    // The error people make here is taking 7.5% of the gross, which overstates
    // the tax by about 7%. The tax inside 10,000 is 10,000 − 10,000/1.075.
    const totals = totalsOf([item('Package', 1, 1_000_000)], VAT_INCLUSIVE);
    expect(totals.total).toBe(1_000_000);
    expect(totals.tax).toBe(69_767);
    expect(totals.tax).not.toBe(75_000);
  });

  it('never charges more than the price when tax is inclusive', () => {
    const totals = totalsOf(lines, VAT_INCLUSIVE);
    expect(totals.total).toBe(totals.subtotal);
  });

  it('applies the discount before tax', () => {
    // Tax is owed on what was charged, not on a price nobody paid.
    const totals = totalsOf(lines, VAT, { kind: 'percent', percent: 10 });
    expect(totals.discount).toBe(800_000);
    expect(totals.taxable).toBe(7_200_000);
    expect(totals.tax).toBe(540_000);
    expect(totals.total).toBe(7_740_000);
  });

  it('subtracts a deposit from the balance but not the total', () => {
    const totals = totalsOf(lines, NO_TAX, { kind: 'none' }, 3_000_000);
    expect(totals.total).toBe(8_000_000);
    expect(totals.balance).toBe(5_000_000);
  });

  it('shows an overpayment as a negative balance rather than hiding it', () => {
    const totals = totalsOf(lines, NO_TAX, { kind: 'none' }, 9_000_000);
    expect(totals.balance).toBe(-1_000_000);
  });

  it('handles no tax at all', () => {
    const totals = totalsOf(lines, NO_TAX);
    expect(totals.tax).toBe(0);
    expect(totals.total).toBe(8_000_000);
  });

  it('handles an empty invoice without producing nonsense', () => {
    const totals = totalsOf([], VAT);
    expect(totals).toEqual({
      subtotal: 0,
      discount: 0,
      taxable: 0,
      tax: 0,
      total: 0,
      balance: 0,
    });
  });

  it('keeps the printed lines adding up to the printed total', () => {
    // The invariant that actually matters: whatever rounding happens, a reader
    // adding the column by hand must reach the number at the bottom.
    const awkward = [
      item('Design', 3, 3_333),
      item('Hosting', 1.5, 1_999),
      item('Support', 0.25, 12_345),
    ];
    const totals = totalsOf(awkward, NO_TAX);
    expect(totals.subtotal).toBe(awkward.reduce((running, line) => running + lineTotal(line), 0));
    expect(totals.total).toBe(totals.subtotal);
  });
});

describe('meaningfulItems', () => {
  it('drops rows nobody filled in', () => {
    const rows = [item('Gift box', 1, 4_500_000), emptyItem('blank')];
    expect(meaningfulItems(rows)).toHaveLength(1);
  });

  it('keeps a line that has a price but no description yet', () => {
    // Half-typed is not the same as untouched, and silently dropping it loses
    // money from the invoice.
    expect(meaningfulItems([{ ...emptyItem('a'), unitPrice: 5000 }])).toHaveLength(1);
  });

  it('keeps a described line that is free', () => {
    expect(meaningfulItems([{ ...emptyItem('a'), description: 'Delivery' }])).toHaveLength(1);
  });
});
