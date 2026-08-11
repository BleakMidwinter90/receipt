import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Area, Button, Section, Select, Text } from './components/Field';
import { ItemsEditor } from './components/ItemsEditor';
import { Preview } from './components/Preview';
import { loadFonts } from './lib/fonts';
import { emptyItem, type Discount, type LineItem } from './lib/invoice';
import { CURRENCIES, formatAmount, parseAmount } from './lib/money';
import { addDays, firstNumber, formatDate, fromDateInput, nextNumber, TERMS, toDateInput } from './lib/numbering';
import { renderInvoice, summarise, type InvoiceDocument } from './lib/render';
import { BLANK, load, rememberClient, save, type Saved } from './lib/storage';

let counter = 0;
const nextId = () => `line-${++counter}`;

export default function App() {
  const [stored, setStored] = useState<Saved>(BLANK);
  const [loaded, setLoaded] = useState(false);

  const [title, setTitle] = useState('Invoice');
  const [number, setNumber] = useState('');
  const [issued, setIssued] = useState(() => toDateInput(new Date()));
  const [termDays, setTermDays] = useState(14);

  const [client, setClient] = useState({ name: '', details: '' });
  const [items, setItems] = useState<LineItem[]>(() => [emptyItem(nextId())]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const [discountText, setDiscountText] = useState('');
  const [discountKind, setDiscountKind] = useState<'percent' | 'fixed'>('percent');
  const [depositText, setDepositText] = useState('');
  const [saveFailed, setSaveFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const [logo, setLogo] = useState<{ bytes: ArrayBuffer; type: string } | null>(null);

  // Restore on first paint only. Rehydrating later would overwrite whatever the
  // person is in the middle of typing.
  useEffect(() => {
    const saved = load();
    setStored(saved);
    setNumber(saved.lastNumber ? nextNumber(saved.lastNumber) : firstNumber());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setSaveFailed(!save(stored));
  }, [stored, loaded]);

  const currency = stored.currency;

  const setBusiness = useCallback((patch: Partial<Saved['business']>) => {
    setStored((current) => ({ ...current, business: { ...current.business, ...patch } }));
  }, []);

  const changeItem = useCallback((id: string, patch: Partial<LineItem>) => {
    setItems((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  /*
   * Price boxes hold text until it parses.
   *
   * Binding an input straight to a number fights whoever is typing: clearing
   * the box becomes 0, a half-typed "45," becomes 45, and a decimal point never
   * survives. The draft is kept and the money is only updated when the text is
   * actually readable.
   */
  const draftPrice = useCallback((id: string, text: string) => {
    setDrafts((current) => ({ ...current, [id]: text }));
    const parsed = parseAmount(text, currencyRef.current);
    if (parsed !== null) changeItem(id, { unitPrice: parsed });
    if (text.trim() === '') changeItem(id, { unitPrice: 0 });
  }, [changeItem]);

  // Read inside the callback without making it depend on the currency.
  const currencyRef = useRef(currency);
  currencyRef.current = currency;

  const addItem = useCallback(() => setItems((current) => [...current, emptyItem(nextId())]), []);

  const removeItem = useCallback((id: string) => {
    setItems((current) => {
      const remaining = current.filter((item) => item.id !== id);
      // Never leave the table empty; an invoice with no rows has nothing to type into.
      return remaining.length > 0 ? remaining : [emptyItem(nextId())];
    });
    setDrafts((current) => {
      const { [id]: _removed, ...rest } = current;
      return rest;
    });
  }, []);

  const discount = useMemo<Discount>(() => {
    const text = discountText.trim();
    if (text === '') return { kind: 'none' };

    if (discountKind === 'percent') {
      const percent = Number(text.replace('%', ''));
      return Number.isFinite(percent) && percent > 0 ? { kind: 'percent', percent } : { kind: 'none' };
    }

    const amount = parseAmount(text, currency);
    return amount && amount > 0 ? { kind: 'fixed', amount } : { kind: 'none' };
  }, [discountText, discountKind, currency]);

  const deposit = useMemo(() => parseAmount(depositText, currency) ?? 0, [depositText, currency]);

  const issuedDate = useMemo(() => fromDateInput(issued) ?? new Date(), [issued]);

  const invoice = useMemo<InvoiceDocument>(
    () => ({
      number,
      issued: issuedDate,
      due: termDays > 0 ? addDays(issuedDate, termDays) : null,
      currency,
      title,
      from: { name: stored.business.name, details: stored.business.details },
      to: client,
      items,
      tax: stored.tax,
      discount,
      deposit,
      notes: stored.notes,
      payment: stored.payment,
    }),
    [number, issuedDate, termDays, currency, title, stored, client, items, discount, deposit],
  );

  const totals = useMemo(() => summarise(invoice), [invoice]);

  const download = useCallback(async () => {
    setBusy(true);
    try {
      const fonts = await loadFonts();
      const blob = await renderInvoice(invoice, fonts, logo);

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${title} ${number}`.trim().replace(/[\\/:*?"<>|]/g, '-') + '.pdf';
      anchor.click();
      URL.revokeObjectURL(url);

      // Only now is the number spent, and only now is the client worth keeping.
      setStored((current) => ({
        ...current,
        lastNumber: number,
        clients: rememberClient(current.clients, client),
      }));
    } finally {
      setBusy(false);
    }
  }, [invoice, number, title, client, logo]);

  const applySavedClient = useCallback((name: string) => {
    const match = stored.clients.find((entry) => entry.name === name);
    if (match) setClient({ name: match.name, details: match.details });
  }, [stored.clients]);

  async function pickLogo(file: File | undefined) {
    if (!file) return;
    setLogo({ bytes: await file.arrayBuffer(), type: file.type });
  }

  return (
    <div className="mx-auto w-full max-w-[1400px] px-5 py-8 lg:py-12">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">receipt</h1>
          <p className="mt-1.5 max-w-xl text-pretty text-sm text-ink-muted">
            Invoices that never leave your device. Your clients, your rates and your income stay
            in this browser — there is no account and no server that could hold them.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {saveFailed && (
            <span className="text-xs text-warn">
              Could not save — storage is full or blocked
            </span>
          )}
          <Button variant="primary" onClick={download} disabled={busy}>
            {busy ? 'Making the PDF…' : 'Download PDF'}
          </Button>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <div className="space-y-5">
          <Section
            title="Your business"
            aside={
              <label className="cursor-pointer text-xs text-accent hover:underline">
                {logo ? 'Change logo' : 'Add a logo'}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  className="sr-only"
                  onChange={(event) => void pickLogo(event.target.files?.[0])}
                />
              </label>
            }
          >
            <Text
              id="business-name"
              label="Name"
              value={stored.business.name}
              onChange={(value) => setBusiness({ name: value })}
              placeholder="Bloom & Box"
            />
            <Area
              id="business-details"
              label="Address and contact"
              value={stored.business.details}
              onChange={(value) => setBusiness({ details: value })}
              placeholder={'12 Adeola Odeku Street\nVictoria Island, Lagos\nhello@example.com'}
              rows={3}
              hint="Saved on this device for next time."
            />
          </Section>

          <Section
            title="Billed to"
            aside={
              stored.clients.length > 0 ? (
                <select
                  aria-label="Use a saved client"
                  value=""
                  onChange={(event) => applySavedClient(event.target.value)}
                  className="cursor-pointer rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink-muted"
                >
                  <option value="">Saved clients…</option>
                  {stored.clients.map((entry) => (
                    <option key={entry.name} value={entry.name}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              ) : null
            }
          >
            <Text
              id="client-name"
              label="Client"
              value={client.name}
              onChange={(value) => setClient((current) => ({ ...current, name: value }))}
              placeholder="Mr. Kudus"
            />
            <Area
              id="client-details"
              label="Their address"
              value={client.details}
              onChange={(value) => setClient((current) => ({ ...current, details: value }))}
              rows={3}
            />
          </Section>

          <Section title="Items">
            <ItemsEditor
              items={items}
              currency={currency}
              drafts={drafts}
              onDraft={draftPrice}
              onChange={changeItem}
              onRemove={removeItem}
              onAdd={addItem}
            />
          </Section>

          <Section title="Document">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                id="title"
                label="Type"
                value={title}
                onChange={setTitle}
                options={[
                  { value: 'Invoice', label: 'Invoice' },
                  { value: 'Receipt', label: 'Receipt' },
                  { value: 'Quote', label: 'Quote' },
                ]}
              />
              <Text id="number" label="Number" value={number} onChange={setNumber} mono />
              <div>
                <label htmlFor="issued" className="eyebrow mb-1.5 block">
                  Issued
                </label>
                <input
                  id="issued"
                  type="date"
                  value={issued}
                  onChange={(event) => setIssued(event.target.value)}
                  className="field focus:field-focus outline-none"
                />
              </div>
              <Select
                id="terms"
                label="Payment terms"
                value={String(termDays)}
                onChange={(value) => setTermDays(Number(value))}
                options={TERMS.map((term) => ({ value: String(term.days), label: term.label }))}
              />
            </div>
            <p className="text-xs text-ink-faint">
              {termDays > 0
                ? `Due ${formatDate(addDays(issuedDate, termDays))}.`
                : 'Due when it arrives.'}
            </p>
          </Section>

          <Section title="Money">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                id="currency"
                label="Currency"
                value={currency}
                onChange={(value) => setStored((current) => ({ ...current, currency: value }))}
                options={Object.values(CURRENCIES).map((entry) => ({
                  value: entry.code,
                  label: `${entry.symbol}  ${entry.name}`,
                }))}
              />
              <Text
                id="tax-rate"
                label="Tax rate (%)"
                value={String(stored.tax.rate)}
                onChange={(value) =>
                  setStored((current) => ({
                    ...current,
                    tax: { ...current.tax, rate: Math.min(Math.max(Number(value) || 0, 0), 100) },
                  }))
                }
                hint={stored.tax.inclusive ? 'Prices already include it.' : 'Added on top of the prices.'}
              />
              <Text
                id="tax-label"
                label="Tax called"
                value={stored.tax.label}
                onChange={(value) =>
                  setStored((current) => ({ ...current, tax: { ...current.tax, label: value } }))
                }
                placeholder="VAT"
              />
              <div className="flex items-end">
                <label className="tap flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={stored.tax.inclusive}
                    onChange={(event) =>
                      setStored((current) => ({
                        ...current,
                        tax: { ...current.tax, inclusive: event.target.checked },
                      }))
                    }
                    className="size-4 cursor-pointer accent-accent"
                  />
                  Prices include tax
                </label>
              </div>
              <div>
                <label htmlFor="discount" className="eyebrow mb-1.5 block">
                  Discount
                </label>
                <div className="flex gap-2">
                  <input
                    id="discount"
                    value={discountText}
                    onChange={(event) => setDiscountText(event.target.value)}
                    placeholder="0"
                    inputMode="decimal"
                    className="field focus:field-focus figures text-right outline-none"
                  />
                  <select
                    aria-label="Discount type"
                    value={discountKind}
                    onChange={(event) => setDiscountKind(event.target.value as 'percent' | 'fixed')}
                    className="field focus:field-focus w-24 cursor-pointer outline-none"
                  >
                    <option value="percent">%</option>
                    <option value="fixed">{CURRENCIES[currency]?.symbol ?? '#'}</option>
                  </select>
                </div>
              </div>
              <Text
                id="deposit"
                label="Already paid"
                value={depositText}
                onChange={setDepositText}
                placeholder="0"
              />
            </div>
          </Section>

          <Section title="Footer">
            <Area
              id="payment"
              label="How to pay"
              value={stored.payment}
              onChange={(value) => setStored((current) => ({ ...current, payment: value }))}
              placeholder={'Bank transfer — Your Business Ltd\nGTBank · 0123456789'}
              rows={3}
              hint="Saved for next time."
            />
            <Area
              id="notes"
              label="Notes"
              value={stored.notes}
              onChange={(value) => setStored((current) => ({ ...current, notes: value }))}
              placeholder="Thank you for your business."
              rows={2}
            />
          </Section>

          <div className="panel p-5">
            <dl className="figures space-y-2 text-sm">
              <Row label="Subtotal" value={formatAmount(totals.subtotal, currency)} />
              {totals.discount > 0 && (
                <Row label="Discount" value={`-${formatAmount(totals.discount, currency)}`} />
              )}
              {stored.tax.rate > 0 && (
                <Row
                  label={`${stored.tax.label} ${stored.tax.rate}%${stored.tax.inclusive ? ' (included)' : ''}`}
                  value={formatAmount(totals.tax, currency)}
                />
              )}
              <div className="border-t border-line pt-2">
                <Row label="Total" value={formatAmount(totals.total, currency)} strong />
              </div>
              {deposit !== 0 && (
                <Row label="Balance due" value={formatAmount(totals.balance, currency)} strong />
              )}
            </dl>
          </div>
        </div>

        <div className="lg:block">
          <Preview invoice={invoice} logo={logo} />
        </div>
      </div>

      <footer className="mt-14 border-t border-line pt-6 text-xs text-ink-faint">
        <p className="max-w-xl text-pretty">
          Nothing here is uploaded. The PDF is drawn in this tab, and your details are kept in this
          browser's storage — clearing site data removes them, and nobody else ever had a copy.
        </p>
        <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          <a
            href="https://github.com/BleakMidwinter90/receipt"
            className="underline decoration-line-strong underline-offset-4 transition-colors hover:text-ink"
          >
            Source on GitHub
          </a>
          <span>MIT licensed</span>
        </p>
      </footer>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className={strong ? 'font-semibold' : 'text-ink-muted'}>{label}</dt>
      <dd className={strong ? 'font-semibold' : ''}>{value}</dd>
    </div>
  );
}
