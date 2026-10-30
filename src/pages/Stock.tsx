import { useMemo, useState, type FormEvent } from 'react';
import { ArrowDownLeft, ArrowUpRight, PackagePlus, SlidersHorizontal, ArrowLeftRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useShop } from '@/auth/AuthProvider';
import { useAction, useApprovals, useProducts, useSales, useStockAdjustments, useStockPurchases } from '@/data/hooks';
import { BarcodeScannerButton } from '@/components/BarcodeScanner';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, MoneyInput, Notice, PageHeader, Select, Spinner, Stat, cx } from '@/components/ui';
import { formatDateTime, money } from '@/lib/format';
import { baseUnit, bulkUnit, unitsPerBulk } from '@/lib/sales';
import { rows, rpc, supabase } from '@/lib/supabase';

type Kind = 'sale' | 'void' | 'received' | 'adjustment' | 'wastage';
interface Movement { id: string; at: string; kind: Kind; productId?: string | null; product: string; qty: number; by?: string | null; note?: string | null; pending?: boolean; rejected?: boolean; value?: number | null }

const KIND_LABEL: Record<Kind, string> = { sale: 'Sold', void: 'Void returned', received: 'Received', adjustment: 'Adjustment', wastage: 'Wastage' };

const ADJUST_REASONS = ['Stock count correction', 'Damaged', 'Expired', 'Theft / missing', 'Own use', 'Returned to supplier', 'Other'];

