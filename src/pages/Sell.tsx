import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Minus, Plus, Trash2, PauseCircle, PlayCircle, ShoppingBag, Package, WifiOff, Printer, Banknote, Smartphone, Landmark } from 'lucide-react';
import { useShop } from '@/auth/AuthProvider';
import { useMyOpenShift, useProducts } from '@/data/hooks';
import { useFeedback } from '@/components/feedback';
import { Receipt, usePrint } from '@/components/print';
import { BarcodeScannerButton } from '@/components/BarcodeScanner';
import { Button, Card, Dialog, EmptyState, Field, MoneyInput, Notice, SearchInput, Spinner, cx } from '@/components/ui';
import { formatAmount, money } from '@/lib/format';
import { baseQty, baseUnit, bulkUnit, cartTotals, lineTotal, stockStatus, unitPrice, unitsInCart, unitsPerBulk, type CartLine, type PaymentMethod } from '@/lib/sales';
import { loadCatalogue, newClientRef, offlineQueue, saveCatalogue, useOnlineStatus, useQueuedSales } from '@/lib/offline';
import { rpc, rows, supabase } from '@/lib/supabase';
import type { Product, Sale } from '@/lib/types';

interface ParkedSale { id: string; note: string; lines: CartLine[]; discount: number; savedAt: string }
const parkedKey = (shopId: string) => `kivu.parked.${shopId}`;
const readParked = (shopId: string): ParkedSale[] => { try { return JSON.parse(localStorage.getItem(parkedKey(shopId)) || '[]'); } catch { return []; } };
const writeParked = (shopId: string, list: ParkedSale[]) => { try { localStorage.setItem(parkedKey(shopId), JSON.stringify(list)); } catch { /* storage full */ } };

const PAY_OPTIONS: { value: PaymentMethod; label: string; icon: typeof Banknote }[] = [
  { value: 'Cash', label: 'Cash', icon: Banknote },
  { value: 'Mobile Money', label: 'MoMo', icon: Smartphone },
  { value: 'Bank', label: 'Bank', icon: Landmark }
];

