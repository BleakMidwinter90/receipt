import type { ReactNode } from 'react';

/**
 * The form primitives.
 *
 * Every label is a real `<label>` tied to its control. Placeholder-as-label
 * looks tidier and is worse: the label disappears exactly when someone is
 * filling the field in and most needs it.
 */

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="eyebrow mb-1.5 block">
      {children}
    </label>
  );
}

export function Text({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  mono,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={`field focus:field-focus outline-none placeholder:text-ink-faint ${
          mono ? 'font-mono text-sm' : ''
        }`}
      />
      {hint && <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

export function Area({
  id,
  label,
  value,
  onChange,
  placeholder,
  rows = 4,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="field focus:field-focus resize-y outline-none placeholder:text-ink-faint"
      />
      {hint && <p className="mt-1.5 text-xs text-ink-faint">{hint}</p>}
    </div>
  );
}

export function Select({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field focus:field-focus cursor-pointer outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="panel p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {aside}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'quiet';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const styles = {
    primary: 'bg-accent text-on-accent font-semibold hover:brightness-110',
    secondary: 'bg-raised text-ink border border-line hover:border-line-strong',
    quiet: 'text-ink-muted hover:text-ink',
  }[variant];

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`tap inline-flex cursor-pointer items-center justify-center rounded-lg px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${styles}`}
    >
      {children}
    </button>
  );
}