export default function Stock() {
  const { shop, can, hasFeature } = useShop();
  // Stock adjustments (and requests for them) are a Kivu Control feature in the database.
  const canAdjust = can('adjust_stock') && hasFeature('approvals');
  const products = useProducts();
  const purchases = useStockPurchases();
  const adjustments = useStockAdjustments(can('approve'));
  // Adjustments waiting for approval live in approval_requests until a manager approves them.
  const approvals = useApprovals(can('approve') && hasFeature('approvals'));
  const sales = useSales(30);
  const wastage = useQuery({
    queryKey: ['hospitality_wastage', shop.id],
    queryFn: () => rows<{ id: string; product_id: string; product_name?: string; qty: number; reason?: string; created_at: string; created_by_name?: string }>(
      supabase.from('hospitality_wastage').select('*').eq('shop_id', shop.id).order('created_at', { ascending: false }).limit(300)
    ).catch(() => []),
    enabled: can('see_money')
  });

  const [kind, setKind] = useState<'all' | Kind>('all');
  const [productFilter, setProductFilter] = useState('all');
  const [dialog, setDialog] = useState<'receive' | 'adjust' | null>(null);
  const [form, setForm] = useState({ productId: '', qty: 1, unit: 'base' as 'base' | 'bulk', totalCost: 0, reason: ADJUST_REASONS[0], note: '', direction: 'remove' as 'add' | 'remove' });

  const byId = useMemo(() => new Map((products.data ?? []).map(p => [p.id, p])), [products.data]);
  const name = (id?: string | null, fallback?: string | null) => (id && byId.get(id)?.name) || fallback || 'Unknown product';

  const movements = useMemo<Movement[]>(() => {
    const list: Movement[] = [];
    for (const s of sales.data ?? []) {
      list.push({ id: `s-${s.id}`, at: s.created_at, kind: 'sale', productId: s.product_id, product: s.product_name, qty: -Number(s.qty || 0), by: s.employee_name, note: s.receipt_no, value: Number(s.total || 0) });
      if (s.status === 'voided') list.push({ id: `v-${s.id}`, at: s.voided_at || s.created_at, kind: 'void', productId: s.product_id, product: s.product_name, qty: Number(s.qty || 0), note: s.void_reason || s.receipt_no });
    }
    for (const p of purchases.data ?? []) list.push({ id: `p-${p.id}`, at: p.created_at, kind: 'received', productId: p.product_id, product: name(p.product_id, p.product_name), qty: Number(p.qty || 0), by: p.user_name, value: p.total_cost });
    for (const a of adjustments.data ?? []) list.push({ id: `a-${a.id}`, at: a.created_at, kind: 'adjustment', productId: a.product_id, product: name(a.product_id, a.product_name), qty: Number(a.qty_delta || 0), by: a.applied_by_name && a.applied_by_name !== a.requested_by_name ? `${a.requested_by_name || 'Staff'} (approved by ${a.applied_by_name})` : a.requested_by_name || a.applied_by_name, note: a.reason });
    for (const r of approvals.data ?? []) {
      if (r.request_type !== 'stock_adjustment' || r.status === 'approved') continue;
      const p = (r.payload ?? {}) as { product?: string; qty_delta?: number };
      list.push({ id: `r-${r.id}`, at: r.created_at, kind: 'adjustment', productId: r.entity_id, product: name(r.entity_id, p.product), qty: Number(p.qty_delta || 0), by: r.requested_by_name, note: r.reason, pending: r.status === 'pending', rejected: r.status === 'rejected' });
    }
    for (const w of wastage.data ?? []) list.push({ id: `w-${w.id}`, at: w.created_at, kind: 'wastage', productId: w.product_id, product: name(w.product_id, w.product_name), qty: -Number(w.qty || 0), by: w.created_by_name, note: w.reason });
    return list.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [sales.data, purchases.data, adjustments.data, approvals.data, wastage.data, byId]);

  const filtered = movements.filter(m => (kind === 'all' || m.kind === kind) && (productFilter === 'all' || m.productId === productFilter));
  const since7 = Date.now() - 7 * 86_400_000;
  const week = movements.filter(m => new Date(m.at).getTime() >= since7 && !m.pending && !m.rejected);
  const inWeek = week.filter(m => m.qty > 0).reduce((a, m) => a + m.qty, 0);
  const outWeek = week.filter(m => m.qty < 0).reduce((a, m) => a - m.qty, 0);
  const lossWeek = week.filter(m => (m.kind === 'adjustment' && m.qty < 0) || m.kind === 'wastage').reduce((a, m) => a - m.qty, 0);

  const selected = byId.get(form.productId);
  const unitFactor = form.unit === 'bulk' && selected ? unitsPerBulk(selected) : 1;
  const baseQtyValue = Math.round(form.qty * unitFactor * 1000) / 1000;

  const receive = useAction(async () => {
    if (!selected) throw new Error('Choose a product.');
    if (!(baseQtyValue > 0)) throw new Error('Enter a quantity above zero.');
    await rpc('receive_stock', { p_product_id: selected.id, p_qty: baseQtyValue, p_total_cost: form.totalCost });
  }, { invalidate: ['products', 'stock_purchases'], success: () => `${baseQtyValue} ${selected ? baseUnit(selected).toLowerCase() : ''} received` });

  const adjust = useAction(async () => {
    if (!selected) throw new Error('Choose a product.');
    if (!(baseQtyValue > 0)) throw new Error('Enter a quantity above zero.');
    const delta = form.direction === 'add' ? baseQtyValue : -baseQtyValue;
    if (delta < 0 && -delta > Number(selected.qty)) throw new Error(`Only ${selected.qty} ${baseUnit(selected).toLowerCase()} in stock.`);
    return rpc<string>('request_or_adjust_stock', { p_product_id: selected.id, p_qty_delta: delta, p_reason: `${form.reason}${form.note.trim() ? `: ${form.note.trim()}` : ''}` });
  }, { invalidate: ['products', 'stock_adjustments', 'approval_requests'], success: r => (r === 'applied' ? 'Stock adjusted and recorded' : 'Adjustment sent for approval') });

  function open(which: 'receive' | 'adjust', productId = '') {
    setForm({ productId, qty: 1, unit: 'base', totalCost: 0, reason: ADJUST_REASONS[0], note: '', direction: 'remove' });
    setDialog(which);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    (dialog === 'receive' ? receive : adjust).mutate(undefined as never, { onSuccess: () => setDialog(null) });
  }

  const productOptions = (products.data ?? []).map(p => <option key={p.id} value={p.id}>{p.name} — {Number(p.qty)} {baseUnit(p).toLowerCase()} in stock</option>);
  const loading = products.isLoading || purchases.isLoading || adjustments.isLoading || sales.isLoading;

  return (
    <>
      <PageHeader
        title="Stock movements"
        description="Every unit in and out: sales, deliveries, corrections and losses."
        actions={<>
          {canAdjust && <Button icon={<SlidersHorizontal />} onClick={() => open('adjust')}>{can('approve') ? 'Adjust stock' : 'Request adjustment'}</Button>}
          {can('receive_stock') && <Button variant="primary" icon={<PackagePlus />} onClick={() => open('receive')}>Receive stock</Button>}
        </>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Units in · 7 days" value={inWeek.toLocaleString('en-RW')} icon={<ArrowDownLeft />} />
        <Stat label="Units out · 7 days" value={outWeek.toLocaleString('en-RW')} icon={<ArrowUpRight />} />
        <Stat label="Losses · 7 days" value={lossWeek.toLocaleString('en-RW')} hint="Removed by adjustment or wastage" tone={lossWeek ? 'bad' : 'default'} />
        <Stat label="Pending approval" value={movements.filter(m => m.pending).length} tone={movements.some(m => m.pending) ? 'warn' : 'default'} />
      </div>

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-4">
          <Select aria-label="Movement type" value={kind} onChange={e => setKind(e.target.value as typeof kind)} className="w-auto">
            <option value="all">All movements</option>
            {(Object.keys(KIND_LABEL) as Kind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </Select>
          <Select aria-label="Product" value={productFilter} onChange={e => setProductFilter(e.target.value)} className="w-auto min-w-0 max-w-xs">
            <option value="all">All products</option>
            {(products.data ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
          <span className="ml-auto text-xs text-zinc-500">Sales: last 30 days · deliveries and adjustments: latest 500</span>
        </div>
        {loading ? <Spinner /> : !filtered.length ? (
          <EmptyState icon={<ArrowLeftRight />} title="No stock movements" description="Sales, deliveries and adjustments will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead><tr><th className="th">When</th><th className="th">Type</th><th className="th">Product</th><th className="th text-right">Quantity</th><th className="th">By</th><th className="th">Details</th></tr></thead>
              <tbody>
                {filtered.slice(0, 400).map(m => {
                  const p = m.productId ? byId.get(m.productId) : undefined;
                  return (
                    <tr key={m.id} className={cx('hover:bg-zinc-50/70', m.rejected && 'opacity-50')}>
                      <td className="td whitespace-nowrap text-zinc-600">{formatDateTime(m.at)}</td>
                      <td className="td">
                        <Badge tone={m.kind === 'received' || m.kind === 'void' ? 'good' : m.kind === 'sale' ? 'neutral' : m.qty < 0 ? 'bad' : 'info'}>{KIND_LABEL[m.kind]}</Badge>
                        {m.pending && <Badge tone="warn" className="ml-1">Pending</Badge>}
                        {m.rejected && <Badge className="ml-1">Rejected</Badge>}
                      </td>
                      <td className="td font-medium">{m.product}</td>
                      <td className={cx('td text-right font-semibold tabular', m.qty > 0 ? 'text-emerald-600' : 'text-zinc-900')}>{m.qty > 0 ? '+' : ''}{m.qty} <span className="text-xs font-normal text-zinc-500">{p ? baseUnit(p).toLowerCase() : ''}</span></td>
                      <td className="td text-zinc-600">{m.by || '—'}</td>
                      <td className="td max-w-[240px] truncate text-zinc-600">{m.note || '—'}{m.value && can('see_money') && m.kind === 'received' ? ` · cost ${money(m.value)}` : ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        title={dialog === 'receive' ? 'Receive stock' : can('approve') ? 'Adjust stock' : 'Request a stock adjustment'}
        description={dialog === 'receive' ? 'Record a delivery. For supplier invoices and debts, use Suppliers.' : can('approve') ? 'Correct the quantity after a count or a loss. The reason is recorded.' : 'A manager or the owner must approve this before stock changes.'}
        footer={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant="primary" type="submit" form="stock-form" loading={receive.isPending || adjust.isPending}>{dialog === 'receive' ? 'Receive stock' : can('approve') ? 'Apply adjustment' : 'Send request'}</Button></>}
      >
        <form id="stock-form" onSubmit={submit} className="grid gap-4">
          <Field label="Product">
            <div className="flex gap-2">
              <Select value={form.productId} onChange={e => setForm(f => ({ ...f, productId: e.target.value, unit: 'base' }))} required className="min-w-0 flex-1">
                <option value="">Choose a product…</option>{productOptions}
              </Select>
              <BarcodeScannerButton label="" onScan={code => { const p = (products.data ?? []).find(x => (x.barcode || '').trim() === code); if (p) setForm(f => ({ ...f, productId: p.id })); }} />
            </div>
          </Field>
          {dialog === 'adjust' && (
            <Field label="Change">
              <Select value={form.direction} onChange={e => setForm(f => ({ ...f, direction: e.target.value as 'add' | 'remove' }))}>
                <option value="remove">Remove stock (loss, damage, count shortfall)</option>
                <option value="add">Add stock (count surplus, return from customer)</option>
              </Select>
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity"><Input type="number" min={0.001} step="any" value={form.qty} onChange={e => setForm(f => ({ ...f, qty: Number(e.target.value) }))} required /></Field>
            <Field label="Unit">
              <Select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value as 'base' | 'bulk' }))} disabled={!selected || unitsPerBulk(selected) <= 1}>
                <option value="base">{selected ? baseUnit(selected) : 'Base unit'}</option>
                {selected && unitsPerBulk(selected) > 1 && <option value="bulk">{bulkUnit(selected)} ({unitsPerBulk(selected)} {baseUnit(selected).toLowerCase()})</option>}
              </Select>
            </Field>
          </div>
          {selected && unitFactor > 1 && <p className="-mt-2 text-xs text-zinc-500">= {baseQtyValue} {baseUnit(selected).toLowerCase()}</p>}
          {dialog === 'receive' && can('see_money') && <Field label="Total cost paid" hint="Optional. Updates your stock value."><MoneyInput value={form.totalCost || ''} onChange={v => setForm(f => ({ ...f, totalCost: v }))} placeholder="0" /></Field>}
          {dialog === 'adjust' && <>
            <Field label="Reason"><Select value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>{ADJUST_REASONS.map(r => <option key={r}>{r}</option>)}</Select></Field>
            <Field label="Note"><Input value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional details" /></Field>
          </>}
          {selected && <Notice>Current stock: <b>{Number(selected.qty)} {baseUnit(selected).toLowerCase()}</b>{dialog === 'adjust' && baseQtyValue > 0 && <> → after change: <b>{Number(selected.qty) + (form.direction === 'add' ? baseQtyValue : -baseQtyValue)}</b></>}</Notice>}
        </form>
      </Dialog>
    </>
  );
}

