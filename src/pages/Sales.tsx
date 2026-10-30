import { useMemo, useState } from 'react';
import { Download, Printer, ReceiptText, Ban } from 'lucide-react';
import { useShop } from '@/auth/AuthProvider';
import { useAction, useSales } from '@/data/hooks';
import { useFeedback } from '@/components/feedback';
import { Receipt, usePrint } from '@/components/print';
import { Badge, Button, Card, Dialog, EmptyState, PageHeader, SearchInput, Select, Spinner, Stat } from '@/components/ui';
import { formatDateTime, money, businessDay } from '@/lib/format';
import { groupReceipts, paymentBreakdown } from '@/lib/sales';
import { downloadCsv } from '@/lib/csv';
import { rpc } from '@/lib/supabase';
import type { Sale } from '@/lib/types';

const PAGE_SIZE = 25;

export default function Sales() {
  const { shop, can, hasFeature } = useShop();
  // The database only allows voids (and void requests) on Kivu Control or higher.
  const canVoid = can('void_sale') && hasFeature('approvals');
  const { prompt } = useFeedback();
  const print = usePrint();
  const [days, setDays] = useState(7);
  const [payment, setPayment] = useState('all');
  const [status, setStatus] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const sales = useSales(days);

  const voidLine = useAction(
    async ({ sale, reason }: { sale: Sale; reason: string }) => rpc<string>('request_or_void_sale', { p_sale_id: sale.id, p_reason: reason }),
    { invalidate: ['sales', 'products', 'approval_requests'], success: r => (r === 'voided' ? 'Sale line voided and stock restored' : 'Void request sent for approval') }
  );

  const receipts = useMemo(() => groupReceipts(sales.data ?? []), [sales.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return receipts.filter(r => {
      const first = r.rows[0];
      if (status === 'completed' && r.voided) return false;
      if (status === 'voided' && !r.rows.some(x => x.status === 'voided')) return false;
      if (payment !== 'all' && !(first.payment || 'Cash').toLowerCase().includes(payment.toLowerCase())) return false;
      if (q && !r.rows.some(x => [x.receipt_no, x.product_name, x.employee_name, x.payment].some(v => (v || '').toLowerCase().includes(q)))) return false;
      return true;
    });
  }, [receipts, search, status, payment]);

  const totals = useMemo(() => {
    const live = (sales.data ?? []).filter(s => s.status !== 'voided');
    const t = { total: 0, cash: 0, momo: 0, bank: 0 };
    const groups = new Map(receipts.map(r => [r.key, r.rows]));
    for (const s of live) { const b = paymentBreakdown(s, groups.get(s.receipt_no || s.id)); t.total += Number(s.total || 0); t.cash += b.cash; t.momo += b.momo; t.bank += b.bank; }
    return t;
  }, [sales.data, receipts]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const visible = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  const open = receipts.find(r => r.key === openKey) ?? null;

  async function requestVoid(sale: Sale) {
    const reason = await prompt({ title: can('approve') ? 'Void this line' : 'Request a void', label: 'Reason', placeholder: 'e.g. Wrong item scanned', required: true, confirmLabel: can('approve') ? 'Void line' : 'Send request' });
    if (reason) voidLine.mutate({ sale, reason });
  }

  function exportCsv() {
    downloadCsv(`kivu-sales-${businessDay(new Date())}.csv`, (sales.data ?? []).map(s => ({
      date: formatDateTime(s.created_at), receipt: s.receipt_no, product: s.product_name, quantity: s.entered_qty ?? s.qty, unit: s.sold_unit,
      total: s.total, discount: s.discount, cost: s.cost, payment: s.payment, status: s.status || 'completed', staff: s.employee_name
    })));
  }

  return (
    <>
      <PageHeader
        title="Sales"
        description="Every receipt, who sold it and how it was paid."
        actions={<Button icon={<Download />} onClick={exportCsv} disabled={!sales.data?.length}>Export CSV</Button>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Sales · ${days === 1 ? 'today' : `last ${days} days`}`} value={money(totals.total)} />
        <Stat label="Cash" value={money(totals.cash)} />
        <Stat label="Mobile Money" value={money(totals.momo)} />
        <Stat label="Bank" value={money(totals.bank)} />
      </div>

      <Card bodyClassName="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-zinc-100 p-4">
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Receipt, product or staff" className="min-w-0 flex-1 basis-56" />
          <Select aria-label="Period" value={days} onChange={e => { setDays(Number(e.target.value)); setPage(1); }} className="w-auto">
            <option value={1}>Today</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
          </Select>
          <Select aria-label="Payment method" value={payment} onChange={e => { setPayment(e.target.value); setPage(1); }} className="w-auto">
            <option value="all">All payments</option><option value="Cash">Cash</option><option value="Mobile Money">Mobile Money</option><option value="Bank">Bank</option><option value="Split">Split</option>
          </Select>
          <Select aria-label="Status" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="w-auto">
            <option value="all">All statuses</option><option value="completed">Completed</option><option value="voided">With voids</option>
          </Select>
        </div>

        {sales.isLoading ? <Spinner /> : !visible.length ? (
          <EmptyState icon={<ReceiptText />} title="No receipts found" description="Try another period or clear the filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead><tr><th className="th">Date</th><th className="th">Receipt</th><th className="th">Items</th><th className="th">Payment</th><th className="th">Staff</th><th className="th text-right">Total</th><th className="th" /></tr></thead>
              <tbody>
                {visible.map(r => (
                  <tr key={r.key} className="hover:bg-zinc-50/70">
                    <td className="td whitespace-nowrap text-zinc-600">{formatDateTime(r.createdAt)}</td>
                    <td className="td"><span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs">{r.rows[0].receipt_no || '—'}</span></td>
                    <td className="td max-w-[260px] truncate">{r.rows[0].product_name}{r.rows.length > 1 && <span className="text-zinc-500"> + {r.rows.length - 1} more</span>}</td>
                    <td className="td"><Badge tone={/split/i.test(r.rows[0].payment || '') ? 'info' : 'neutral'}>{/split/i.test(r.rows[0].payment || '') ? 'Split' : r.rows[0].payment || 'Cash'}</Badge></td>
                    <td className="td text-zinc-600">{r.rows[0].employee_name || '—'}</td>
                    <td className="td text-right font-semibold tabular">{r.voided ? <Badge tone="bad">Voided</Badge> : money(r.total)}</td>
                    <td className="td text-right"><Button size="sm" variant="ghost" onClick={() => setOpenKey(r.key)}>View</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 border-t border-zinc-100 px-4 py-3 text-[13px] text-zinc-500">
            <span>{(current - 1) * PAGE_SIZE + 1}–{Math.min(current * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <div className="flex gap-2">
              <Button size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>Previous</Button>
              <Button size="sm" disabled={current >= pages} onClick={() => setPage(current + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>

      <Dialog
        open={!!open}
        onClose={() => setOpenKey(null)}
        title={`Receipt ${open?.rows[0].receipt_no || ''}`}
        description={open ? formatDateTime(open.createdAt) : undefined}
        size="lg"
        footer={open && <Button variant="primary" icon={<Printer />} onClick={() => print(<Receipt shop={shop} rows={open.rows} />)}>Print receipt</Button>}
      >
        {open && (
          <ul className="divide-y divide-zinc-100">
            {open.rows.map(line => (
              <li key={line.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{line.product_name}</p>
                  <p className="text-xs text-zinc-500">{line.entered_qty ?? line.qty} {line.sold_unit || ''} · {line.payment || 'Cash'}{line.void_reason ? ` · Void reason: ${line.void_reason}` : ''}</p>
                </div>
                <span className="text-sm font-semibold tabular">{money(line.total)}</span>
                {line.status === 'voided' ? <Badge tone="bad">Voided</Badge> : canVoid && (
                  <Button size="sm" variant="subtle-danger" icon={<Ban />} loading={voidLine.isPending && voidLine.variables?.sale.id === line.id} onClick={() => requestVoid(line)}>
                    {can('approve') ? 'Void' : 'Request void'}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Dialog>
    </>
  );
}
