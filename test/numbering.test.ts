import { describe, expect, it } from 'vitest';

import {
  addDays,
  firstNumber,
  fromDateInput,
  nextNumber,
  splitNumber,
  toDateInput,
} from '../src/lib/numbering';

describe('splitNumber', () => {
  it('separates a prefix from its counter', () => {
    expect(splitNumber('INV-001')).toEqual({ prefix: 'INV-', counter: 1, width: 3 });
    expect(splitNumber('2026/014')).toEqual({ prefix: '2026/', counter: 14, width: 3 });
    expect(splitNumber('42')).toEqual({ prefix: '', counter: 42, width: 2 });
  });

  it('keeps a year that is part of the prefix out of the counter', () => {
    // The trailing digits are the counter; 2026 must not become the number.
    expect(splitNumber('INV-2026-007')).toEqual({ prefix: 'INV-2026-', counter: 7, width: 3 });
  });

  it('returns null when there is no number to increment', () => {
    expect(splitNumber('INVOICE')).toBeNull();
    expect(splitNumber('')).toBeNull();
  });
});

describe('nextNumber', () => {
  it('increments while keeping the padding', () => {
    expect(nextNumber('INV-009')).toBe('INV-010');
    expect(nextNumber('INV-2026-001')).toBe('INV-2026-002');
  });

  it('widens rather than truncating when the sequence outgrows its padding', () => {
    expect(nextNumber('INV-099')).toBe('INV-100');
    expect(nextNumber('INV-999')).toBe('INV-1000');
  });

  it('still produces something distinct when there is no counter', () => {
    // A duplicate number is the thing an audit asks about, so never return the
    // input unchanged.
    expect(nextNumber('INVOICE')).toBe('INVOICE-2');
    expect(nextNumber('INVOICE')).not.toBe('INVOICE');
  });

  it('never repeats itself across a run', () => {
    const seen = new Set<string>();
    let current = firstNumber(new Date(2026, 0, 1));
    for (let index = 0; index < 250; index++) {
      expect(seen.has(current)).toBe(false);
      seen.add(current);
      current = nextNumber(current);
    }
  });
});

describe('firstNumber', () => {
  it('starts a sequence for the year', () => {
    expect(firstNumber(new Date(2026, 5, 1))).toBe('INV-2026-001');
  });
});

describe('toDateInput', () => {
  it('formats a date for a date input', () => {
    expect(toDateInput(new Date(2026, 0, 9))).toBe('2026-01-09');
  });

  it('uses the local date, not UTC', () => {
    // toISOString converts to UTC first, so an invoice written at 9pm east of
    // Greenwich would be dated tomorrow.
    const lateEvening = new Date(2026, 2, 15, 23, 30);
    expect(toDateInput(lateEvening)).toBe('2026-03-15');
  });
});

describe('fromDateInput', () => {
  it('reads a date input value', () => {
    const date = fromDateInput('2026-01-09');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(0);
    expect(date?.getDate()).toBe(9);
  });

  it('rejects a date that does not exist', () => {
    // JavaScript would roll 31 February into March without complaint.
    expect(fromDateInput('2026-02-31')).toBeNull();
    expect(fromDateInput('2026-13-01')).toBeNull();
  });

  it('rejects nonsense', () => {
    expect(fromDateInput('tomorrow')).toBeNull();
    expect(fromDateInput('')).toBeNull();
  });

  it('round-trips with toDateInput', () => {
    for (const value of ['2026-01-01', '2026-02-28', '2026-12-31']) {
      expect(toDateInput(fromDateInput(value)!)).toBe(value);
    }
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(toDateInput(addDays(new Date(2026, 0, 25), 30))).toBe('2026-02-24');
  });

  it('handles a leap year', () => {
    expect(toDateInput(addDays(new Date(2028, 1, 28), 1))).toBe('2028-02-29');
  });

  it('leaves the date alone for zero days', () => {
    expect(toDateInput(addDays(new Date(2026, 5, 3), 0))).toBe('2026-06-03');
  });
});
