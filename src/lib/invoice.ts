/**
 * What an invoice adds up to.
 *
 * Kept entirely separate from how it is drawn, because this is the part that
 * has to be right. The order of operations is not a detail: discount before tax
 * or after it changes what is owed, and tax-inclusive pricing changes what the
 * line prices themselves mean.
 */

import { multiply, percentOf, roundHalfUp, sum } from './money';

export interface LineItem {
  id: string;
  description: string;
  /** May be fractional — 2.5 hours, 1.5 kg. */
  quantity: number;
  /** Minor units. */
  unitPrice: number;
}

/** A discount is either a percentage of the subtotal or a flat amount. */
export type Discount =
  | { kind: 'none' }
  | { kind: 'percent'; percent: number }
  | { kind: 'fixed'; amount: number };

export interface TaxSettings {
  /** Percentage, e.g. 7.5 for Nigerian VAT. */
  rate: number;
  /**
   * Whether the line prices already include the tax.
   *
   * Common outside the US, and the difference is not cosmetic: at 7.5%, a
   * ₦10,000 line is either ₦10,750 owed or ₦10,000 owed with ₦697.67 of it
   * being tax.
   */
  inclusive: boolean;
  label: string;
}

export interface Totals {
  /** Sum of the lines, before anything is applied. */
  subtotal: number;
  discount: number;
  /** What the tax is calculated on. */
  taxable: number;
  tax: number;
  total: number;
  /** What is still owed after any deposit already paid. */
  balance: number;
}

/** One line's own total, rounded once so the column adds up to the footer. */
export function lineTotal(item: LineItem): number {
  return multiply(item.unitPrice, item.quantity);
}

export function subtotalOf(items: readonly LineItem[]): number {
  return sum(items.map(lineTotal));
}

/**
 * Work out the discount in money.
 *
 * A fixed discount is capped at the subtotal: a ₦50,000 discount on a ₦30,000
 * invoice is a mistake, and printing a negative total is not a helpful way to
 * tell someone about it.
 */
export function discountOf(subtotal: number, discount: Discount): number {
  if (discount.kind === 'none') return 0;
  if (discount.kind === 'percent') return percentOf(subtotal, discount.percent);
  return Math.min(Math.max(discount.amount, 0), Math.max(subtotal, 0));
}

/**
 * Add everything up.
 *
 * Discount comes off before tax, which is the ordinary treatment: tax is owed on
 * what was actually charged, not on a price nobody paid.
 */
export function totalsOf(
  items: readonly LineItem[],
  tax: TaxSettings,
  discount: Discount = { kind: 'none' },
  deposit = 0,
): Totals {
  const subtotal = subtotalOf(items);
  const discounted = discountOf(subtotal, discount);
  const taxable = subtotal - discounted;

  if (tax.rate <= 0) {
    return { subtotal, discount: discounted, taxable, tax: 0, total: taxable, balance: taxable - deposit };
  }

  if (tax.inclusive) {
    /*
     * The prices already contain the tax, so it is extracted rather than added.
     *
     * At 7.5%, the tax inside ₦10,000 is 10,000 − (10,000 ÷ 1.075), not 7.5% of
     * 10,000 — using the latter overstates it by about 7%, which is the error
     * people actually make here.
     */
    const net = roundHalfUp(taxable / (1 + tax.rate / 100));
    return {
      subtotal,
      discount: discounted,
      taxable,
      tax: taxable - net,
      total: taxable,
      balance: taxable - deposit,
    };
  }

  const taxAmount = percentOf(taxable, tax.rate);
  const total = taxable + taxAmount;
  return { subtotal, discount: discounted, taxable, tax: taxAmount, total, balance: total - deposit };
}

export const NO_TAX: TaxSettings = { rate: 0, inclusive: false, label: 'Tax' };

/** A blank line, ready to type into. */
export function emptyItem(id: string): LineItem {
  return { id, description: '', quantity: 1, unitPrice: 0 };
}

/** Lines worth printing — a blank row someone tabbed past is not a line. */
export function meaningfulItems(items: readonly LineItem[]): LineItem[] {
  return items.filter((item) => item.description.trim() !== '' || item.unitPrice !== 0);
}