export default function Sell() {
  const { shop, session, role, hasFeature } = useShop();
  const online = useOnlineStatus();
  const qc = useQueryClient();
  const { toast, prompt, confirm } = useFeedback();
  const print = usePrint();
  const productsQuery = useProducts();
  const myShift = useMyOpenShift(hasFeature('shifts'));
  const queued = useQueuedSales(shop.id);

  // Keep selling offline with the last loaded catalogue.
  useEffect(() => { if (productsQuery.data) saveCatalogue(shop.id, productsQuery.data); }, [productsQuery.data, shop.id]);
  const products: Product[] = productsQuery.data ?? loadCatalogue<Product>(shop.id);
  const [offlineSold, setOfflineSold] = useState<Record<string, number>>({});
  const available = (p: Product) => Number(p.qty || 0) - (offlineSold[p.id] || 0);
  const byId = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('Cash');
  const [tendered, setTendered] = useState(0);
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState<Sale[] | null>(null);
  const [parked, setParked] = useState<ParkedSale[]>(() => readParked(shop.id));
  const [showParked, setShowParked] = useState(false);
  const cartRef = useRef<HTMLDivElement>(null);

  const categories = useMemo(() => ['All', ...[...new Set(products.map(p => p.category).filter(Boolean) as string[])].sort()], [products]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter(p => (category === 'All' || p.category === category) && (!q || p.name.toLowerCase().includes(q) || (p.barcode || '').toLowerCase() === q || (p.barcode || '').includes(q)));
  }, [products, search, category]);

  const totals = cartTotals(lines, byId, discount);
  const itemCount = lines.reduce((a, l) => a + l.entered_qty, 0);
  const cashDue = method === 'Cash' ? totals.total : 0;
  // The database refuses discounts from cashiers, so they are not offered one.
  const canDiscount = role !== 'cashier';
  const change = tendered > 0 ? tendered - cashDue : 0;

  function add(p: Product, mode: CartLine['unit_mode'] = 'base') {
    const step = mode === 'bulk' ? unitsPerBulk(p) : 1;
    if (unitsInCart(lines, p) + step > available(p)) { toast('warning', `Not enough ${p.name} in stock`, `Available: ${available(p)} ${baseUnit(p)}`); return; }
    setLines(ls => {
      const i = ls.findIndex(l => l.product_id === p.id && l.unit_mode === mode);
      if (i < 0) return [...ls, { product_id: p.id, entered_qty: 1, unit_mode: mode }];
      return ls.map((l, idx) => (idx === i ? { ...l, entered_qty: l.entered_qty + 1 } : l));
    });
  }

  function setQty(index: number, qty: number) {
    setLines(ls => {
      const line = ls[index];
      const p = byId.get(line.product_id);
      if (!p) return ls;
      if (qty <= 0) return ls.filter((_, i) => i !== index);
      const others = unitsInCart(ls.filter((_, i) => i !== index), p);
      const maxQty = Math.floor((available(p) - others) / (line.unit_mode === 'bulk' ? unitsPerBulk(p) : 1));
      if (qty > maxQty) { toast('warning', `Only ${available(p)} ${baseUnit(p)} of ${p.name} in stock`); qty = Math.max(0, maxQty); }
      return qty <= 0 ? ls.filter((_, i) => i !== index) : ls.map((l, i) => (i === index ? { ...l, entered_qty: qty } : l));
    });
  }

  function toggleUnit(index: number) {
    const line = lines[index];
    const p = byId.get(line.product_id);
    if (!p || unitsPerBulk(p) <= 1) return;
    const next: CartLine = { ...line, unit_mode: line.unit_mode === 'bulk' ? 'base' : 'bulk' };
    const others = unitsInCart(lines.filter((_, i) => i !== index), p);
    if (others + baseQty(p, next) > available(p)) { toast('warning', `Not enough stock to sell ${p.name} by the ${bulkUnit(p).toLowerCase()}`); return; }
    setLines(ls => ls.map((l, i) => (i === index ? next : l)));
  }

  function clearCart() {
    setLines([]); setDiscount(0); setTendered(0); setMethod('Cash');
  }

  function onSearchEnter() {
    const code = search.trim();
    if (!code) return;
    const exact = products.find(p => (p.barcode || '').trim() === code);
    if (exact) { add(exact); setSearch(''); return; }
    if (filtered.length === 1) { add(filtered[0]); setSearch(''); }
  }

  function onScan(code: string) {
    const p = products.find(x => (x.barcode || '').trim() === code);
    if (p) add(p); else toast('warning', 'No product has that barcode', `Scanned: ${code}. Add it to the product first.`);
  }

  async function park() {
    if (!lines.length) return;
    const note = await prompt({ title: 'Park this sale', label: 'Note (customer name or reason)', placeholder: 'e.g. Customer fetching money', confirmLabel: 'Park sale' });
    if (note === null) return;
    const list = [{ id: newClientRef(), note: note || 'Parked sale', lines, discount, savedAt: new Date().toISOString() }, ...parked];
    setParked(list); writeParked(shop.id, list); clearCart();
    toast('info', 'Sale parked', 'Serve the next customer. Resume it from "Parked".');
  }

  async function resume(p: ParkedSale) {
    if (lines.length && !(await confirm({ title: 'Replace the current cart?', message: 'The items in the current cart will be removed.', confirmLabel: 'Replace' }))) return;
    setLines(p.lines.filter(l => byId.has(l.product_id))); setDiscount(p.discount);
    const list = parked.filter(x => x.id !== p.id); setParked(list); writeParked(shop.id, list); setShowParked(false);
  }

  async function checkout() {
    if (!lines.length || busy) return;
    if (cashDue > 0 && tendered > 0 && tendered < cashDue && !(await confirm({ title: 'Cash received is less than due', message: `Received ${money(tendered)}, due ${money(cashDue)}. Record the sale anyway?`, confirmLabel: 'Record sale' }))) return;
    for (const l of lines) {
      const p = byId.get(l.product_id);
      if (p && unitsInCart(lines, p) > available(p)) { toast('warning', `Not enough ${p.name} in stock`); return; }
    }
    const items = lines.map(l => { const p = byId.get(l.product_id)!; return { ...l, unit_price: unitPrice(p, l.unit_mode), line_total: lineTotal(p, l) }; });
    const payment: PaymentMethod = method;
    const clientRef = newClientRef();
    setBusy(true);
    try {
      if (!navigator.onLine) {
        await offlineQueue.add({ client_ref: clientRef, shop_id: shop.id, user_id: session.user.id, items, payment, discount: totals.discount });
        setOfflineSold(s => { const n = { ...s }; for (const l of lines) { const p = byId.get(l.product_id)!; n[p.id] = (n[p.id] || 0) + baseQty(p, l); } return n; });
        clearCart();
        toast('info', 'Saved on this device', 'No internet. The sale will sync automatically when you are back online.');
        return;
      }
      const receiptNo = await rpc<string>('record_sale_cart_v48', { p_items: items, p_payment: payment, p_discount: totals.discount, p_customer_id: null, p_customer_name: null, p_client_ref: clientRef });
      const saleRows = await rows<Sale>(supabase.from('sales').select('*').eq('shop_id', shop.id).eq('receipt_no', receiptNo).order('created_at'));
      clearCart();
      setReceipt(saleRows);
      void qc.invalidateQueries({ queryKey: ['products'] });
      void qc.invalidateQueries({ queryKey: ['sales'] });
    } catch (err) {
      toast('error', 'Sale not recorded', (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // F2 jumps to search, Ctrl+Enter charges.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F2') { e.preventDefault(); document.getElementById('pos-search')?.querySelector('input')?.focus(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void checkout(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const needsShift = hasFeature('shifts') && role === 'cashier' && !myShift.isLoading && !myShift.data;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
      <div className="min-w-0 space-y-4">
        {!online && <Notice tone="warn"><WifiOff className="mr-1.5 inline size-4" />You are offline. Sales are saved on this device and sync when the internet returns.</Notice>}
        {queued.length > 0 && <Notice tone={queued.some(q => q.status === 'failed') ? 'bad' : 'info'}>{queued.length} sale{queued.length === 1 ? '' : 's'} waiting to sync{queued.some(q => q.status === 'failed') ? ` — ${queued.filter(q => q.status === 'failed').length} rejected by the server (${queued.find(q => q.last_error)?.last_error})` : ''}.</Notice>}
        {needsShift && <Notice tone="warn">You have no open cash shift. <Link to="/shifts" className="font-semibold underline">Open your shift</Link> so your sales count toward your drawer.</Notice>}

        <div className="flex gap-2">
          <div id="pos-search" className="min-w-0 flex-1" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSearchEnter(); } }}>
            <SearchInput value={search} onChange={setSearch} placeholder="Search or scan a barcode (F2)" autoFocus />
          </div>
          <BarcodeScannerButton onScan={onScan} />
        </div>

        {categories.length > 2 && (
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Categories">
            {categories.map(c => (
              <button key={c} type="button" role="tab" aria-selected={category === c} onClick={() => setCategory(c)}
                className={cx('h-8 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition', category === c ? 'border-ink bg-ink text-white' : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400')}>
                {c}
              </button>
            ))}
          </div>
        )}

        {productsQuery.isLoading && !products.length ? <Spinner label="Loading products…" /> : !products.length ? (
          <div className="card"><EmptyState icon={<Package />} title="No products yet" description="Add products before selling." action={<Link to="/products"><Button variant="primary">Add products</Button></Link>} /></div>
        ) : !filtered.length ? (
          <div className="card"><EmptyState title="No product matches" description={`Nothing found for "${search}".`} /></div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map(p => {
              const st = stockStatus({ ...p, qty: available(p) });
              const inCart = unitsInCart(lines, p);
              return (
                <button key={p.id} type="button" onClick={() => add(p)} disabled={st === 'out'}
                  className={cx('card relative flex flex-col items-start gap-1 p-3.5 text-left transition hover:border-zinc-300 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50', inCart > 0 && 'ring-2 ring-money-500/60')}>
                  {inCart > 0 && <span className="absolute right-2 top-2 grid min-w-6 place-items-center rounded-full bg-money-600 px-1.5 text-xs font-semibold text-white">{inCart}</span>}
                  <span className="line-clamp-2 pr-6 text-sm font-medium leading-snug text-zinc-900">{p.name}</span>
                  <span className="text-[15px] font-semibold tabular">{money(p.price)}</span>
                  <span className={cx('text-xs tabular', st === 'out' ? 'text-red-600' : st === 'low' ? 'text-amber-600' : 'text-zinc-500')}>
                    {st === 'out' ? 'Out of stock' : `${available(p)} ${baseUnit(p).toLowerCase()} left`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Cart */}
      <div ref={cartRef} className="lg:sticky lg:top-[88px] lg:self-start">
        <Card
          title={<span className="flex items-center gap-2"><ShoppingBag className="size-4" /> Current sale</span>}
          actions={<>
            {parked.length > 0 && <Button size="sm" variant="ghost" icon={<PlayCircle />} onClick={() => setShowParked(true)}>Parked ({parked.length})</Button>}
            {lines.length > 0 && <Button size="sm" variant="ghost" icon={<PauseCircle />} onClick={park}>Park</Button>}
          </>}
          bodyClassName="p-0"
        >
          {!lines.length ? (
            <EmptyState title="Cart is empty" description="Tap a product or scan a barcode to add it." />
          ) : (
            <ul className="max-h-[38vh] divide-y divide-zinc-100 overflow-y-auto">
              {lines.map((l, i) => {
                const p = byId.get(l.product_id);
                if (!p) return null;
                return (
                  <li key={`${l.product_id}-${l.unit_mode}`} className="flex items-center gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-zinc-500 tabular">
                        {money(unitPrice(p, l.unit_mode))} / {(l.unit_mode === 'bulk' ? bulkUnit(p) : baseUnit(p)).toLowerCase()}
                        {unitsPerBulk(p) > 1 && <button type="button" onClick={() => toggleUnit(i)} className="ml-2 font-medium text-brand-600 hover:underline">sell by {(l.unit_mode === 'bulk' ? baseUnit(p) : bulkUnit(p)).toLowerCase()}</button>}
                      </p>
                    </div>
                    <div className="flex items-center rounded-lg border border-zinc-200">
                      <button type="button" aria-label={`Decrease ${p.name}`} onClick={() => setQty(i, l.entered_qty - 1)} className="grid size-8 place-items-center text-zinc-600 hover:bg-zinc-50"><Minus className="size-3.5" /></button>
                      <input aria-label={`Quantity of ${p.name}`} inputMode="numeric" value={l.entered_qty} onChange={e => setQty(i, Math.floor(Number(e.target.value.replace(/\D/g, '')) || 0))} className="h-8 w-10 border-x border-zinc-200 text-center text-sm tabular focus:outline-none" />
                      <button type="button" aria-label={`Increase ${p.name}`} onClick={() => setQty(i, l.entered_qty + 1)} className="grid size-8 place-items-center text-zinc-600 hover:bg-zinc-50"><Plus className="size-3.5" /></button>
                    </div>
                    <span className="w-20 text-right text-sm font-semibold tabular">{formatAmount(lineTotal(p, l))}</span>
                    <button type="button" aria-label={`Remove ${p.name}`} onClick={() => setQty(i, 0)} className="text-zinc-400 hover:text-red-600"><Trash2 className="size-4" /></button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="space-y-4 border-t border-zinc-100 px-5 py-4">
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Payment method">
              {PAY_OPTIONS.map(o => (
                <button key={o.value} type="button" role="radio" aria-checked={method === o.value} onClick={() => setMethod(o.value)}
                  className={cx('flex flex-col items-center gap-1 rounded-lg border py-2 text-xs font-medium transition', method === o.value ? 'border-ink bg-ink text-white' : 'border-zinc-200 text-zinc-700 hover:border-zinc-300')}>
                  <o.icon className="size-4" />{o.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {canDiscount && <Field label="Discount"><MoneyInput value={discount || ''} onChange={setDiscount} placeholder="0" /></Field>}
              {cashDue > 0 && <Field label="Cash received"><MoneyInput value={tendered || ''} onChange={setTendered} placeholder="0" /></Field>}
            </div>
            {cashDue > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {[cashDue, 1000, 2000, 5000, 10000].filter((v, i, a) => v > 0 && (i === 0 || v > cashDue) && a.indexOf(v) === i).slice(0, 5).map((v, i) => (
                  <button key={v} type="button" onClick={() => setTendered(i === 0 ? v : Math.ceil(cashDue / v) * v)} className="h-7 rounded-md border border-zinc-200 px-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50">{i === 0 ? 'Exact' : formatAmount(Math.ceil(cashDue / v) * v)}</button>
                ))}
              </div>
            )}

            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between text-zinc-500"><dt>{itemCount} item{itemCount === 1 ? '' : 's'}</dt><dd className="tabular">{money(totals.subtotal)}</dd></div>
              {totals.discount > 0 && <div className="flex justify-between text-zinc-500"><dt>Discount</dt><dd className="tabular">-{money(totals.discount)}</dd></div>}
              <div className="flex justify-between pt-1 text-lg font-semibold"><dt>Total</dt><dd className="tabular">{money(totals.total)}</dd></div>
              {cashDue > 0 && tendered > 0 && (
                <div className={cx('flex justify-between font-medium', change >= 0 ? 'text-emerald-700' : 'text-red-600')}><dt>{change >= 0 ? 'Change' : 'Short'}</dt><dd className="tabular">{money(Math.abs(change))}</dd></div>
              )}
            </dl>

            <div className="flex gap-2">
              {lines.length > 0 && <Button onClick={clearCart} aria-label="Clear cart" icon={<Trash2 />} />}
              <Button variant="money" size="lg" className="flex-1" disabled={!lines.length} loading={busy} onClick={checkout}>
                Charge {money(totals.total)}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {/* Mobile checkout bar */}
      {lines.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 p-3 backdrop-blur lg:hidden">
          <Button variant="money" size="lg" className="w-full" onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth' })}>
            Review {itemCount} item{itemCount === 1 ? '' : 's'} · {money(totals.total)}
          </Button>
        </div>
      )}

      <Dialog open={showParked} onClose={() => setShowParked(false)} title="Parked sales">
        <ul className="divide-y divide-zinc-100">
          {parked.map(p => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.note}</p>
                <p className="text-xs text-zinc-500">{p.lines.length} item line(s) · {new Date(p.savedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => { const list = parked.filter(x => x.id !== p.id); setParked(list); writeParked(shop.id, list); }}>Discard</Button>
                <Button size="sm" variant="primary" onClick={() => resume(p)}>Resume</Button>
              </div>
            </li>
          ))}
        </ul>
      </Dialog>

      <Dialog
        open={!!receipt}
        onClose={() => setReceipt(null)}
        title="Sale complete"
        description={receipt?.[0]?.receipt_no ? `Receipt ${receipt[0].receipt_no}` : undefined}
        footer={<>
          <Button icon={<Printer />} onClick={() => receipt && print(<Receipt shop={shop} rows={receipt} />)}>Print receipt</Button>
          <Button variant="money" onClick={() => setReceipt(null)} data-autofocus>New sale</Button>
        </>}
      >
        {receipt && <div className="rounded-xl border border-zinc-200 bg-zinc-50 py-4"><Receipt shop={shop} rows={receipt} /></div>}
      </Dialog>
      {lines.length > 0 && <div className="h-16 lg:hidden" aria-hidden />}
      <span className="sr-only" aria-live="polite">{lines.length ? `${itemCount} items, total ${money(totals.total)}` : ''}</span>
    </div>
  );
}
