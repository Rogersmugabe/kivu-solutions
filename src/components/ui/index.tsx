import { forwardRef, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { formatAmount, parseMoney } from '@/lib/format';

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/* ---------------------------------- Button ---------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'money' | 'subtle-danger';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-white hover:bg-ink-soft shadow-xs',
  secondary: 'bg-white text-zinc-900 border border-zinc-300 hover:bg-zinc-50 hover:border-zinc-400 shadow-xs',
  ghost: 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-xs',
  'subtle-danger': 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
  money: 'bg-money-600 text-white hover:bg-money-700 shadow-xs'
};
const SIZES = { sm: 'h-8 px-3 text-[13px] gap-1.5 rounded-md', md: 'h-10 px-4 text-sm gap-2 rounded-lg', lg: 'h-12 px-5 text-base gap-2 rounded-xl' };

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: keyof typeof SIZES;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }, ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx('inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4', VARIANTS[variant], SIZES[size], className)}
      {...rest}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  );
});

/* ---------------------------------- Fields ---------------------------------- */

export function Field({ label, hint, error, children, className }: { label: string; hint?: ReactNode; error?: string | null; children: ReactNode; className?: string }) {
  return (
    <label className={cx('flex flex-col gap-1.5', className)}>
      <span className="label">{label}</span>
      {children}
      {error ? <span className="text-xs text-red-600" role="alert">{error}</span> : hint ? <span className="text-xs text-zinc-500">{hint}</span> : null}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx('input', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return <select ref={ref} className={cx('input', className)} {...rest}>{children}</select>;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx('input', className)} {...rest} />;
});

/** Amount input that shows thousands separators and reports whole-franc integers. */
export function MoneyInput({ value, onChange, className, ...rest }: { value: number | ''; onChange: (v: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value === '' ? '' : formatAmount(value));
  useEffect(() => {
    if (value === '') { setText(''); return; }
    if (parseMoney(text) !== value) setText(value ? formatAmount(value) : '');
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="relative">
      <input
        inputMode="numeric"
        className={cx('input pr-12 tabular', className)}
        value={text}
        onChange={e => {
          const n = parseMoney(e.target.value);
          setText(e.target.value.trim() === '' ? '' : formatAmount(n));
          onChange(n);
        }}
        {...rest}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-400">RWF</span>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className, autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" aria-hidden />
      <input type="search" autoFocus={autoFocus} aria-label={placeholder} className="input pl-9 pr-9" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange('')} className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/* --------------------------------- Surfaces --------------------------------- */

export function Card({ title, description, actions, children, className, bodyClassName }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cx('card min-w-0', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold tracking-tight text-zinc-900">{title}</h2>}
            {description && <p className="mt-0.5 text-[13px] text-zinc-500">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cx('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950">{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'default', icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'default' | 'good' | 'bad' | 'warn'; icon?: ReactNode }) {
  const toneClass = { default: 'text-zinc-950', good: 'text-money-700', bad: 'text-red-600', warn: 'text-amber-600' }[tone];
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-zinc-500">{label}</span>
        {icon && <span className="text-zinc-400 [&_svg]:size-4">{icon}</span>}
      </div>
      <div className={cx('mt-2 text-[22px] font-semibold tracking-tight tabular', toneClass)}>{value}</div>
      {hint && <div className="mt-1 text-xs text-zinc-500">{hint}</div>}
    </div>
  );
}

const BADGE_TONES = {
  neutral: 'bg-zinc-100 text-zinc-700 ring-zinc-200',
  good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warn: 'bg-amber-50 text-amber-700 ring-amber-200',
  bad: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-brand-50 text-brand-700 ring-brand-100'
};
export function Badge({ tone = 'neutral', children, className }: { tone?: keyof typeof BADGE_TONES; children: ReactNode; className?: string }) {
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', BADGE_TONES[tone], className)}>{children}</span>;
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="mb-1 grid size-11 place-items-center rounded-xl bg-zinc-100 text-zinc-500 [&_svg]:size-5">{icon}</div>}
      <p className="text-sm font-medium text-zinc-900">{title}</p>
      {description && <p className="max-w-sm text-[13px] text-zinc-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'warn' | 'bad' | 'good'; children: ReactNode; className?: string }) {
  const t = { info: 'bg-brand-50 text-brand-700 border-brand-100', warn: 'bg-amber-50 text-amber-800 border-amber-200', bad: 'bg-red-50 text-red-700 border-red-200', good: 'bg-emerald-50 text-emerald-800 border-emerald-200' }[tone];
  return <div className={cx('rounded-lg border px-3.5 py-2.5 text-[13px] leading-relaxed', t, className)}>{children}</div>;
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg bg-zinc-100 p-1">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx('h-8 rounded-md px-3 text-[13px] font-medium transition', value === o.value ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------- Dialog ---------------------------------- */

export function Dialog({ open, onClose, title, description, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // showModal() focuses the first focusable element (the close button). Move focus to the
      // element marked data-autofocus, otherwise to the first field in the dialog body.
      const target = d.querySelector<HTMLElement>('[data-autofocus]') ?? d.querySelector<HTMLElement>('[data-dialog-body] input:not([type=hidden]), [data-dialog-body] select, [data-dialog-body] textarea');
      target?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-5xl' }[size];
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={e => { e.preventDefault(); onClose(); }}
      onClick={e => { if (e.target === ref.current) onClose(); }}
      className={cx('m-auto w-[calc(100%-1.5rem)] rounded-2xl bg-white p-0 text-zinc-900 shadow-[var(--shadow-pop)] backdrop:bg-transparent', width)}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-zinc-100 px-5 py-4">
            <div>
              <h2 id={titleId} className="text-base font-semibold tracking-tight">{title}</h2>
              {description && <p className="mt-0.5 text-[13px] text-zinc-500">{description}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-md text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700">
              <X className="size-4" />
            </button>
          </header>
          <div data-dialog-body className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-zinc-100 px-5 py-3">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
