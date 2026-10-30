import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PostgrestError } from '@supabase/supabase-js';
import { rows, supabase } from '@/lib/supabase';
import { useShop } from '@/auth/AuthProvider';
import { useFeedback } from '@/components/feedback';
import type {
  ApprovalRequest, AppDevice, AuditLog, Employee, Expense, HospitalityItem, HospitalityPayment, HospitalityTab, HospitalityTable,
  Product, Sale, Shift, StaffInvite, StockAdjustment, StockPurchase, Supplier, SupplierPayment, SupplierPurchase
} from '@/lib/types';

/** ISO timestamp for the start of the business day `days` ago (approximate is fine for range queries). */
export const sinceDays = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

type Select = PromiseLike<{ data: unknown; error: PostgrestError | null }>;

function useShopQuery<T>(key: string, enabled: boolean, fn: (shopId: string) => Select, extraKey: unknown[] = []) {
  const { shop } = useShop();
  return useQuery<T[]>({
    queryKey: [key, shop.id, ...extraKey],
    queryFn: () => rows<T>(fn(shop.id) as PromiseLike<{ data: T[] | null; error: PostgrestError | null }>),
    enabled
  });
}

export const useProducts = () =>
  useShopQuery<Product>('products', true, id => supabase.from('products').select('*').eq('shop_id', id).order('name'));

export const useSales = (days = 30) =>
  useShopQuery<Sale>('sales', true, id => supabase.from('sales').select('*').eq('shop_id', id).gte('created_at', sinceDays(days)).order('created_at', { ascending: false }).limit(5000), [days]);

export const useExpenses = (days = 30, enabled = true) =>
  useShopQuery<Expense>('expenses', enabled, id => supabase.from('expenses').select('*').eq('shop_id', id).gte('created_at', sinceDays(days)).order('created_at', { ascending: false }).limit(2000), [days]);

export const useStockPurchases = (enabled = true) =>
  useShopQuery<StockPurchase>('stock_purchases', enabled, id => supabase.from('stock_purchases').select('*').eq('shop_id', id).order('created_at', { ascending: false }).limit(500));

export const useStockAdjustments = (enabled = true) =>
  useShopQuery<StockAdjustment>('stock_adjustments', enabled, id => supabase.from('stock_adjustments').select('*').eq('shop_id', id).order('created_at', { ascending: false }).limit(500));

export const useSuppliers = (enabled = true) =>
  useShopQuery<Supplier>('suppliers', enabled, id => supabase.from('suppliers').select('*').eq('shop_id', id).order('name'));

export const useSupplierPurchases = (enabled = true) =>
  useShopQuery<SupplierPurchase>('supplier_purchases', enabled, id => supabase.from('supplier_purchases').select('*').eq('shop_id', id).order('created_at', { ascending: false }).limit(1000));

export const useSupplierPayments = (enabled = true) =>
  useShopQuery<SupplierPayment>('supplier_payments', enabled, id => supabase.from('supplier_payments').select('*').eq('shop_id', id).order('created_at', { ascending: false }).limit(1000));

export const useEmployees = (enabled = true) =>
  useShopQuery<Employee>('employees', enabled, id => supabase.from('employees').select('*').eq('shop_id', id).order('name'));

export const useStaffInvites = (enabled = true) =>
  useShopQuery<StaffInvite>('staff_invites', enabled, id => supabase.from('staff_invites').select('*').eq('shop_id', id).order('created_at', { ascending: false }));

export const useShifts = (enabled = true) =>
  useShopQuery<Shift>('shifts', enabled, id => supabase.from('shifts').select('*').eq('shop_id', id).order('opened_at', { ascending: false }).limit(200));

export const useApprovals = (enabled = true) =>
  useShopQuery<ApprovalRequest>('approval_requests', enabled, id => supabase.from('approval_requests').select('*').eq('shop_id', id).order('created_at', { ascending: false }).limit(200));

export const useAuditLogs = (enabled = true) =>
  useShopQuery<AuditLog>('audit_logs', enabled, id => supabase.from('audit_logs').select('*').eq('shop_id', id).order('created_at', { ascending: false }).limit(200));

export const useDevices = (enabled = true) =>
  useShopQuery<AppDevice>('app_devices', enabled, id => supabase.from('app_devices').select('*').eq('shop_id', id).order('last_seen', { ascending: false }));

export const useTables = (enabled = true) =>
  useShopQuery<HospitalityTable>('hospitality_tables', enabled, id => supabase.from('hospitality_tables').select('*').eq('shop_id', id).order('name'));

export const useTabs = (enabled = true) =>
  useShopQuery<HospitalityTab>('hospitality_tabs', enabled, id => supabase.from('hospitality_tabs').select('*').eq('shop_id', id).order('opened_at', { ascending: false }).limit(200));

export const useTabItems = (enabled = true) =>
  useShopQuery<HospitalityItem>('hospitality_tab_items', enabled, id => supabase.from('hospitality_tab_items').select('*').eq('shop_id', id).gte('created_at', sinceDays(7)).order('created_at').limit(3000));

export const useHospitalityPayments = (enabled = true) =>
  useShopQuery<HospitalityPayment>('hospitality_payments', enabled, id => supabase.from('hospitality_payments').select('*').eq('shop_id', id).gte('created_at', sinceDays(35)).order('created_at', { ascending: false }).limit(3000));

/** The current user's open cash shift, if any. */
export function useMyOpenShift(enabled = true) {
  const { session } = useShop();
  const shifts = useShifts(enabled);
  return { ...shifts, data: shifts.data?.find(s => s.status === 'open' && s.user_id === session.user.id) ?? null };
}

/** Wraps a write: shows a success / error toast and refreshes the listed data on success. */
export function useAction<TArgs, TResult = unknown>(
  fn: (args: TArgs) => Promise<TResult>,
  { invalidate = [], success }: { invalidate?: string[]; success?: string | ((r: TResult) => string) } = {}
) {
  const qc = useQueryClient();
  const { toast } = useFeedback();
  return useMutation<TResult, Error, TArgs>({
    mutationFn: fn,
    onSuccess: result => {
      for (const key of invalidate) void qc.invalidateQueries({ queryKey: [key] });
      if (success) toast('success', typeof success === 'function' ? success(result) : success);
    },
    onError: err => toast('error', 'Could not complete that', err.message)
  });
}

/** Best-effort audit trail entry (never blocks the action it describes). */
export async function writeAudit(shopId: string, userId: string, userName: string, action: string, entity: string, details: Record<string, unknown> = {}) {
  const { error } = await supabase.from('audit_logs').insert({ shop_id: shopId, user_id: userId, user_name: userName, action, entity, details });
  if (error) console.warn('Audit log not saved:', error.message);
}
