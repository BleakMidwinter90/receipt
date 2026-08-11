/**
 * What is remembered between visits.
 *
 * All of it stays on the device. That is the entire premise: the alternative to
 * this tool is an invoicing service that holds your client list, your rates and
 * your income, and asks for a monthly fee to keep holding them.
 *
 * Reads are defensive to the point of paranoia. Stored data outlives the code
 * that wrote it — a browser can hand back something a previous version saved,
 * something a user edited by hand, or something truncated by a full disk — and
 * an invoicing tool that throws on load has lost someone their business details.
 */

const KEY = 'receipt.v1';

export interface SavedClient {
  name: string;
  details: string;
}

export interface Saved {
  business: { name: string; details: string; logo: string | null };
  currency: string;
  tax: { rate: number; inclusive: boolean; label: string };
  payment: string;
  notes: string;
  lastNumber: string;
  clients: SavedClient[];
}

export const BLANK: Saved = {
  business: { name: '', details: '', logo: null },
  currency: 'NGN',
  tax: { rate: 0, inclusive: false, label: 'VAT' },
  payment: '',
  notes: '',
  lastNumber: '',
  clients: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Read what was stored, filling in anything missing.
 *
 * Never throws and never returns a partial object, so callers can use the
 * result without checking every field.
 */
export function load(storage: Pick<Storage, 'getItem'> = localStorage): Saved {
  let raw: string | null = null;
  try {
    raw = storage.getItem(KEY);
  } catch {
    // Private browsing and blocked storage both throw on access.
    return { ...BLANK };
  }

  if (!raw) return { ...BLANK };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ...BLANK };
  }

  if (!isRecord(parsed)) return { ...BLANK };

  const business = isRecord(parsed.business) ? parsed.business : {};
  const tax = isRecord(parsed.tax) ? parsed.tax : {};

  return {
    business: {
      name: asString(business.name),
      details: asString(business.details),
      logo: typeof business.logo === 'string' ? business.logo : null,
    },
    currency: asString(parsed.currency, BLANK.currency) || BLANK.currency,
    tax: {
      rate: clampRate(asNumber(tax.rate, 0)),
      inclusive: tax.inclusive === true,
      label: asString(tax.label, 'VAT') || 'VAT',
    },
    payment: asString(parsed.payment),
    notes: asString(parsed.notes),
    lastNumber: asString(parsed.lastNumber),
    clients: readClients(parsed.clients),
  };
}

/** A stored rate of 900% or -5% is corruption, not a preference. */
function clampRate(rate: number): number {
  return Math.min(Math.max(rate, 0), 100);
}

function readClients(value: unknown): SavedClient[] {
  if (!Array.isArray(value)) return [];

  const clients: SavedClient[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const name = asString(entry.name).trim();
    if (name === '') continue;
    clients.push({ name, details: asString(entry.details) });
  }

  // Keep the list useful rather than unbounded.
  return clients.slice(0, 200);
}

/**
 * Store, returning whether it worked.
 *
 * Quota is the realistic failure — a logo is held as a data URL — and silently
 * losing someone's business details is not acceptable, so the caller is told.
 */
export function save(value: Saved, storage: Pick<Storage, 'setItem'> = localStorage): boolean {
  try {
    storage.setItem(KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Add or update a client, most recent first, without duplicating by name. */
export function rememberClient(clients: readonly SavedClient[], client: SavedClient): SavedClient[] {
  const name = client.name.trim();
  if (name === '') return [...clients];

  const rest = clients.filter((entry) => entry.name.toLowerCase() !== name.toLowerCase());
  return [{ name, details: client.details }, ...rest].slice(0, 200);
}

export function forgetClient(clients: readonly SavedClient[], name: string): SavedClient[] {
  return clients.filter((entry) => entry.name.toLowerCase() !== name.trim().toLowerCase());
}
