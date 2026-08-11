import { describe, expect, it } from 'vitest';

import { BLANK, forgetClient, load, rememberClient, save, type Saved } from '../src/lib/storage';

/** A stand-in for localStorage that can be made to misbehave. */
function fakeStorage(initial: string | null = null, options: { throwOnGet?: boolean; throwOnSet?: boolean } = {}) {
  let value = initial;
  return {
    getItem() {
      if (options.throwOnGet) throw new Error('blocked');
      return value;
    },
    setItem(_key: string, next: string) {
      if (options.throwOnSet) throw new Error('quota exceeded');
      value = next;
    },
    read: () => value,
  };
}

const filled: Saved = {
  business: { name: 'Bloom & Box', details: 'Lagos', logo: null },
  currency: 'NGN',
  tax: { rate: 7.5, inclusive: false, label: 'VAT' },
  payment: 'GTBank 0123456789',
  notes: 'Thank you',
  lastNumber: 'INV-2026-018',
  clients: [{ name: 'Mr. Kudus', details: 'Lagos' }],
};

describe('load', () => {
  it('returns blanks when nothing is stored', () => {
    expect(load(fakeStorage())).toEqual(BLANK);
  });

  it('round-trips what was saved', () => {
    const storage = fakeStorage();
    save(filled, storage);
    expect(load(storage)).toEqual(filled);
  });

  it('survives storage being blocked entirely', () => {
    // Private browsing throws on access rather than returning null.
    expect(load(fakeStorage(null, { throwOnGet: true }))).toEqual(BLANK);
  });

  it('survives corrupt JSON', () => {
    expect(load(fakeStorage('{not json'))).toEqual(BLANK);
  });

  it('survives something that is not an object', () => {
    expect(load(fakeStorage('"a string"'))).toEqual(BLANK);
    expect(load(fakeStorage('null'))).toEqual(BLANK);
    expect(load(fakeStorage('[1,2,3]'))).toEqual(BLANK);
  });

  it('fills in fields a previous version never wrote', () => {
    // Stored data outlives the code that wrote it.
    const partial = load(fakeStorage('{"business":{"name":"Bloom"}}'));
    expect(partial.business.name).toBe('Bloom');
    expect(partial.business.details).toBe('');
    expect(partial.currency).toBe('NGN');
    expect(partial.clients).toEqual([]);
  });

  it('ignores fields of the wrong type instead of trusting them', () => {
    const hostile = load(
      fakeStorage('{"currency":42,"payment":{"x":1},"tax":{"rate":"lots","inclusive":"yes"}}'),
    );
    expect(hostile.currency).toBe('NGN');
    expect(hostile.payment).toBe('');
    expect(hostile.tax.rate).toBe(0);
    // Only a real boolean counts as true.
    expect(hostile.tax.inclusive).toBe(false);
  });

  it('clamps a tax rate that could not be right', () => {
    expect(load(fakeStorage('{"tax":{"rate":900}}')).tax.rate).toBe(100);
    expect(load(fakeStorage('{"tax":{"rate":-5}}')).tax.rate).toBe(0);
  });

  it('drops client entries that are not usable', () => {
    const stored = load(
      fakeStorage('{"clients":[{"name":"Real"},{"details":"no name"},"nonsense",null,{"name":"  "}]}'),
    );
    expect(stored.clients).toEqual([{ name: 'Real', details: '' }]);
  });

  it('never returns a partial object, whatever it is given', () => {
    for (const raw of ['{}', '{"clients":"no"}', '{"business":"no"}', '0', 'false']) {
      const result = load(fakeStorage(raw));
      expect(Object.keys(result).sort()).toEqual(Object.keys(BLANK).sort());
      expect(result.business).toHaveProperty('name');
      expect(Array.isArray(result.clients)).toBe(true);
    }
  });
});

describe('save', () => {
  it('reports success', () => {
    expect(save(filled, fakeStorage())).toBe(true);
  });

  it('reports failure rather than pretending', () => {
    // A logo is held as a data URL, so quota is a realistic failure, and
    // silently losing someone's business details is not acceptable.
    expect(save(filled, fakeStorage(null, { throwOnSet: true }))).toBe(false);
  });
});

describe('rememberClient', () => {
  it('adds a client to the front', () => {
    const result = rememberClient([{ name: 'Old', details: '' }], { name: 'New', details: 'x' });
    expect(result.map((client) => client.name)).toEqual(['New', 'Old']);
  });

  it('updates rather than duplicating, ignoring case', () => {
    const result = rememberClient([{ name: 'Mr. Kudus', details: 'old' }], {
      name: 'mr. kudus',
      details: 'new',
    });
    expect(result).toHaveLength(1);
    expect(result[0].details).toBe('new');
  });

  it('ignores a blank name', () => {
    const existing = [{ name: 'Real', details: '' }];
    expect(rememberClient(existing, { name: '   ', details: 'x' })).toEqual(existing);
  });

  it('does not mutate the list it was given', () => {
    const existing = [{ name: 'Real', details: '' }];
    rememberClient(existing, { name: 'New', details: '' });
    expect(existing).toHaveLength(1);
  });
});

describe('forgetClient', () => {
  it('removes by name, ignoring case and spacing', () => {
    const clients = [{ name: 'Mr. Kudus', details: '' }, { name: 'Ms. Chioma', details: '' }];
    expect(forgetClient(clients, '  mr. kudus ')).toEqual([{ name: 'Ms. Chioma', details: '' }]);
  });

  it('leaves the list alone when there is no match', () => {
    const clients = [{ name: 'Mr. Kudus', details: '' }];
    expect(forgetClient(clients, 'Nobody')).toEqual(clients);
  });
});
