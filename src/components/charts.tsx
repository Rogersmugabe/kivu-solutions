import { money, formatAmount } from '@/lib/format';

/** Simple accessible bar chart (no chart library needed). */
export function BarChart({ data, height = 180, highlightLast = true }: { data: { label: string; value: number; sub?: string }[]; height?: number; highlightLast?: boolean }) {
  const max = Math.max(1, ...data.map(d => d.value));
  // Long ranges: label every nth bar so the axis stays readable on small screens.
  const every = data.length > 14 ? Math.ceil(data.length / 10) : 1;
  const gap = data.length > 14 ? 'gap-0.5 sm:gap-1' : 'gap-2 sm:gap-3';
  return (
    <figure>
      <div className={`flex items-end ${gap}`} style={{ height }} role="img" aria-label={data.map(d => `${d.label}: ${money(d.value)}`).join(', ')}>
        {data.map((d, i) => {
          const h = Math.max(2, Math.round((d.value / max) * (height - 28)));
          const last = highlightLast && i === data.length - 1;
          return (
            <div key={d.label + i} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5">
              {every === 1 && <span className="text-[11px] font-medium text-zinc-500 opacity-0 tabular transition group-hover:opacity-100">{formatAmount(d.value)}</span>}
              <div className={last ? 'w-full max-w-12 rounded-md bg-ink' : 'w-full max-w-12 rounded-md bg-zinc-200 transition group-hover:bg-zinc-300'} style={{ height: h }} />
            </div>
          );
        })}
      </div>
      <figcaption className={`mt-2 flex ${gap}`}>
        {data.map((d, i) => <span key={d.label + i} className="min-w-0 flex-1 overflow-hidden text-center text-[11px] text-zinc-500">{i % every === 0 || i === data.length - 1 ? d.label : ''}</span>)}
      </figcaption>
    </figure>
  );
}

/** Horizontal share bars (e.g. payment channels). */
export function ShareBars({ items }: { items: { label: string; value: number; color: string }[] }) {
  const total = items.reduce((a, i) => a + i.value, 0);
  return (
    <div className="space-y-3">
      <div className="flex h-2.5 overflow-hidden rounded-full bg-zinc-100" aria-hidden>
        {items.map(i => <div key={i.label} style={{ width: `${total ? (i.value / total) * 100 : 0}%`, background: i.color }} />)}
      </div>
      <ul className="space-y-2">
        {items.map(i => (
          <li key={i.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="flex items-center gap-2 text-zinc-600"><span className="size-2.5 rounded-full" style={{ background: i.color }} />{i.label}</span>
            <span className="font-medium tabular">{money(i.value)} <span className="text-xs font-normal text-zinc-400">{total ? Math.round((i.value / total) * 100) : 0}%</span></span>
          </li>
        ))}
      </ul>
    </div>
  );
}
