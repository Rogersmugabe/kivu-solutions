import { useMemo } from 'react';
import { ShieldCheck, Check, X, History } from 'lucide-react';
import { useShop } from '@/auth/AuthProvider';
import { useAction, useApprovals, useAuditLogs, useSales, useShifts, useStockAdjustments } from '@/data/hooks';
import { Badge, Button, Card, EmptyState, PageHeader, Spinner, Stat } from '@/components/ui';
import { businessDay, formatDateTime, money } from '@/lib/format';
import { rpc } from '@/lib/supabase';
import type { ApprovalRequest } from '@/lib/types';

const TYPE_LABEL: Record<string, string> = {
  sale_void: 'Void a sale', stock_adjustment: 'Stock adjustment', cash_variance_review: 'Cash difference at shift close', hospitality_complimentary: 'Complimentary item'
};

/** One line describing what the request would change, from the payload the database stored. */
function requestDetail(a: ApprovalRequest): string {
  const p = (a.payload ?? {}) as Record<string, unknown>;
  if (a.request_type === 'sale_void') return [p.product, p.receipt_no, p.amount != null ? money(p.amount) : null].filter(Boolean).join(' · ');
  if (a.request_type === 'stock_adjustment') return `${p.product ?? 'Product'} · ${Number(p.qty_delta) > 0 ? '+' : ''}${p.qty_delta} (was ${p.qty_before})`;
  if (a.request_type === 'cash_variance_review') return `Expected ${money(p.expected_cash)} · counted ${money(p.actual_cash)} · difference ${money(p.difference)}`;
  if (a.request_type === 'hospitality_complimentary') return `${p.qty ?? ''} × ${p.product_name ?? p.product ?? 'item'}`;
  return '';
}

export default function Approvals() {
  const { can, hasFeature } = useShop();
  const approvals = useApprovals();
  const sales = useSales(30);
  const adjustments = useStockAdjustments();
  const shifts = useShifts();
  const audit = useAuditLogs(hasFeature('audit'));

  const review = useAction(async ({ id, decision }: { id: string; decision: 'approved' | 'rejected' }) => rpc('review_control_request', { p_request_id: id, p_decision: decision }),
    { invalidate: ['approval_requests', 'sales', 'products', 'stock_adjustments'], success: 'Decision saved' });

  const pending = (approvals.data ?? []).filter(a => a.status === 'pending');
  const today = businessDay(new Date());

  const exceptions = useMemo(() => {
    const list: { at: string; title: string; detail: string; tone: 'bad' | 'warn' | 'info' }[] = [];
    for (const s of sales.data ?? []) if (s.status === 'voided') list.push({ at: s.voided_at || s.created_at, title: `Voided · ${s.product_name}`, detail: `${money(s.total)} · ${s.receipt_no || ''} · ${s.void_reason || 'No reason'}`, tone: 'bad' });
    for (const a of adjustments.data ?? []) if (Number(a.qty_delta) < 0) list.push({ at: a.created_at, title: `Stock removed · ${a.product_name || 'product'}`, detail: `${a.qty_delta} · ${a.reason || 'No reason'}${a.applied_by_name ? ` · by ${a.applied_by_name}` : ''}`, tone: 'warn' });
    for (const s of shifts.data ?? []) if (s.status === 'closed' && Number(s.difference || 0) !== 0) list.push({ at: s.closed_at || s.opened_at, title: `Cash ${Number(s.difference) < 0 ? 'short' : 'over'} · ${s.employee_name || 'Staff'}`, detail: `${money(s.difference)} · ${s.variance_reason || 'No reason given'}`, tone: Number(s.difference) < 0 ? 'bad' : 'info' });
    return list.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 40);
  }, [sales.data, adjustments.data, shifts.data]);

  const voidsToday = (sales.data ?? []).filter(s => s.status === 'voided' && businessDay(s.voided_at || s.created_at) === today).length;
  const varianceToday = (shifts.data ?? []).filter(s => s.status === 'closed' && businessDay(s.closed_at || s.opened_at) === today).reduce((a, s) => a + Math.abs(Number(s.difference || 0)), 0);

  return (
    <>
      <PageHeader title="Approvals & activity" description="Requests from staff waiting for a decision, and everything unusual that happened." />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Stat label="Waiting for approval" value={pending.length} tone={pending.length ? 'warn' : 'default'} />
        <Stat label="Voids today" value={voidsToday} tone={voidsToday ? 'bad' : 'default'} />
        <Stat label="Cash differences today" value={money(varianceToday)} tone={varianceToday ? 'bad' : 'default'} />
      </div>

      <Card title="Waiting for approval" className="mb-4" bodyClassName="p-0">
        {approvals.isLoading ? <Spinner /> : !pending.length ? <EmptyState icon={<ShieldCheck />} title="Nothing to approve" description="Void and stock-adjustment requests from staff appear here." /> : (
          <ul className="divide-y divide-zinc-100">
            {pending.map(a => (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{TYPE_LABEL[a.request_type] ?? a.request_type.replaceAll('_', ' ')}{requestDetail(a) && <span className="font-normal text-zinc-600"> — {requestDetail(a)}</span>}</p>
                  <p className="text-xs text-zinc-500">{a.requested_by_name || 'Staff'} · {formatDateTime(a.created_at)}{a.reason ? ` · ${a.reason}` : ''}</p>
                </div>
                {can('approve') && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="subtle-danger" icon={<X />} loading={review.isPending && review.variables?.id === a.id && review.variables.decision === 'rejected'} onClick={() => review.mutate({ id: a.id, decision: 'rejected' })}>Reject</Button>
                    <Button size="sm" variant="primary" icon={<Check />} loading={review.isPending && review.variables?.id === a.id && review.variables.decision === 'approved'} onClick={() => review.mutate({ id: a.id, decision: 'approved' })}>Approve</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Exceptions" description="Voids, stock removals and cash differences" bodyClassName="p-0">
          {!exceptions.length ? <EmptyState title="No exceptions recorded" /> : (
            <ul className="divide-y divide-zinc-100">
              {exceptions.map((x, i) => (
                <li key={i} className="flex items-start gap-3 px-5 py-3">
                  <Badge tone={x.tone}>{x.tone === 'bad' ? 'Alert' : x.tone === 'warn' ? 'Check' : 'Info'}</Badge>
                  <div className="min-w-0 flex-1"><p className="text-sm font-medium">{x.title}</p><p className="truncate text-xs text-zinc-500">{formatDateTime(x.at)} · {x.detail}</p></div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Audit log" description={hasFeature('audit') ? 'Latest actions by your team' : 'Included in Kivu Control'} bodyClassName="p-0">
          {!hasFeature('audit') ? <EmptyState icon={<History />} title="Audit log needs Kivu Control" /> : !(audit.data ?? []).length ? <EmptyState title="No actions recorded yet" /> : (
            <ul className="divide-y divide-zinc-100">
              {(audit.data ?? []).slice(0, 40).map(l => (
                <li key={l.id} className="px-5 py-3"><p className="text-sm"><b className="font-medium">{l.user_name || 'Someone'}</b> {l.action}</p><p className="text-xs text-zinc-500">{formatDateTime(l.created_at)}{l.entity ? ` · ${l.entity}` : ''}</p></li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
