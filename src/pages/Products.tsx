import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Plus, Upload, Package, Pencil } from 'lucide-react';
import { useShop } from '@/auth/AuthProvider';
import { useAction, useProducts, useSuppliers, writeAudit } from '@/data/hooks';
import { BarcodeScannerButton } from '@/components/BarcodeScanner';
import { Badge, Button, Card, Dialog, EmptyState, Field, Input, MoneyInput, Notice, PageHeader, SearchInput, Segmented, Select, Spinner, Stat } from '@/components/ui';
import { formatDate, money } from '@/lib/format';
import { baseUnit, bulkUnit, stockStatus, unitsPerBulk } from '@/lib/sales';
import { parseCsv } from '@/lib/csv';
import { rpc, supabase } from '@/lib/supabase';
import type { Product } from '@/lib/types';

interface Draft {
  name: string; category: string; barcode: string; base_unit: string; bulk_unit: string; units_per_bulk: number;
  cost: number; price: number; bulk_price: number; low_stock: number; qty: number; expiry_date: string; preferred_supplier_id: string;
}
const emptyDraft: Draft = { name: '', category: '', barcode: '', base_unit: 'Piece', bulk_unit: 'Carton', units_per_bulk: 1, cost: 0, price: 0, bulk_price: 0, low_stock: 5, qty: 0, expiry_date: '', preferred_supplier_id: '' };
const toDraft = (p: Product): Draft => ({
  name: p.name, category: p.category || '', barcode: p.barcode || '', base_unit: baseUnit(p), bulk_unit: bulkUnit(p), units_per_bulk: unitsPerBulk(p),
  cost: Number(p.cost || 0), price: Number(p.price || 0), bulk_price: Number(p.bulk_price || 0), low_stock: Number(p.low_stock || 0), qty: Number(p.qty || 0),
  expiry_date: p.expiry_date || '', preferred_supplier_id: p.preferred_supplier_id || ''
});

