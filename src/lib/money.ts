/**
 * Money, as integers.
 *
 * Every amount here is a whole number of minor units — kobo, cents, pence — and
 * never a float. `0.1 + 0.2` is `0.30000000000000004`, and an invoice that is
 * out by a hundredth is an invoice someone has to argue about. Multiplication
 * and percentages round exactly once, at the point where a real amount has to
 * exist, rather than accumulating error across a column.
 *
 * Not every currency has two decimal places, which is the detail that catches
 * people out: ¥1000 is a thousand yen, not ten. The exponent lives in the
 * currency table so nothing has to assume.
 */

export interface Currency {
  code: string;
  symbol: string;
  /** Decimal places. 0 for yen, 2 for most, 3 for dinar. */
  exponent: number;
  name: string;
}

export const CURRENCIES: Record<string, Currency> = {
  NGN: { code: 'NGN', symbol: '₦', exponent: 2, name: 'Nigerian naira' },
  USD: { code: 'USD', symbol: '$', exponent: 2, name: 'US dollar' },
  EUR: { code: 'EUR', symbol: '€', exponent: 2, name: 'Euro' },
  GBP: { code: 'GBP', symbol: '£', exponent: 2, name: 'Pound sterling' },
  CAD: { code: 'CAD', symbol: 'CA$', exponent: 2, name: 'Canadian dollar' },
  AUD: { code: 'AUD', symbol: 'A$', exponent: 2, name: 'Australian dollar' },
  INR: { code: 'INR', symbol: '₹', exponent: 2, name: 'Indian rupee' },
  ZAR: { code: 'ZAR', symbol: 'R', exponent: 2, name: 'South African rand' },
  KES: { code: 'KES', symbol: 'KSh', exponent: 2, name: 'Kenyan shilling' },
  GHS: { code: 'GHS', symbol: 'GH₵', exponent: 2, name: 'Ghanaian cedi' },
  JPY: { code: 'JPY', symbol: '¥', exponent: 0, name: 'Japanese yen' },
};

export const DEFAULT_CURRENCY = 'NGN';

export function currencyOf(code: string): Currency {
  return CURRENCIES[code] ?? CURRENCIES[DEFAULT_CURRENCY];
}

/** 10^exponent, as an integer. */
function scale(currency: Currency): number {
  return 10 ** currency.exponent;
}

/**
 * Parse what someone typed into minor units.
 *
 * Deliberately forgiving about how people actually write amounts: `45,000`,
 * `₦45 000`, `45000.50`, `(45)` for negative. Returns `null` rather than 0 for
 * anything it cannot read, because silently treating "abou 45k" as zero is how
 * an invoice goes out with a missing line.
 */
export function parseAmount(input: string, code: string): number | null {
  const currency = currencyOf(code);

  let text = input.trim();
  if (text === '') return null;

  // Accountants write negatives in brackets.
  let sign = 1;
  if (/^\(.*\)$/.test(text)) {
    sign = -1;
    text = text.slice(1, -1);
  }

  /*
   * Strip currency markers, then refuse anything with words left in it.
   *
   * Removing every non-digit was too eager: "about 45k" quietly became 45, and
   * a line worth ₦45 instead of nothing is far worse than a visible error. Only
   * recognised markers come off — symbols, ISO codes, and the bare "N" people
   * write next to naira amounts, as in the sales records this was built from.
   */
  for (const currencyEntry of Object.values(CURRENCIES)) {
    text = text.split(currencyEntry.symbol).join(' ');
  }
  text = text.replace(new RegExp(`\\b(${Object.keys(CURRENCIES).join('|')}|N)\\b`, 'gi'), ' ');

  if (/[a-z]/i.test(text)) return null;

  // Spaces are used as thousands separators; everything else must be numeric.
  text = text.replace(/\s/g, '');
  if (text.startsWith('-')) {
    sign *= -1;
    text = text.slice(1);
  }
  if (text === '' || !/^[\d.,]+$/.test(text)) return null;

  const decimal = lastDecimalSeparator(text);
  let whole = text;
  let fraction = '';

  if (decimal >= 0) {
    whole = text.slice(0, decimal);
    fraction = text.slice(decimal + 1);
  }

  whole = whole.replace(/[.,]/g, '');
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(fraction)) return null;
  if (whole === '' && fraction === '') return null;

  const units = whole === '' ? 0 : Number(whole);

  // Pad or round the fraction to the currency's precision.
  const padded = (fraction + '0'.repeat(currency.exponent)).slice(0, currency.exponent);
  const minor = padded === '' ? 0 : Number(padded);

  // A third decimal on a two-decimal currency rounds rather than truncating.
  const extra = fraction.slice(currency.exponent);
  const roundUp = extra !== '' && Number(extra[0]) >= 5 ? 1 : 0;

  const total = units * scale(currency) + minor + roundUp;
  return Number.isFinite(total) ? sign * total : null;
}

/**
 * Which separator is the decimal point.
 *
 * `1,234.56` and `1.234,56` are the same number written by different halves of
 * the world, so the last separator wins — unless it is followed by exactly three
 * digits and there is no other separator, in which case `45,000` is far more
 * likely to be forty-five thousand than forty-five point something.
 */
function lastDecimalSeparator(text: string): number {
  const lastComma = text.lastIndexOf(',');
  const lastDot = text.lastIndexOf('.');
  const last = Math.max(lastComma, lastDot);
  if (last < 0) return -1;

  const trailing = text.length - last - 1;
  const onlyOne = (lastComma < 0) !== (lastDot < 0);

  if (onlyOne && trailing === 3) return -1;
  return last;
}

/** Format minor units for display, with thousands separators. */
export function formatAmount(minor: number, code: string, options: { symbol?: boolean } = {}): string {
  const currency = currencyOf(code);
  const negative = minor < 0;
  const absolute = Math.abs(minor);

  const units = Math.floor(absolute / scale(currency));
  const fraction = absolute % scale(currency);

  const grouped = units.toLocaleString('en-US');
  const decimals =
    currency.exponent > 0 ? `.${String(fraction).padStart(currency.exponent, '0')}` : '';

  const symbol = options.symbol === false ? '' : currency.symbol;
  return `${negative ? '-' : ''}${symbol}${grouped}${decimals}`;
}

/**
 * Multiply an amount by a quantity, rounding once.
 *
 * Quantities can be fractional — 2.5 hours, 1.5 kg — so the product usually is
 * not a whole number of minor units. Rounding here, rather than letting the
 * fraction travel into the total, is what keeps a column of lines adding up to
 * the number printed at the bottom.
 */
export function multiply(minor: number, quantity: number): number {
  return roundHalfUp(minor * quantity);
}

/** A percentage of an amount, rounded to a real amount. */
export function percentOf(minor: number, percent: number): number {
  return roundHalfUp((minor * percent) / 100);
}

/**
 * Round half away from zero.
 *
 * `Math.round` rounds -0.5 to -0, which makes a credit note disagree with the
 * invoice it reverses.
 */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function sum(amounts: readonly number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}
