import { useMemo, useState, type FormEvent } from 'react';
import { Plus, Truck, Trash2, Wallet, Pencil } from 'lucide-react';
import { useShop } from '@/auth/AuthProvider';
import { useAction, useProducts, useSupplierPayments, useSupplierPurchases, useSuppliers, writeAudit } from '@/data/hooks';
import { useFeedback } from '@/components/feedback';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, MoneyInput, PageHeader, Segmented, Select, Spinner, Stat, Textarea } from '@/components/ui';
import { formatDate, formatDateTime, money } from '@/lib/format';
import { baseUnit, bulkUnit, unitsPerBulk } from '@/lib/sales';
import { rpc, supabase } from '@/lib/supabase';
import type { Supplier } from '@/lib/types';

interface Line { product_id: string; entered_qty: number; unit_mode: 'base' | 'bulk'; entered_unit_cost: number; expiry_date: string }
const newLine = (): Line => ({ product_id: '', entered_qty: 1, unit_mode: 'base', entered_unit_cost: 0, expiry_date: '' });
const METHODS = ['Cash', 'Mobile Money', 'Bank'];

export default function Suppliers() {
  const { shop, session, profile } = useShop();
  const { confirm } = useFeedback();
  const suppliers = useSuppliers();
  const purchases = useSupplierPurchases();
  const payments = useSupplierPayments();
  const products = useProducts();
  const [tab, setTab] = useState<'suppliers' | 'purchases' | 'payments'>('suppliers');
  const [editing, setEditing] = useState<Supplier | 'new' | null>(null);
  const [sForm, setSForm] = useState({ name: '', phone: '', address: '', notes: '' });
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [pForm, setPForm] = useState({ supplierId: '', lines: [newLine()], paid: 0, method: 'Cash', invoice: '', due: '', note: '' });
  const [paying, setPaying] = useState<Supplier | null>(null);
  const [payForm, setPayForm] = useState({ amount: 0, method: 'Cash', note: '' });

  const productMap = useMemo(() => new Map((products.data ?? []).map(p => [p.id, p])), [products.data]);
  const supplierName = (id: string) => suppliers.data?.find(s => s.id === id)?.name ?? 'Supplier';
  const balance = (id: string) => (purchases.data ?? []).filter(p => p.supplier_id === id).reduce((a, p) => a + Number(p.balance_due || 0), 0);
  const totalOwed = (purchases.data ?? []).reduce((a, p) => a + Number(p.balance_due || 0), 0);
  const active = (suppliers.data ?? []).filter(s => s.active !== false);
  const purchaseTotal = pForm.lines.reduce((a, l) => a + Math.round(l.entered_qty * l.entered_unit_cost), 0);

  const saveSupplier = useAction(async () => {
    if (!sForm.name.trim()) throw new Error('Enter the supplier name.');
    if (editing === 'new') {
      const { error } = await supabase.from('suppliers').insert({ shop_id: shop.id, name: sForm.name.trim(), phone: sForm.phone.trim() || null, address: sForm.address.trim() || null, notes: sForm.notes.trim() || null });
      if (error) throw new Error(error.message);
      await writeAudit(shop.id, session.user.id, profile.full_name || 'Owner', 'created supplier', 'supplier', { name: sForm.name.trim() });
    } else if (editing) {
      await rpc('update_supplier_details', { p_supplier_id: editing.id, p_name: sForm.name.trim(), p_phone: sForm.phone.trim() || null, p_address: sForm.address.trim() || null, p_notes: sForm.notes.trim() || null });
    }
  }, { invalidate: ['suppliers'], success: 'Supplier saved' });

  const removeSupplier = useAction(async (s: Supplier) => rpc('remove_supplier_safe', { p_supplier_id: s.id }), { invalidate: ['suppliers'], success: 'Supplier removed' });

  const savePurchase = useAction(async () => {
    if (!pForm.supplierId) throw new Error('Choose a supplier.');
    const items = pForm.lines.filter(l => l.product_id);
    if (!items.length || items.some(l => !(l.entered_qty > 0) || l.entered_unit_cost < 0)) throw new Error('Check every line: product, quantity above zero and a cost.');
    if (purchaseTotal <= 0) throw new Error('The purchase total must be above zero.');
    if (pForm.paid > purchaseTotal) throw new Error('Amount paid cannot be more than the purchase total.');
    await rpc('record_supplier_purchase_v44', {
      p_supplier_id: pForm.supplierId, p_items: items.map(l => ({ ...l, expiry_date: l.expiry_date || null })), p_amount_paid: pForm.paid,
      p_payment_method: pForm.method, p_invoice_no: pForm.invoice.trim() || null, p_due_date: pForm.due || null, p_note: pForm.note.trim() || null
    });
  }, { invalidate: ['supplier_purchases', 'products', 'stock_purchases'], success: 'Purchase recorded and stock added' });

  const pay = useAction(async () => {
    if (!paying) return;
    if (!(payForm.amount > 0)) throw new Error('Enter an amount.');
    if (payForm.amount > balance(paying.id)) throw new Error(`You owe ${paying.name} ${money(balance(paying.id))}.`);
    await rpc('record_supplier_payment', { p_supplier_id: paying.id, p_amount: payForm.amount, p_payment_method: payForm.method, p_note: payForm.note.trim() || null });
  }, { invalidate: ['supplier_payments', 'supplier_purchases'], success: 'Payment recorded' });

  function openSupplier(s: Supplier | 'new') {
    setSForm(s === 'new' ? { name: '', phone: '', address: '', notes: '' } : { name: s.name, phone: s.phone || '', address: s.address || '', notes: s.notes || '' });
    setEditing(s);
  }
  const setLine = (i: number, patch: Partial<Line>) => setPForm(f => ({ ...f, lines: f.lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)) }));

  const loading = suppliers.isLoading || purchases.isLoading;

  return (
    <>
      <PageHeader
        title="Suppliers & purchases"
        description="Who you buy from, what you received and what you still owe."
        actions={<>
          <Button icon={<Plus />} onClick={() => openSupplier('new')}>Add supplier</Button>
          <Button variant="primary" icon={<Truck />} onClick={() => { setPForm({ supplierId: active[0]?.id ?? '', lines: [newLine()], paid: 0, method: 'Cash', invoice: '', due: '', note: '' }); setPurchaseOpen(true); }} disabled={!active.length}>Record purchase</Button>
        </>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Total owed to suppliers" value={money(totalOwed)} tone={totalOwed ? 'bad' : 'default'} />
        <Stat label="Suppliers owed" value={active.filter(s => balance(s.id) > 0).length} />
        <Stat label="Purchases · 30 days" value={money((purchases.data ?? []).filter(p => Date.now() - new Date(p.created_at).getTime() < 30 * 86_400_000).reduce((a, p) => a + Number(p.total_amount || 0), 0))} />
      </div>

      <div className="mb-3"><Segmented label="View" value={tab} onChange={setTab} options={[{ value: 'suppliers', label: 'Suppliers' }, { value: 'purchases', label: 'Purchases' }, { value: 'payments', label: 'Payments' }]} /></div>

      <Card bodyClassName="p-0">
        {loading ? <Spinner /> : tab === 'suppliers' ? (
          !active.length ? <EmptyState icon={<Truck />} title="No suppliers yet" description="Add the people and companies you buy stock from." action={<Button variant="primary" icon={<Plus />} onClick={() => openSupplier('new')}>Add supplier</Button>} /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead><tr><th className="th">Supplier</th><th className="th">Phone</th><th className="th text-right">You owe</th><th className="th" /></tr></thead>
                <tbody>
                  {active.map(s => (
                    <tr key={s.id} className="hover:bg-zinc-50/70">
                      <td className="td"><p className="font-medium">{s.name}</p>{s.address && <p className="text-xs text-zinc-500">{s.address}</p>}</td>
                      <td className="td text-zinc-600">{s.phone || '—'}</td>
                      <td className="td text-right font-semibold tabular">{balance(s.id) > 0 ? <span className="text-red-600">{money(balance(s.id))}</span> : <span className="text-zinc-400">—</span>}</td>
                      <td className="td">
                        <div className="flex justify-end gap-1.5">
                          {balance(s.id) > 0 && <Button size="sm" icon={<Wallet />} onClick={() => { setPayForm({ amount: balance(s.id), method: 'Cash', note: '' }); setPaying(s); }}>Pay</Button>}
                          <Button size="sm" variant="ghost" icon={<Pencil />} aria-label={`Edit ${s.name}`} onClick={() => openSupplier(s)} />
                          <Button size="sm" variant="ghost" icon={<Trash2 />} aria-label={`Remove ${s.name}`} onClick={async () => { if (await confirm({ title: `Remove ${s.name}?`, message: 'Suppliers with purchase history are archived instead of deleted.', confirmLabel: 'Remove', danger: true })) removeSupplier.mutate(s); }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : tab === 'purchases' ? (
          !(purchases.data ?? []).length ? <EmptyState title="No purchases recorded" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead><tr><th className="th">Date</th><th className="th">Supplier</th><th className="th">Invoice</th><th className="th text-right">Total</th><th className="th text-right">Paid</th><th className="th text-right">Balance</th><th className="th">Due</th></tr></thead>
                <tbody>{(purchases.data ?? []).map(p => (
                  <tr key={p.id}>
                    <td className="td whitespace-nowrap text-zinc-600">{formatDateTime(p.created_at)}</td><td className="td font-medium">{supplierName(p.supplier_id)}</td><td className="td text-zinc-600">{p.invoice_no || '—'}</td>
                    <td className="td text-right tabular">{money(p.total_amount)}</td><td className="td text-right tabular">{money(p.paid_amount)}</td>
                    <td className="td text-right tabular">{Number(p.balance_due) > 0 ? <Badge tone="bad">{money(p.balance_due)}</Badge> : <Badge tone="good">Paid</Badge>}</td>
                    <td className="td text-zinc-600">{p.due_date ? formatDate(p.due_date) : '—'}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          !(payments.data ?? []).length ? <EmptyState title="No supplier payments yet" /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead><tr><th className="th">Date</th><th className="th">Supplier</th><th className="th">Method</th><th className="th">Note</th><th className="th text-right">Amount</th></tr></thead>
                <tbody>{(payments.data ?? []).map(p => (
                  <tr key={p.id}><td className="td whitespace-nowrap text-zinc-600">{formatDateTime(p.created_at)}</td><td className="td font-medium">{supplierName(p.supplier_id)}</td><td className="td">{p.payment_method || '—'}</td><td className="td text-zinc-600">{p.note || '—'}</td><td className="td text-right font-medium tabular">{money(p.amount)}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )
        )}
      </Card>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add supplier' : 'Edit supplier'}
        footer={<><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" type="submit" form="supplier-form" loading={saveSupplier.isPending}>Save</Button></>}>
        <form id="supplier-form" className="grid gap-4" onSubmit={(e: FormEvent) => { e.preventDefault(); saveSupplier.mutate(undefined as never, { onSuccess: () => setEditing(null) }); }}>
          <Field label="Name"><Input value={sForm.name} onChange={e => setSForm(f => ({ ...f, name: e.target.value }))} autoFocus required /></Field>
          <Field label="Phone"><Input type="tel" value={sForm.phone} onChange={e => setSForm(f => ({ ...f, phone: e.target.value }))} /></Field>
          <Field label="Address"><Input value={sForm.address} onChange={e => setSForm(f => ({ ...f, address: e.target.value }))} /></Field>
          <Field label="Notes"><Textarea value={sForm.notes} onChange={e => setSForm(f => ({ ...f, notes: e.target.value }))} /></Field>
        </form>
      </Dialog>

      <Dialog open={purchaseOpen} onClose={() => setPurchaseOpen(false)} title="Record a supplier purchase" description="Stock is added automatically. Anything not paid becomes a balance you owe." size="xl"
        footer={<><span className="mr-auto self-center text-sm">Total <b className="tabular">{money(purchaseTotal)}</b></span><Button onClick={() => setPurchaseOpen(false)}>Cancel</Button><Button variant="primary" type="submit" form="purchase-form" loading={savePurchase.isPending}>Save purchase</Button></>}>
        <form id="purchase-form" className="grid gap-4" onSubmit={(e: FormEvent) => { e.preventDefault(); savePurchase.mutate(undefined as never, { onSuccess: () => setPurchaseOpen(false) }); }}>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Supplier"><Select value={pForm.supplierId} onChange={e => setPForm(f => ({ ...f, supplierId: e.target.value }))} required>{active.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Invoice number"><Input value={pForm.invoice} onChange={e => setPForm(f => ({ ...f, invoice: e.target.value }))} placeholder="Optional" /></Field>
            <Field label="Payment due"><Input type="date" value={pForm.due} onChange={e => setPForm(f => ({ ...f, due: e.target.value }))} /></Field>
          </div>
          <div className="space-y-2">
            {pForm.lines.map((l, i) => {
              const p = productMap.get(l.product_id);
              return (
                <div key={i} className="grid gap-2 rounded-xl border border-zinc-200 p-3 sm:grid-cols-[minmax(0,2fr)_90px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
                  <Field label="Product"><Select value={l.product_id} onChange={e => setLine(i, { product_id: e.target.value, unit_mode: 'base' })} required><option value="">Choose…</option>{(products.data ?? []).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</Select></Field>
                  <Field label="Qty"><Input type="number" min={0.001} step="any" value={l.entered_qty} onChange={e => setLine(i, { entered_qty: Number(e.target.value) })} /></Field>
                  <Field label="Unit"><Select value={l.unit_mode} onChange={e => setLine(i, { unit_mode: e.target.value as Line['unit_mode'] })} disabled={!p || unitsPerBulk(p) <= 1}>
                    <option value="base">{p ? baseUnit(p) : 'Base unit'}</option>{p && unitsPerBulk(p) > 1 && <option value="bulk">{bulkUnit(p)} ({unitsPerBulk(p)})</option>}
                  </Select></Field>
                  <Field label="Cost per unit"><MoneyInput value={l.entered_unit_cost || ''} onChange={v => setLine(i, { entered_unit_cost: v })} placeholder="0" /></Field>
                  <Field label="Expiry"><Input type="date" value={l.expiry_date} onChange={e => setLine(i, { expiry_date: e.target.value })} /></Field>
                  <Button variant="ghost" icon={<Trash2 />} aria-label="Remove line" disabled={pForm.lines.length === 1} onClick={() => setPForm(f => ({ ...f, lines: f.lines.filter((_, idx) => idx !== i) }))} />
                </div>
              );
            })}
            <Button size="sm" icon={<Plus />} onClick={() => setPForm(f => ({ ...f, lines: [...f.lines, newLine()] }))}>Add line</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Amount paid now" hint={`Balance owed: ${money(Math.max(0, purchaseTotal - pForm.paid))}`}><MoneyInput value={pForm.paid || ''} onChange={v => setPForm(f => ({ ...f, paid: v }))} placeholder="0" /></Field>
            <Field label="Paid with"><Select value={pForm.method} onChange={e => setPForm(f => ({ ...f, method: e.target.value }))}>{METHODS.map(m => <option key={m}>{m}</option>)}</Select></Field>
            <Field label="Note"><Input value={pForm.note} onChange={e => setPForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional" /></Field>
          </div>
        </form>
      </Dialog>

      <Dialog open={!!paying} onClose={() => setPaying(null)} title={`Pay ${paying?.name ?? ''}`} description={paying ? `You owe ${money(balance(paying.id))}.` : undefined}
        footer={<><Button onClick={() => setPaying(null)}>Cancel</Button><Button variant="primary" type="submit" form="pay-form" loading={pay.isPending}>Record payment</Button></>}>
        <form id="pay-form" className="grid gap-4" onSubmit={(e: FormEvent) => { e.preventDefault(); pay.mutate(undefined as never, { onSuccess: () => setPaying(null) }); }}>
          <Field label="Amount"><MoneyInput value={payForm.amount} onChange={v => setPayForm(f => ({ ...f, amount: v }))} /></Field>
          <Field label="Paid with"><Select value={payForm.method} onChange={e => setPayForm(f => ({ ...f, method: e.target.value }))}>{METHODS.map(m => <option key={m}>{m}</option>)}</Select></Field>
          <Field label="Note"><Input value={payForm.note} onChange={e => setPayForm(f => ({ ...f, note: e.target.value }))} placeholder="Optional" /></Field>
        </form>
      </Dialog>
    </>
  );
}
