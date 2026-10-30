// Row shapes as stored in the existing Supabase database. Optional fields exist on
// some shops/versions only, so code must tolerate them being absent.

export type Role = 'owner' | 'manager' | 'cashier' | 'stock_clerk' | 'waiter' | 'kitchen';
export type BusinessType = 'retail' | 'bar' | 'restaurant' | 'bar_restaurant';
export type PlanKey = 'basic' | 'one_time' | 'business' | 'control' | 'pro';

export interface Shop {
  id: string;
  name: string;
  plan?: PlanKey | null;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  current_period_end?: string | null;
  grace_ends_at?: string | null;
  platform_suspended?: boolean | null;
  business_type?: BusinessType | null;
  phone?: string | null;
  receipt_footer?: string | null;
  tax_rate?: number | null;
  tax_label?: string | null;
  tax_number?: string | null;
  province?: string | null;
  district?: string | null;
  sector?: string | null;
  cell?: string | null;
  preferred_language?: string | null;
}

export interface Profile { id: string; shop_id: string; role: Role; full_name?: string | null }

/** employees.role holds a display label ('Cashier', 'Stock Clerk'…); use employeeRole() for the key. */
export interface Employee { id: string; shop_id: string; user_id: string | null; name: string; phone?: string | null; role: string; active: boolean }

export interface StaffInvite { id: string; employee_name: string; phone: string; role: Role; code: string; expires_at: string; used_at?: string | null; created_at: string }

export interface Product {
  id: string;
  shop_id: string;
  name: string;
  category?: string | null;
  qty: number;
  cost: number;
  price: number;
  low_stock: number;
  base_unit?: string | null;
  bulk_unit?: string | null;
  units_per_bulk?: number | null;
  barcode?: string | null;
  preferred_supplier_id?: string | null;
  expiry_date?: string | null;
  expiry_reminder_days?: number | null;
}

export interface Sale {
  id: string;
  shop_id: string;
  receipt_no?: string | null;
  product_id?: string | null;
  product_name: string;
  qty: number;
  entered_qty?: number | null;
  sold_unit?: string | null;
  total: number;
  cost?: number | null;
  discount?: number | null;
  payment?: string | null;
  customer?: string | null;
  status?: string | null;
  void_reason?: string | null;
  voided_at?: string | null;
  created_at: string;
  user_id?: string | null;
  employee_name?: string | null;
  shift_id?: string | null;
  client_ref?: string | null;
}

export interface Expense { id: string; description: string; amount: number; category?: string | null; created_at: string; user_id?: string | null; shift_id?: string | null; approval_status?: string | null; employee_name?: string | null }

export interface HospitalityPayment { id: string; tab_id: string; method: string; amount: number; shift_id?: string | null; created_at: string }

export interface StockPurchase { id: string; product_id: string; product_name?: string | null; qty: number; total_cost?: number | null; created_at: string; user_name?: string | null }

export interface StockAdjustment { id: string; product_id: string; product_name?: string | null; qty_before?: number | null; qty_delta: number; qty_after?: number | null; reason?: string | null; created_at: string; requested_by_name?: string | null; applied_by_name?: string | null }

export interface ApprovalRequest { id: string; request_type: string; entity_id?: string | null; status: string; reason?: string | null; payload?: Record<string, unknown> | null; requested_by_name?: string | null; reviewed_by_name?: string | null; created_at: string }

export interface Supplier { id: string; name: string; phone?: string | null; address?: string | null; notes?: string | null; active?: boolean | null }

export interface SupplierPurchase { id: string; supplier_id: string; total_amount: number; paid_amount: number; balance_due: number; status?: string | null; invoice_no?: string | null; due_date?: string | null; note?: string | null; created_at: string }

export interface SupplierPayment { id: string; supplier_id: string; amount: number; payment_method?: string | null; note?: string | null; created_at: string }

export interface Shift {
  id: string;
  user_id: string;
  employee_name?: string | null;
  opening_cash: number;
  status: 'open' | 'closed' | string;
  opened_at: string;
  closed_at?: string | null;
  actual_cash?: number | null;
  expected_cash?: number | null;
  difference?: number | null;
  variance_reason?: string | null;
}

export interface AuditLog { id: string; user_name?: string | null; action: string; entity?: string | null; details?: Record<string, unknown> | null; created_at: string }

export interface AppDevice { id: string; device_key: string; device_label?: string | null; last_seen?: string | null; revoked_at?: string | null }

export interface HospitalityTable { id: string; name: string; seats?: number | null; active?: boolean | null }
export interface HospitalityTab { id: string; table_id?: string | null; label?: string | null; customer_name?: string | null; status: string; waiter_name?: string | null; opened_at: string; closed_at?: string | null; total?: number | null; receipt_no?: string | null }
export interface HospitalityItem { id: string; tab_id: string; product_id?: string | null; product_name: string; qty: number; unit_price: number; note?: string | null; complimentary?: boolean | null; sent_at?: string | null; served_at?: string | null; created_at: string; created_by_name?: string | null }
