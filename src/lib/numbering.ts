/**
 * Invoice numbers and dates.
 *
 * Numbers matter more than they look: in most places an invoice sequence is
 * expected to be unbroken and non-repeating, because a gap or a duplicate is
 * what an audit asks about. So the next number is derived from the last one
 * rather than from a count of stored invoices, which would silently reuse a
 * number after a deletion.
 */

/**
 * Split a number into its parts, so the counter can be incremented without
 * disturbing whatever convention someone already uses.
 *
 * Handles `INV-001`, `2026/014`, `RCP 7`, and a bare `42`. The trailing digits
 * are the counter; everything before is a prefix that is preserved exactly,
 * including its padding width.
 */
export function splitNumber(value: string): { prefix: string; counter: number; width: number } | null {
  const match = /^(.*?)(\d+)\s*$/.exec(value.trim());
  if (!match) return null;

  const [, prefix, digits] = match;
  return { prefix, counter: Number(digits), width: digits.length };
}

/**
 * The number after this one.
 *
 * Padding is kept, so `INV-009` becomes `INV-010` rather than `INV-10`, and a
 * sequence that outgrows its padding widens instead of truncating.
 */
export function nextNumber(previous: string): string {
  const parts = splitNumber(previous);
  if (!parts) return `${previous.trim()}-2`;

  const counter = parts.counter + 1;
  return `${parts.prefix}${String(counter).padStart(parts.width, '0')}`;
}

/** A sensible first number for someone who has never sent one. */
export function firstNumber(date = new Date()): string {
  return `INV-${date.getFullYear()}-001`;
}

/**
 * `YYYY-MM-DD` for a date, in the local timezone.
 *
 * `toISOString` is the trap: it converts to UTC first, so an invoice created at
 * 9pm in Lagos or anywhere else east of Greenwich gets tomorrow's date.
 */
export function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Parse `YYYY-MM-DD` as a local date, for the same reason. */
export function fromDateInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, year, month, day] = match.map(Number) as unknown as [string, number, number, number];
  const date = new Date(year, month - 1, day);

  // Rejects 2026-02-31, which JavaScript would happily roll into March.
  if (date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

/** Add days to a date without tripping over month lengths or DST. */
export function addDays(date: Date, days: number): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
  return result;
}

/** Common payment terms, as the number of days after the invoice date. */
export const TERMS = [
  { label: 'Due on receipt', days: 0 },
  { label: 'Net 7', days: 7 },
  { label: 'Net 14', days: 14 },
  { label: 'Net 30', days: 30 },
  { label: 'Net 60', days: 60 },
];

/** How a date is printed on the document. */
export function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}
