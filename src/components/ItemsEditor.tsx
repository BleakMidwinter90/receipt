import { lineTotal, type LineItem } from '../lib/invoice';
import { formatAmount, parseAmount } from '../lib/money';
import { Label } from './Field';

/**
 * The line items.
 *
 * Amounts are held as text while being typed and only committed as money when
 * they parse. Binding an input straight to a number fights the person using it:
 * clearing the field becomes 0, a half-typed "45," becomes 45, and a decimal
 * point cannot survive being typed.
 */
export function ItemsEditor({
  items,
  currency,
  drafts,
  onDraft,
  onChange,
  onRemove,
  onAdd,
}: {
  items: LineItem[];
  currency: string;
  /** What is currently in each price box, before it parses. */
  drafts: Record<string, string>;
  onDraft: (id: string, text: string) => void;
  onChange: (id: string, patch: Partial<LineItem>) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
}) {
  return (
    <div className="panel overflow-hidden">
      <div className="hidden gap-3 border-b border-line px-4 py-2.5 sm:grid sm:grid-cols-[1fr_5rem_9rem_7rem_2rem]">
        <span className="eyebrow">Description</span>
        <span className="eyebrow text-right">Qty</span>
        <span className="eyebrow text-right">Unit price</span>
        <span className="eyebrow text-right">Amount</span>
        <span />
      </div>

      <ul className="divide-y divide-line">
        {items.map((item, index) => {
          const draft = drafts[item.id];
          const shown = draft ?? (item.unitPrice === 0 ? '' : formatAmount(item.unitPrice, currency, { symbol: false }));
          const broken = draft !== undefined && draft.trim() !== '' && parseAmount(draft, currency) === null;

          return (
            <li key={item.id} className="grid gap-3 p-4 sm:grid-cols-[1fr_5rem_9rem_7rem_2rem] sm:items-center sm:py-3">
              <div>
                <span className="sm:hidden">
                  <Label htmlFor={`description-${item.id}`}>Description</Label>
                </span>
                <input
                  id={`description-${item.id}`}
                  value={item.description}
                  placeholder={index === 0 ? 'Gift box, delivery, consulting…' : 'Description'}
                  onChange={(event) => onChange(item.id, { description: event.target.value })}
                  aria-label="Description"
                  className="field focus:field-focus outline-none placeholder:text-ink-faint"
                />
              </div>

              <div>
                <span className="sm:hidden">
                  <Label htmlFor={`quantity-${item.id}`}>Quantity</Label>
                </span>
                <input
                  id={`quantity-${item.id}`}
                  type="number"
                  min="0"
                  step="any"
                  value={item.quantity}
                  onChange={(event) => onChange(item.id, { quantity: Number(event.target.value) || 0 })}
                  aria-label="Quantity"
                  className="field focus:field-focus text-right outline-none"
                />
              </div>

              <div>
                <span className="sm:hidden">
                  <Label htmlFor={`price-${item.id}`}>Unit price</Label>
                </span>
                <input
                  id={`price-${item.id}`}
                  value={shown}
                  inputMode="decimal"
                  placeholder="0.00"
                  onChange={(event) => onDraft(item.id, event.target.value)}
                  aria-label="Unit price"
                  aria-invalid={broken}
                  className={`field focus:field-focus figures text-right outline-none placeholder:text-ink-faint ${
                    broken ? 'border-warn' : ''
                  }`}
                />
              </div>

              <div className="figures text-right text-sm sm:pr-1">
                <span className="eyebrow mr-2 sm:hidden">Amount</span>
                {formatAmount(lineTotal(item), currency)}
              </div>

              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.description || 'this line'}`}
                className="justify-self-end rounded-md px-2 py-1 text-ink-faint transition-colors hover:bg-raised hover:text-warn"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      <div className="border-t border-line p-3">
        <button
          type="button"
          onClick={onAdd}
          className="tap inline-flex cursor-pointer items-center rounded-lg px-3 text-sm text-accent transition-colors hover:bg-accent-soft"
        >
          + Add a line
        </button>
      </div>
    </div>
  );
}
