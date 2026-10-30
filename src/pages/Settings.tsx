import { useEffect, useState, type FormEvent } from 'react';
import { Smartphone, Monitor } from 'lucide-react';
import { useShop } from '@/auth/AuthProvider';
import { useAction, useDevices } from '@/data/hooks';
import { useFeedback } from '@/components/feedback';
import { Badge, Button, Card, EmptyState, Field, Input, PageHeader, Select, Textarea } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { rpc } from '@/lib/supabase';
import type { BusinessType } from '@/lib/types';

const BUSINESS_TYPES: { value: BusinessType; label: string }[] = [
  { value: 'retail', label: 'Shop / retail' }, { value: 'bar', label: 'Bar' }, { value: 'restaurant', label: 'Restaurant' }, { value: 'bar_restaurant', label: 'Bar & restaurant' }
];

export default function Settings() {
  const { shop, reloadShop } = useShop();
  const { prompt } = useFeedback();
  const devices = useDevices();
  const [biz, setBiz] = useState({ name: '', phone: '', footer: '', type: 'retail' as BusinessType });
  const [loc, setLoc] = useState({ province: '', district: '', sector: '', cell: '' });
  const [tax, setTax] = useState({ rate: 0, label: 'VAT', number: '' });
  const myKey = (() => { try { return localStorage.getItem('duka_device_key'); } catch { return null; } })();

  useEffect(() => {
    setBiz({ name: shop.name || '', phone: shop.phone || '', footer: shop.receipt_footer || '', type: (shop.business_type || 'retail') as BusinessType });
    setLoc({ province: shop.province || '', district: shop.district || '', sector: shop.sector || '', cell: shop.cell || '' });
    setTax({ rate: Number(shop.tax_rate || 0), label: shop.tax_label || 'VAT', number: shop.tax_number || '' });
  }, [shop]);

  const saveBiz = useAction(async () => {
    if (!biz.name.trim()) throw new Error('Enter the business name.');
    await rpc('update_shop_settings_v486', { p_name: biz.name.trim(), p_phone: biz.phone.trim() || null, p_receipt_footer: biz.footer.trim() || null, p_business_type: biz.type });
    await reloadShop();
  }, { success: 'Business details saved' });

  const saveLoc = useAction(async () => {
    await rpc('update_shop_profile_v41', { p_name: shop.name, p_province: loc.province || null, p_district: loc.district || null, p_sector: loc.sector || null, p_cell: loc.cell || null, p_language: shop.preferred_language || 'en' });
    await reloadShop();
  }, { success: 'Location saved' });

  const saveTax = useAction(async () => {
    if (tax.rate < 0 || tax.rate > 100) throw new Error('Tax rate must be between 0 and 100.');
    await rpc('update_shop_tax_settings', { p_tax_rate: tax.rate, p_tax_label: tax.label.trim() || 'VAT', p_tax_number: tax.number.trim() || null });
    await reloadShop();
  }, { success: 'Tax settings saved' });

  const revoke = useAction(async ({ id, reason }: { id: string; reason: string }) => rpc('revoke_app_device', { p_device_id: id, p_reason: reason }), { invalidate: ['app_devices'], success: 'Device signed out' });
  const restore = useAction(async (id: string) => rpc('restore_app_device', { p_device_id: id }), { invalidate: ['app_devices'], success: 'Device allowed again' });

  const submit = (fn: { mutate: (v: never) => void }) => (e: FormEvent) => { e.preventDefault(); fn.mutate(undefined as never); };

  return (
    <>
      <PageHeader title="Settings" description="Business details printed on receipts, tax and signed-in devices." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Business" description="Changing the business type to a bar or restaurant turns on Tables & orders.">
          <form className="grid gap-4" onSubmit={submit(saveBiz)}>
            <Field label="Business name"><Input value={biz.name} onChange={e => setBiz(b => ({ ...b, name: e.target.value }))} required /></Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone"><Input type="tel" value={biz.phone} onChange={e => setBiz(b => ({ ...b, phone: e.target.value }))} /></Field>
              <Field label="Business type"><Select value={biz.type} onChange={e => setBiz(b => ({ ...b, type: e.target.value as BusinessType }))}>{BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</Select></Field>
            </div>
            <Field label="Receipt footer" hint="Printed at the bottom of every receipt."><Textarea value={biz.footer} onChange={e => setBiz(b => ({ ...b, footer: e.target.value }))} placeholder="Thank you for shopping with us!" /></Field>
            <div><Button variant="primary" type="submit" loading={saveBiz.isPending}>Save business</Button></div>
          </form>
        </Card>

        <div className="grid gap-4">
          <Card title="Tax" description="Prices include tax; receipts show the tax part.">
            <form className="grid gap-4" onSubmit={submit(saveTax)}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Tax rate (%)"><Input type="number" min={0} max={100} step="0.01" value={tax.rate} onChange={e => setTax(t => ({ ...t, rate: Number(e.target.value) }))} /></Field>
                <Field label="Label"><Input value={tax.label} onChange={e => setTax(t => ({ ...t, label: e.target.value }))} /></Field>
              </div>
              <Field label="Tax number (TIN)"><Input value={tax.number} onChange={e => setTax(t => ({ ...t, number: e.target.value }))} /></Field>
              <div><Button variant="primary" type="submit" loading={saveTax.isPending}>Save tax</Button></div>
            </form>
          </Card>
          <Card title="Location">
            <form className="grid gap-4" onSubmit={submit(saveLoc)}>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Province"><Input value={loc.province} onChange={e => setLoc(l => ({ ...l, province: e.target.value }))} /></Field>
                <Field label="District"><Input value={loc.district} onChange={e => setLoc(l => ({ ...l, district: e.target.value }))} /></Field>
                <Field label="Sector"><Input value={loc.sector} onChange={e => setLoc(l => ({ ...l, sector: e.target.value }))} /></Field>
                <Field label="Cell"><Input value={loc.cell} onChange={e => setLoc(l => ({ ...l, cell: e.target.value }))} /></Field>
              </div>
              <div><Button variant="primary" type="submit" loading={saveLoc.isPending}>Save location</Button></div>
            </form>
          </Card>
        </div>
      </div>

      <Card title="Signed-in devices" description="Phones and computers that have used your shop. Sign out a lost device or one a former employee used." className="mt-4" bodyClassName="p-0">
        {!(devices.data ?? []).length ? <EmptyState title="No devices recorded yet" /> : (
          <ul className="divide-y divide-zinc-100">
            {(devices.data ?? []).map(d => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                {/phone/i.test(d.device_label || '') ? <Smartphone className="size-4 text-zinc-400" /> : <Monitor className="size-4 text-zinc-400" />}
                <div className="min-w-0 flex-1"><p className="text-sm font-medium">{d.device_label || 'Device'}{d.device_key === myKey && <Badge tone="info" className="ml-2">This device</Badge>}</p><p className="text-xs text-zinc-500">Last seen {formatDateTime(d.last_seen)}</p></div>
                {d.revoked_at ? <><Badge tone="bad">Signed out</Badge><Button size="sm" onClick={() => restore.mutate(d.id)}>Allow again</Button></>
                  : d.device_key !== myKey && <Button size="sm" variant="subtle-danger" onClick={async () => { const reason = await prompt({ title: 'Sign out this device', label: 'Reason', placeholder: 'Lost phone, staff left…', required: true, confirmLabel: 'Sign out device' }); if (reason) revoke.mutate({ id: d.id, reason }); }}>Sign out</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
