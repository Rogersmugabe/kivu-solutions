import { useMemo, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Send, Receipt as ReceiptIcon, ChefHat, Trash2, Gift, BookOpen, UtensilsCrossed, Check } from 'lucide-react';
import { useShop } from '@/auth/AuthProvider';
import { useAction, useProducts, useTabItems, useTables, useTabs } from '@/data/hooks';
import { useFeedback } from '@/components/feedback';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, MoneyInput, Notice, PageHeader, Segmented, Select, Spinner, Stat, cx } from '@/components/ui';
import { formatTime, money } from '@/lib/format';
import { rows, rpc, supabase } from '@/lib/supabase';
import type { HospitalityItem, HospitalityTab } from '@/lib/types';

const PAY_METHODS = ['Cash', 'Mobile Money', 'Bank'];
const tabTotal = (items: HospitalityItem[]) => items.reduce((a, i) => a + (i.complimentary ? 0 : Number(i.qty) * Number(i.unit_price)), 0);

export default function Tables() {
  const { shop, role } = useShop();
  const { prompt } = useFeedback();
  const tables = useTables();
  const tabs = useTabs();
  const items = useTabItems();
  const products = useProducts();
  const isManager = role === 'owner' || role === 'manager';
  const canTakeOrders = role !== 'kitchen';
  const canSettle = role === 'owner' || role === 'manager' || role === 'cashier';
  const [view, setView] = useState<'floor' | 'kitchen'>(role === 'kitchen' ? 'kitchen' : 'floor');
  const [openTabId, setOpenTabId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<'table' | 'tab' | 'settle' | 'wastage' | 'recipe' | null>(null);
  const [line, setLine] = useState({ productId: '', qty: 1, note: '', complimentary: false });
  const [tableForm, setTableForm] = useState({ name: '', seats: 4 });
  const [tabForm, setTabForm] = useState({ tableId: '', label: '' });
  const [payments, setPayments] = useState<{ method: string; amount: number }[]>([]);
  const [waste, setWaste] = useState({ productId: '', qty: 1, reason: '' });
  const [recipe, setRecipe] = useState<{ menuId: string; parts: { ingredient_product_id: string; qty_per_unit: number }[] }>({ menuId: '', parts: [] });

  const recipes = useQuery({
    queryKey: ['recipe_components', shop.id],
    queryFn: () => rows<{ menu_product_id: string; ingredient_product_id: string; qty_per_unit: number }>(supabase.from('recipe_components').select('*').eq('shop_id', shop.id)).catch(() => []),
    enabled: isManager
  });

  const openTabs = (tabs.data ?? []).filter(t => t.status === 'open');
  const itemsByTab = useMemo(() => {
    const m = new Map<string, HospitalityItem[]>();
    for (const i of items.data ?? []) m.set(i.tab_id, [...(m.get(i.tab_id) ?? []), i]);
    return m;
  }, [items.data]);
  const tableName = (id?: string | null) => (tables.data ?? []).find(t => t.id === id)?.name;
  const tabLabel = (t: HospitalityTab) => tableName(t.table_id) || t.label || t.customer_name || 'Counter bill';
  const current = openTabs.find(t => t.id === openTabId) ?? null;
  const currentItems = current ? itemsByTab.get(current.id) ?? [] : [];
  const tickets = (items.data ?? []).filter(i => i.sent_at && !i.served_at && openTabs.some(t => t.id === i.tab_id));
  const productName = (id: string) => (products.data ?? []).find(p => p.id === id)?.name ?? 'Item';

  const inv = ['hospitality_tabs', 'hospitality_tab_items', 'hospitality_tables', 'products', 'sales', 'approval_requests'];
  const saveTable = useAction(async () => { if (!tableForm.name.trim()) throw new Error('Name the table.'); await rpc('hospitality_save_table', { p_table_id: null, p_name: tableForm.name.trim(), p_seats: tableForm.seats || null, p_active: true }); }, { invalidate: inv, success: 'Table added' });
  const openTab = useAction(async ({ tableId, label }: { tableId: string | null; label: string | null }) => rpc<string>('hospitality_open_tab', { p_table_id: tableId, p_label: label, p_customer_name: null }), { invalidate: inv, success: 'Bill opened' });
  const addItem = useAction(async () => {
    if (!current || !line.productId || !(line.qty > 0)) throw new Error('Choose an item and a quantity.');
    if (line.complimentary && !isManager) {
      const reason = await prompt({ title: 'Request a complimentary item', label: 'Reason', required: true, confirmLabel: 'Send request' });
      if (!reason) return 'cancelled';
      await rpc('hospitality_request_complimentary', { p_tab_id: current.id, p_product_id: line.productId, p_qty: line.qty, p_note: line.note || null, p_reason: reason });
      return 'requested';
    }
    await rpc('hospitality_add_item', { p_tab_id: current.id, p_product_id: line.productId, p_qty: line.qty, p_note: line.note || null, p_complimentary: line.complimentary });
    return 'added';
  }, { invalidate: inv, success: r => (r === 'requested' ? 'Complimentary request sent for approval' : r === 'cancelled' ? 'Cancelled' : 'Added to bill') });
  const send = useAction(async (tabId: string) => rpc('hospitality_send_tab', { p_tab_id: tabId }), { invalidate: inv, success: 'Order sent to the kitchen / bar' });
  const served = useAction(async (itemId: string) => rpc('hospitality_mark_served', { p_item_id: itemId }), { invalidate: inv, success: 'Marked as served' });
  const settle = useAction(async () => {
    if (!current) return;
    const due = tabTotal(currentItems);
    const paid = payments.reduce((a, p) => a + p.amount, 0);
    if (paid !== due) throw new Error(`Payments (${money(paid)}) must equal the bill (${money(due)}).`);
    await rpc('hospitality_close_tab', { p_tab_id: current.id, p_payments: payments.filter(p => p.amount > 0) });
  }, { invalidate: inv, success: 'Bill closed and recorded as a sale' });
  const recordWaste = useAction(async () => { if (!waste.productId || !(waste.qty > 0) || !waste.reason.trim()) throw new Error('Choose the item, quantity and reason.'); await rpc('hospitality_record_wastage', { p_product_id: waste.productId, p_qty: waste.qty, p_reason: waste.reason.trim() }); }, { invalidate: ['products', 'hospitality_wastage'], success: 'Wastage recorded and stock reduced' });
  const saveRecipe = useAction(async () => { if (!recipe.menuId) throw new Error('Choose the menu item.'); await rpc('hospitality_replace_recipe', { p_menu_product_id: recipe.menuId, p_components: recipe.parts.filter(p => p.ingredient_product_id && p.qty_per_unit > 0) }); }, { invalidate: ['recipe_components'], success: 'Recipe saved' });

  function loadRecipe(menuId: string) {
    setRecipe({ menuId, parts: (recipes.data ?? []).filter(r => r.menu_product_id === menuId).map(r => ({ ingredient_product_id: r.ingredient_product_id, qty_per_unit: Number(r.qty_per_unit) })) });
  }

  if (tables.isLoading || tabs.isLoading) return <Spinner />;
  const occupied = new Set(openTabs.map(t => t.table_id).filter(Boolean));

  return (
    <>
      <PageHeader
        title="Tables & orders"
        description="Open bills, send orders to the kitchen or bar, and settle when guests pay."
        actions={<>
          {role !== 'kitchen' && role !== 'waiter' && <Segmented label="View" value={view} onChange={setView} options={[{ value: 'floor', label: 'Floor' }, { value: 'kitchen', label: `Kitchen (${tickets.length})` }]} />}
          {isManager && <Button icon={<BookOpen />} onClick={() => { setRecipe({ menuId: '', parts: [] }); setDialog('recipe'); }}>Recipes</Button>}
          {isManager && <Button icon={<Trash2 />} onClick={() => { setWaste({ productId: '', qty: 1, reason: '' }); setDialog('wastage'); }}>Wastage</Button>}
          {isManager && <Button icon={<Plus />} onClick={() => { setTableForm({ name: '', seats: 4 }); setDialog('table'); }}>Add table</Button>}
          {canTakeOrders && <Button variant="primary" icon={<Plus />} onClick={() => { setTabForm({ tableId: '', label: '' }); setDialog('tab'); }}>Open bill</Button>}
        </>}
      />

      {view === 'kitchen' ? (
        <Card title="Kitchen & bar queue" description="Orders sent and not yet served" bodyClassName="p-0">
          {!tickets.length ? <EmptyState icon={<ChefHat />} title="No pending orders" /> : (
            <ul className="divide-y divide-zinc-100">
              {tickets.map(i => {
                const t = openTabs.find(x => x.id === i.tab_id);
                return (
                  <li key={i.id} className="flex items-center gap-4 px-5 py-3.5">
                    <span className="grid size-10 place-items-center rounded-lg bg-zinc-900 text-sm font-bold text-white tabular">{i.qty}</span>
                    <div className="min-w-0 flex-1"><p className="font-medium">{i.product_name}</p><p className="text-xs text-zinc-500">{t ? tabLabel(t) : 'Bill'} · sent {formatTime(i.sent_at)}{i.note ? ` · ${i.note}` : ''}</p></div>
                    <Button variant="primary" icon={<Check />} loading={served.isPending && served.variables === i.id} onClick={() => served.mutate(i.id)}>Served</Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat label="Open bills" value={openTabs.length} />
            <Stat label="Value of open bills" value={money(openTabs.reduce((a, t) => a + tabTotal(itemsByTab.get(t.id) ?? []), 0))} />
            <Stat label="Tables in use" value={`${occupied.size} / ${(tables.data ?? []).filter(t => t.active !== false).length}`} />
          </div>
          {!(tables.data ?? []).length && !openTabs.length ? (
            <div className="card"><EmptyState icon={<UtensilsCrossed />} title="No tables yet" description="Add your tables, or open a bill without a table for counter and takeaway orders." /></div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {(tables.data ?? []).filter(t => t.active !== false).map(t => {
                const tab = openTabs.find(x => x.table_id === t.id);
                return (
                  <button key={t.id} type="button" disabled={!canTakeOrders && !tab}
                    onClick={() => tab ? setOpenTabId(tab.id) : openTab.mutate({ tableId: t.id, label: null }, { onSuccess: id => id && setOpenTabId(String(id)) })}
                    className={cx('card flex min-h-28 flex-col items-start justify-between p-4 text-left transition hover:shadow-md', tab ? 'border-amber-300 bg-amber-50' : 'hover:border-zinc-300')}>
                    <span className="font-semibold">{t.name}</span>
                    <span className="text-xs text-zinc-500">{t.seats ? `${t.seats} seats` : ''}</span>
                    {tab ? <span className="text-sm font-semibold tabular">{money(tabTotal(itemsByTab.get(tab.id) ?? []))}</span> : <Badge tone="good">Free</Badge>}
                  </button>
                );
              })}
              {openTabs.filter(t => !t.table_id).map(t => (
                <button key={t.id} type="button" onClick={() => setOpenTabId(t.id)} className="card flex min-h-28 flex-col items-start justify-between border-amber-300 bg-amber-50 p-4 text-left hover:shadow-md">
                  <span className="font-semibold">{tabLabel(t)}</span><span className="text-xs text-zinc-500">No table · {formatTime(t.opened_at)}</span>
                  <span className="text-sm font-semibold tabular">{money(tabTotal(itemsByTab.get(t.id) ?? []))}</span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Bill */}
      <Dialog open={!!current} onClose={() => setOpenTabId(null)} title={current ? tabLabel(current) : ''} description={current ? `Opened ${formatTime(current.opened_at)}${current.waiter_name ? ` by ${current.waiter_name}` : ''}` : undefined} size="lg"
        footer={current && <>
          {currentItems.some(i => !i.sent_at) && canTakeOrders && <Button icon={<Send />} loading={send.isPending} onClick={() => send.mutate(current.id)}>Send to kitchen / bar</Button>}
          {canSettle && <Button variant="money" icon={<ReceiptIcon />} disabled={!currentItems.length} onClick={() => { setPayments([{ method: 'Cash', amount: tabTotal(currentItems) }]); setDialog('settle'); }}>Settle {money(tabTotal(currentItems))}</Button>}
        </>}>
        {current && (
          <div className="space-y-4">
            {!currentItems.length ? <p className="text-sm text-zinc-500">Nothing ordered yet.</p> : (
              <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200">
                {currentItems.map(i => (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1"><p className="text-sm font-medium">{i.qty} × {i.product_name}</p><p className="text-xs text-zinc-500">{i.note || ''}{i.complimentary ? ' · complimentary' : ''}</p></div>
                    <Badge tone={i.served_at ? 'good' : i.sent_at ? 'warn' : 'neutral'}>{i.served_at ? 'Served' : i.sent_at ? 'In kitchen' : 'Not sent'}</Badge>
                    <span className="w-24 text-right text-sm font-semibold tabular">{i.complimentary ? 'Free' : money(Number(i.qty) * Number(i.unit_price))}</span>
                  </li>
                ))}
              </ul>
            )}
            {canTakeOrders && (
              <form className="grid gap-3 rounded-xl bg-zinc-50 p-4 sm:grid-cols-[minmax(0,2fr)_80px_minmax(0,1fr)_auto] sm:items-end" onSubmit={(e: FormEvent) => { e.preventDefault(); addItem.mutate(undefined as never, { onSuccess: () => setLine(l => ({ ...l, qty: 1, note: '', complimentary: false })) }); }}>
                <Field label="Item"><Select value={line.productId} onChange={e => setLine(l => ({ ...l, productId: e.target.value }))} required><option value="">Choose…</option>{(products.data ?? []).map(p => <option key={p.id} value={p.id}>{p.name} — {money(p.price)}</option>)}</Select></Field>
                <Field label="Qty"><Input type="number" min={1} value={line.qty} onChange={e => setLine(l => ({ ...l, qty: Math.max(1, Number(e.target.value) || 1) }))} /></Field>
                <Field label="Note"><Input value={line.note} onChange={e => setLine(l => ({ ...l, note: e.target.value }))} placeholder="No ice, well done…" /></Field>
                <Button variant="primary" type="submit" icon={<Plus />} loading={addItem.isPending}>Add</Button>
                <label className="flex items-center gap-2 text-[13px] text-zinc-600 sm:col-span-4"><input type="checkbox" checked={line.complimentary} onChange={e => setLine(l => ({ ...l, complimentary: e.target.checked }))} /><Gift className="size-3.5" /> Complimentary{!isManager && ' (needs approval)'}</label>
              </form>
            )}
          </div>
        )}
      </Dialog>

      <Dialog open={dialog === 'settle'} onClose={() => setDialog(null)} title="Settle bill" description={current ? `Due ${money(tabTotal(currentItems))}. Split across methods if needed.` : undefined}
        footer={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant="money" loading={settle.isPending} onClick={() => settle.mutate(undefined as never, { onSuccess: () => { setDialog(null); setOpenTabId(null); } })}>Close bill</Button></>}>
        <div className="space-y-3">
          {payments.map((p, i) => (
            <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2">
              <Field label="Method"><Select value={p.method} onChange={e => setPayments(ps => ps.map((x, idx) => (idx === i ? { ...x, method: e.target.value } : x)))}>{PAY_METHODS.map(m => <option key={m}>{m}</option>)}</Select></Field>
              <Field label="Amount"><MoneyInput value={p.amount} onChange={v => setPayments(ps => ps.map((x, idx) => (idx === i ? { ...x, amount: v } : x)))} /></Field>
              <Button variant="ghost" icon={<Trash2 />} aria-label="Remove payment" disabled={payments.length === 1} onClick={() => setPayments(ps => ps.filter((_, idx) => idx !== i))} />
            </div>
          ))}
          <Button size="sm" icon={<Plus />} onClick={() => setPayments(ps => [...ps, { method: 'Mobile Money', amount: 0 }])}>Add payment method</Button>
          {current && payments.reduce((a, p) => a + p.amount, 0) !== tabTotal(currentItems) && <Notice tone="warn">Payments total {money(payments.reduce((a, p) => a + p.amount, 0))}; the bill is {money(tabTotal(currentItems))}.</Notice>}
        </div>
      </Dialog>

      <Dialog open={dialog === 'tab'} onClose={() => setDialog(null)} title="Open a bill"
        footer={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant="primary" loading={openTab.isPending} onClick={() => openTab.mutate({ tableId: tabForm.tableId || null, label: tabForm.label.trim() || null }, { onSuccess: id => { setDialog(null); if (id) setOpenTabId(String(id)); } })}>Open bill</Button></>}>
        <div className="grid gap-4">
          <Field label="Table"><Select value={tabForm.tableId} onChange={e => setTabForm(f => ({ ...f, tableId: e.target.value }))}><option value="">No table (counter / takeaway)</option>{(tables.data ?? []).filter(t => t.active !== false && !occupied.has(t.id)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></Field>
          <Field label="Label" hint="Optional, e.g. a guest name."><Input value={tabForm.label} onChange={e => setTabForm(f => ({ ...f, label: e.target.value }))} /></Field>
        </div>
      </Dialog>

      <Dialog open={dialog === 'table'} onClose={() => setDialog(null)} title="Add a table"
        footer={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant="primary" loading={saveTable.isPending} onClick={() => saveTable.mutate(undefined as never, { onSuccess: () => setDialog(null) })}>Add table</Button></>}>
        <div className="grid grid-cols-[minmax(0,1fr)_100px] gap-3">
          <Field label="Name"><Input value={tableForm.name} onChange={e => setTableForm(f => ({ ...f, name: e.target.value }))} placeholder="Table 5, Terrace…" autoFocus /></Field>
          <Field label="Seats"><Input type="number" min={1} value={tableForm.seats} onChange={e => setTableForm(f => ({ ...f, seats: Number(e.target.value) }))} /></Field>
        </div>
      </Dialog>

      <Dialog open={dialog === 'wastage'} onClose={() => setDialog(null)} title="Record wastage" description="Spills, breakages or spoiled stock. Stock is reduced and the loss recorded."
        footer={<><Button onClick={() => setDialog(null)}>Cancel</Button><Button variant="primary" loading={recordWaste.isPending} onClick={() => recordWaste.mutate(undefined as never, { onSuccess: () => setDialog(null) })}>Record wastage</Button></>}>
        <div className="grid gap-4">
          <Field label="Item"><Select value={waste.productId} onChange={e => setWaste(w => ({ ...w, productId: e.target.value }))}><option value="">Choose…</option>{(products.data ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          <Field label="Quantity"><Input type="number" min={0.001} step="any" value={waste.qty} onChange={e => setWaste(w => ({ ...w, qty: Number(e.target.value) }))} /></Field>
          <Field label="Reason"><Input value={waste.reason} onChange={e => setWaste(w => ({ ...w, reason: e.target.value }))} placeholder="Broken bottle, expired…" /></Field>
        </div>
      </Dialog>

      <Dialog open={dialog === 'recipe'} onClose={() => setDialog(null)} title="Recipes" description="Ingredients used each time a menu item is sold, so stock goes down automatically." size="lg"
        footer={<><Button onClick={() => setDialog(null)}>Close</Button><Button variant="primary" disabled={!recipe.menuId} loading={saveRecipe.isPending} onClick={() => saveRecipe.mutate(undefined as never)}>Save recipe</Button></>}>
        <div className="grid gap-4">
          <Field label="Menu item"><Select value={recipe.menuId} onChange={e => loadRecipe(e.target.value)}><option value="">Choose…</option>{(products.data ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
          {recipe.menuId && <>
            {recipe.parts.map((part, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_120px_auto] items-end gap-2">
                <Field label="Ingredient"><Select value={part.ingredient_product_id} onChange={e => setRecipe(r => ({ ...r, parts: r.parts.map((x, idx) => (idx === i ? { ...x, ingredient_product_id: e.target.value } : x)) }))}><option value="">Choose…</option>{(products.data ?? []).filter(p => p.id !== recipe.menuId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</Select></Field>
                <Field label="Qty per item"><Input type="number" min={0.001} step="any" value={part.qty_per_unit} onChange={e => setRecipe(r => ({ ...r, parts: r.parts.map((x, idx) => (idx === i ? { ...x, qty_per_unit: Number(e.target.value) } : x)) }))} /></Field>
                <Button variant="ghost" icon={<Trash2 />} aria-label="Remove ingredient" onClick={() => setRecipe(r => ({ ...r, parts: r.parts.filter((_, idx) => idx !== i) }))} />
              </div>
            ))}
            <Button size="sm" icon={<Plus />} onClick={() => setRecipe(r => ({ ...r, parts: [...r.parts, { ingredient_product_id: '', qty_per_unit: 1 }] }))}>Add ingredient</Button>
            {!recipe.parts.length && <p className="text-xs text-zinc-500">No ingredients: selling {productName(recipe.menuId)} reduces its own stock.</p>}
          </>}
        </div>
      </Dialog>
    </>
  );
}
