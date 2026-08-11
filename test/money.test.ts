import { describe, expect, it } from 'vitest';

import {
  currencyOf,
  formatAmount,
  multiply,
  parseAmount,
  percentOf,
  roundHalfUp,
  sum,
} from '../src/lib/money';

describe('parseAmount', () => {
  it('reads a plain number as major units', () => {
    expect(parseAmount('45', 'NGN')).toBe(4500);
    expect(parseAmount('45.50', 'NGN')).toBe(4550);
  });

  it('reads the way people actually write thousands', () => {
    // From a real sales record: "45,000 N".
    expect(parseAmount('45,000', 'NGN')).toBe(4_500_000);
    expect(parseAmount('₦45,000', 'NGN')).toBe(4_500_000);
    expect(parseAmount('45 000', 'NGN')).toBe(4_500_000);
    expect(parseAmount('313,000', 'NGN')).toBe(31_300_000);
  });

  it('does not mistake a thousands separator for a decimal point', () => {
    // "45,000" is forty-five thousand, not forty-five and some change. Getting
    // this backwards is a factor of a thousand on every invoice.
    expect(parseAmount('45,000', 'NGN')).toBe(4_500_000);
    expect(parseAmount('45.000', 'NGN')).toBe(4_500_000);
  });

  it('handles both decimal conventions', () => {
    expect(parseAmount('1,234.56', 'USD')).toBe(123_456);
    expect(parseAmount('1.234,56', 'EUR')).toBe(123_456);
  });

  it('reads accountants brackets as negative', () => {
    expect(parseAmount('(45.00)', 'USD')).toBe(-4500);
    expect(parseAmount('-45.00', 'USD')).toBe(-4500);
  });

  it('respects currencies without decimal places', () => {
    // ¥1000 is a thousand yen, not ten.
    expect(parseAmount('1000', 'JPY')).toBe(1000);
    expect(formatAmount(1000, 'JPY')).toBe('¥1,000');
  });

  it('rounds a decimal that is too precise for the currency', () => {
    // Four decimals, so this cannot be read as a thousands group.
    expect(parseAmount('1.0050', 'USD')).toBe(101);
    expect(parseAmount('1.0040', 'USD')).toBe(100);
  });

  it('treats a lone separator with three digits as thousands, on purpose', () => {
    // "1.005" is genuinely ambiguous: 1005 in Germany, 1.005 in the US. An
    // invoice can survive a rounding difference and cannot survive being out by
    // a factor of a thousand, so the grouping reading wins.
    expect(parseAmount('1.005', 'USD')).toBe(100_500);
    expect(parseAmount('1,005', 'USD')).toBe(100_500);
  });

  it('accepts the currency markers people actually type', () => {
    // Real sales records write "45,000 N" for naira.
    expect(parseAmount('45,000 N', 'NGN')).toBe(4_500_000);
    expect(parseAmount('NGN 45,000', 'NGN')).toBe(4_500_000);
    expect(parseAmount('USD 45.00', 'USD')).toBe(4500);
  });

  it('returns null for anything it cannot read', () => {
    // Not zero: a line silently worth nothing is worse than a visible error,
    // and stripping every letter once turned "about 45k" into 45.
    expect(parseAmount('', 'NGN')).toBeNull();
    expect(parseAmount('about 45k', 'NGN')).toBeNull();
    expect(parseAmount('forty five', 'NGN')).toBeNull();
    expect(parseAmount('45k', 'NGN')).toBeNull();
    expect(parseAmount('N', 'NGN')).toBeNull();
    expect(parseAmount('..', 'NGN')).toBeNull();
  });
});

describe('formatAmount', () => {
  it('groups thousands and pads decimals', () => {
    expect(formatAmount(4_500_000, 'NGN')).toBe('₦45,000.00');
    expect(formatAmount(50, 'USD')).toBe('$0.50');
    expect(formatAmount(5, 'USD')).toBe('$0.05');
  });

  it('can omit the symbol, for columns that carry it in the header', () => {
    expect(formatAmount(4_500_000, 'NGN', { symbol: false })).toBe('45,000.00');
  });

  it('puts the sign before the symbol', () => {
    expect(formatAmount(-4500, 'USD')).toBe('-$45.00');
  });

  it('round-trips with parseAmount', () => {
    for (const code of ['NGN', 'USD', 'JPY']) {
      for (const minor of [0, 1, 99, 100, 12_345, 31_300_000]) {
        expect(parseAmount(formatAmount(minor, code), code)).toBe(minor);
      }
    }
  });
});

describe('multiply', () => {
  it('multiplies by whole quantities exactly', () => {
    expect(multiply(4_500_000, 3)).toBe(13_500_000);
  });

  it('rounds a fractional quantity to a real amount', () => {
    // 2.5 hours at £30.00
    expect(multiply(3000, 2.5)).toBe(7500);
    // A third of £10.00 has to become a number of pence.
    expect(multiply(1000, 1 / 3)).toBe(333);
  });

  it('does not accumulate float error across a column', () => {
    const line = multiply(1010, 3); // 10.10 × 3
    expect(line).toBe(3030);
    expect(sum([line, line, line])).toBe(9090);
  });
});

describe('percentOf', () => {
  it('takes a percentage and rounds once', () => {
    expect(percentOf(10_000, 7.5)).toBe(750);
    expect(percentOf(999, 20)).toBe(200);
  });

  it('handles zero and whole percentages', () => {
    expect(percentOf(10_000, 0)).toBe(0);
    expect(percentOf(10_000, 100)).toBe(10_000);
  });
});

describe('roundHalfUp', () => {
  it('rounds halves away from zero in both directions', () => {
    // Math.round(-0.5) is -0, which makes a credit note disagree with the
    // invoice it reverses.
    expect(roundHalfUp(0.5)).toBe(1);
    expect(roundHalfUp(-0.5)).toBe(-1);
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
  });
});

describe('currencyOf', () => {
  it('falls back rather than returning undefined', () => {
    expect(currencyOf('NOPE').code).toBe('NGN');
  });
});