export default function Products() {
  const { shop, session, profile, can, hasFeature } = useShop();
  const products = useProducts();
  const suppliers = useSuppliers(hasFeature('suppliers') && can('manage_suppliers'));
  const canEdit = can('manage_products');
  const seeMoney = can('see_money');

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [status, setStatus] = useState<'all' | 'low' | 'out'>('all');
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [importOpen, setImportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const list = products.data ?? [];
  const categories = useMemo(() => ['All', ...[...new Set(list.map(p => p.category).filter(Boolean) as string[])].sort()], [list]);
  const filtered = list.filter(p => {
    const q = search.trim().toLowerCase();
    if (category !== 'All' && p.category !== category) return false;
    if (status !== 'all' && stockStatus(p) !== status && !(status === 'low' && stockStatus(p) === 'out')) return false;
    return !q || p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.category || '').toLowerCase().includes(q);
  });
  const value = list.reduce((a, p) => a + Math.max(0, Number(p.qty)) * Number(p.cost || 0), 0);
  const lowCount = list.filter(p => stockStatus(p) === 'low').length;
  const outCount = list.filter(p => stockStatus(p) === 'out').length;

  const save = useAction(async ({ d, product }: { d: Draft; product: Product | null }) => {
    if (!d.name.trim()) throw new Error('Enter a product name.');
    if (d.price <= 0) throw new Error('Enter a selling price.');
    const extras = { category: d.category.trim() || null, bulk_price: d.bulk_price || null };
    if (!product) {
      const row = {
        shop_id: shop.id, name: d.name.trim(), qty: Math.max(0, d.qty), cost: d.cost, price: d.price, low_stock: d.low_stock,
        base_unit: d.base_unit.trim() || 'Piece', bulk_unit: d.bulk_unit.trim() || 'Carton', units_per_bulk: Math.max(1, d.units_per_bulk),
        expiry_date: d.expiry_date || null, barcode: d.barcode.trim() || null, preferred_supplier_id: d.preferred_supplier_id || null
      };
      let res = await supabase.from('products').insert({ ...row, ...extras });
      // Older databases may not have category / bulk_price columns yet.
      if (res.error && /column/i.test(res.error.message)) res = await supabase.from('products').insert(row);
      if (res.error) throw new Error(res.error.message);
      await writeAudit(shop.id, session.user.id, profile.full_name || 'Owner', 'created product', 'product', { name: row.name, opening_qty: row.qty });
      return 'Product added';
    }
    await rpc('update_product_details_v44', {
      p_product_id: product.id, p_name: d.name.trim(), p_price: d.price, p_low_stock: d.low_stock, p_preferred_supplier_id: d.preferred_supplier_id || null,
      p_cost: d.cost, p_base_unit: d.base_unit.trim() || 'Piece', p_bulk_unit: d.bulk_unit.trim() || 'Carton', p_units_per_bulk: Math.max(1, d.units_per_bulk),
      p_expiry_date: d.expiry_date || null, p_expiry_reminder_days: product.expiry_reminder_days ?? 14
    });
    if ((d.barcode.trim() || null) !== (product.barcode || null)) await rpc('update_product_barcode', { p_product_id: product.id, p_barcode: d.barcode.trim() || null });
    await supabase.from('products').update(extras).eq('id', product.id);
    return 'Product updated';
  }, { invalidate: ['products'], success: r => r });

  const importer = useAction(async (file: File) => {
    const rowsIn = parseCsv(await file.text());
    if (!rowsIn.length) throw new Error('No rows found. The first line must be a header: name,price,cost,qty,category,barcode,low_stock');
    if (rowsIn.length > 2000) throw new Error('Import at most 2,000 products at a time.');
    const payload = rowsIn.filter(r => r.name).map(r => ({
      shop_id: shop.id, name: r.name, price: Math.round(Number(r.price || 0)), cost: Math.round(Number(r.cost || 0)), qty: Number(r.qty || 0),
      low_stock: Number(r.low_stock || r.low || 0), barcode: r.barcode || null, base_unit: r.base_unit || 'Piece', bulk_unit: r.bulk_unit || 'Carton', units_per_bulk: Number(r.units_per_bulk || 1)
    }));
    if (!payload.length) throw new Error('No row has a "name" value.');
    const { error } = await supabase.from('products').insert(payload);
    if (error) throw new Error(error.message);
    await writeAudit(shop.id, session.user.id, profile.full_name || 'Owner', 'imported products', 'product', { rows: payload.length });
    return payload.length;
  }, { invalidate: ['products'], success: n => `${n} products imported` });

  function openEditor(p: Product | 'new') {
    setDraft(p === 'new' ? emptyDraft : toDraft(p));
    setEditing(p);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate({ d: draft, product: editing === 'new' ? null : editing }, { onSuccess: () => setEditing(null) });
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft(d => ({ ...d, [k]: v }));

  return (
    <>
      <PageHeader
        title="Products"
        description="Your catalogue, prices and current stock."
        actions={canEdit && <>
          <Button icon={<Upload />} onClick={() => setImportOpen(true)}>Import CSV</Button>
          <Button variant="primary" icon={<Plus />} onClick={() => openEditor('new')}>Add product</Button>
        </>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Products" value={list.length} />
        {seeMoney && <Stat label="Stock value (cost)" value={money(value)} />}
        <Stat label="Low stock" value={lowCount} tone={lowCount ? 'warn' : 'default'} />
        <Stat label="Out of stock" value={outCount} tone={outCount ? 'bad' : 'default'} />
      </div>

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-4">
          <SearchInput value={search} onChange={setSearch} placeholder="Name, barcode or category" className="min-w-0 flex-1 basis-56" />
          {categories.length > 2 && (
            <Select aria-label="Category" value={category} onChange={e => setCategory(e.target.value)} className="w-auto">
              {categories.map(c => <option key={c} value={c}>{c === 'All' ? 'All categories' : c}</option>)}
            </Select>
          )}
          <Segmented label="Stock status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All' }, { value: 'low', label: 'Low' }, { value: 'out', label: 'Out' }]} />
        </div>
        {products.isLoading ? <Spinner /> : !filtered.length ? (
          <EmptyState icon={<Package />} title={list.length ? 'No product matches' : 'No products yet'} description={list.length ? 'Try another search or filter.' : 'Add your first product to start selling.'}
            action={!list.length && canEdit && <Button variant="primary" icon={<Plus />} onClick={() => openEditor('new')}>Add product</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead><tr>
                <th className="th">Product</th><th className="th">Category</th><th className="th text-right">In stock</th>
                {seeMoney && <th className="th text-right">Cost</th>}<th className="th text-right">Price</th>{seeMoney && <th className="th text-right">Margin</th>}<th className="th" />
              </tr></thead>
              <tbody>
                {filtered.map(p => {
                  const st = stockStatus(p);
                  const margin = Number(p.price) - Number(p.cost || 0);
                  return (
                    <tr key={p.id} className="hover:bg-zinc-50/70">
                      <td className="td">
                        <p className="font-medium">{p.name}</p>
                        <p className="text-xs text-zinc-500">{p.barcode ? <span className="font-mono">{p.barcode}</span> : 'No barcode'}{p.expiry_date ? ` · Expires ${formatDate(p.expiry_date)}` : ''}</p>
                      </td>
                      <td className="td text-zinc-600">{p.category || '—'}</td>
                      <td className="td text-right">
                        <Badge tone={st === 'out' ? 'bad' : st === 'low' ? 'warn' : 'good'}>{Number(p.qty)} {baseUnit(p).toLowerCase()}</Badge>
                        {unitsPerBulk(p) > 1 && <p className="mt-0.5 text-xs text-zinc-500 tabular">{(Number(p.qty) / unitsPerBulk(p)).toFixed(1)} {bulkUnit(p).toLowerCase()}</p>}
                      </td>
                      {seeMoney && <td className="td text-right tabular text-zinc-600">{money(p.cost)}</td>}
                      <td className="td text-right font-medium tabular">{money(p.price)}</td>
                      {seeMoney && <td className="td text-right tabular"><span className={margin < 0 ? 'text-red-600' : 'text-zinc-600'}>{money(margin)}</span></td>}
                      <td className="td text-right">{canEdit && <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => openEditor(p)} aria-label={`Edit ${p.name}`}>Edit</Button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add product' : 'Edit product'}
        size="lg"
        footer={<><Button onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" type="submit" form="product-form" loading={save.isPending}>{editing === 'new' ? 'Add product' : 'Save changes'}</Button></>}
      >
        <form id="product-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><Input value={draft.name} onChange={e => set('name', e.target.value)} required autoFocus /></Field>
          <Field label="Category"><Input value={draft.category} onChange={e => set('category', e.target.value)} placeholder="e.g. Drinks" list="product-categories" /></Field>
          <datalist id="product-categories">{categories.filter(c => c !== 'All').map(c => <option key={c} value={c} />)}</datalist>
          <Field label="Barcode">
            <div className="flex gap-2"><Input value={draft.barcode} onChange={e => set('barcode', e.target.value)} placeholder="Scan or type" className="font-mono" /><BarcodeScannerButton onScan={code => set('barcode', code)} label="" /></div>
          </Field>
          <Field label="Selling price (per base unit)"><MoneyInput value={draft.price} onChange={v => set('price', v)} /></Field>
          <Field label="Cost price (per base unit)" hint="Used for profit and stock value."><MoneyInput value={draft.cost} onChange={v => set('cost', v)} /></Field>
          <Field label="Base unit" hint="How you sell one item."><Input value={draft.base_unit} onChange={e => set('base_unit', e.target.value)} placeholder="Piece, Bottle, Kg" /></Field>
          <Field label="Bulk unit" hint="How you buy in bulk."><Input value={draft.bulk_unit} onChange={e => set('bulk_unit', e.target.value)} placeholder="Carton, Crate" /></Field>
          <Field label="Base units per bulk unit"><Input type="number" min={1} value={draft.units_per_bulk} onChange={e => set('units_per_bulk', Math.max(1, Math.floor(Number(e.target.value) || 1)))} /></Field>
          <Field label="Bulk selling price" hint="Optional. Leave empty to use price × units."><MoneyInput value={draft.bulk_price || ''} onChange={v => set('bulk_price', v)} placeholder="Optional" /></Field>
          <Field label="Low-stock alert at" hint="In base units."><Input type="number" min={0} value={draft.low_stock} onChange={e => set('low_stock', Math.max(0, Number(e.target.value) || 0))} /></Field>
          <Field label="Expiry date"><Input type="date" value={draft.expiry_date} onChange={e => set('expiry_date', e.target.value)} /></Field>
          {editing === 'new' && <Field label="Opening stock" hint="Units you already have. Later changes go through Stock movements."><Input type="number" min={0} value={draft.qty} onChange={e => set('qty', Math.max(0, Number(e.target.value) || 0))} /></Field>}
          {editing !== 'new' && editing && <Notice className="sm:col-span-2">Stock quantity ({Number(editing.qty)} {baseUnit(editing).toLowerCase()}) changes only through Stock movements, so every change is recorded.</Notice>}
          {(suppliers.data?.length ?? 0) > 0 && (
            <Field label="Preferred supplier">
              <Select value={draft.preferred_supplier_id} onChange={e => set('preferred_supplier_id', e.target.value)}>
                <option value="">None</option>
                {suppliers.data!.filter(s => s.active !== false).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
          )}
        </form>
      </Dialog>

      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="Import products from CSV"
        footer={<><Button onClick={() => setImportOpen(false)}>Cancel</Button><Button variant="primary" loading={importer.isPending} onClick={() => fileRef.current?.click()}>Choose CSV file</Button></>}>
        <div className="space-y-3 text-sm text-zinc-600">
          <p>The first line must name the columns. Supported columns:</p>
          <p className="rounded-lg bg-zinc-100 p-3 font-mono text-xs">name,price,cost,qty,category,barcode,low_stock,base_unit,bulk_unit,units_per_bulk</p>
          <p>Only <b>name</b> is required. Amounts are whole Rwandan Francs.</p>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) importer.mutate(f, { onSuccess: () => setImportOpen(false) }); }} />
        </div>
      </Dialog>
    </>
  );
}
