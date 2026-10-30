/* DEVELOPMENT ONLY — never included in production builds (loaded behind import.meta.env.DEV).
   Answers Supabase requests with sample data so every page and role can be tested locally
   without touching a real database. Open the dev server with ?mock (optionally
   &role=cashier|manager|stock_clerk|waiter|kitchen and &type=bar). */
import { SUPABASE_URL } from '@/config';

const params = new URLSearchParams(location.search);
const role = params.get('role') || 'owner';
const businessType = params.get('type') || 'retail';
const now = Date.now(), H = 3_600_000, D = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();
const uid = 'u-owner';
const shopId = 'shop-demo';

const P = (id: string, name: string, category: string, qty: number, cost: number, price: number, low: number, extra: Record<string, unknown> = {}) =>
  ({ id, shop_id: shopId, name, category, qty, cost, price, low_stock: low, base_unit: 'Piece', bulk_unit: 'Crate', units_per_bulk: 12, barcode: `6001${id.slice(-3)}`, ...extra });

const db: Record<string, Record<string, unknown>[]> = {
  shops: [{ id: shopId, name: 'Demo Mini Market', plan: 'control', subscription_status: 'active', current_period_end: iso(now + 20 * D), business_type: businessType, phone: '+250788000000', receipt_footer: 'Murakoze!', tax_rate: 18, tax_label: 'VAT', tax_number: '100200300' }],
  profiles: [{ id: uid, shop_id: shopId, role, full_name: role === 'owner' ? 'Aline Uwase' : `Demo ${role}` }],
  employees: [
    // The real employees.role column stores labels like 'Cashier' and 'Stock Clerk'.
    { id: 'e1', shop_id: shopId, user_id: 'u-cash', name: 'Eric Cashier', phone: '+250788555666', role: 'Cashier', active: true },
    { id: 'e2', shop_id: shopId, user_id: 'u-mgr', name: 'Grace Manager', phone: '+250788777888', role: 'Manager', active: true },
    { id: 'e4', shop_id: shopId, user_id: 'u-clerk', name: 'Jean Stock', phone: '+250788444333', role: 'Stock Clerk', active: false }
  ],
  staff_invites: [{ id: 'i1', shop_id: shopId, employee_name: 'New Hire', phone: '+250788123123', role: 'cashier', code: 'KV7M9X', expires_at: iso(now + 10 * D), created_at: iso(now - D) }],
  products: [
    P('p-001', 'Primus 72cl', 'Drinks', 140, 700, 1000, 48), P('p-002', 'Mutzig 50cl', 'Drinks', 12, 800, 1200, 24),
    P('p-003', 'Inyange Water 1L', 'Drinks', 0, 350, 600, 20), P('p-004', 'Rice 5kg', 'Groceries', 34, 6000, 7500, 10, { units_per_bulk: 1 }),
    P('p-005', 'Sugar 1kg', 'Groceries', 8, 1300, 1600, 10, { units_per_bulk: 1 }), P('p-006', 'Brochette', 'Kitchen', 60, 600, 1500, 15, { units_per_bulk: 1 }),
    P('p-007', 'Chips portion', 'Kitchen', 45, 400, 1000, 10, { units_per_bulk: 1 }), P('p-008', 'Fanta 30cl', 'Drinks', 96, 350, 600, 24)
  ],
  sales: [], expenses: [
    { id: 'x1', shop_id: shopId, description: 'Electricity token', amount: 15000, category: 'Utilities', created_at: iso(now - 2 * H), user_id: uid },
    { id: 'x2', shop_id: shopId, description: 'Transport', amount: 4000, category: 'Transport', created_at: iso(now - D), user_id: uid }
  ],
  stock_purchases: [{ id: 'sp1', shop_id: shopId, product_id: 'p-001', qty: 48, total_cost: 33600, created_at: iso(now - 3 * D), user_name: 'Aline Uwase' }],
  stock_adjustments: [{ id: 'sa1', shop_id: shopId, product_id: 'p-005', product_name: 'Sugar 1kg', qty_before: 10, qty_delta: -2, qty_after: 8, reason: 'Damaged: bag torn', created_at: iso(now - 2 * D), requested_by_name: 'Jean Stock', applied_by_name: 'Aline Uwase' }],
  approval_requests: [
    { id: 'ar1', shop_id: shopId, request_type: 'sale_void', entity_id: 's-0-1', status: 'pending', reason: 'Wrong item scanned', payload: { product: 'Mutzig 50cl', receipt_no: 'KV-1002', amount: 2400 }, requested_by_name: 'Eric Cashier', created_at: iso(now - H) },
    { id: 'ar2', shop_id: shopId, request_type: 'stock_adjustment', entity_id: 'p-002', status: 'pending', reason: 'Stock count correction: 2 missing', payload: { product: 'Mutzig 50cl', qty_delta: -2, qty_before: 12 }, requested_by_name: 'Jean Stock', created_at: iso(now - 3 * H) }
  ],
  suppliers: [{ id: 'su1', shop_id: shopId, name: 'Bralirwa Depot', phone: '+250788000111', address: 'Kicukiro', active: true }],
  supplier_purchases: [{ id: 'pu1', shop_id: shopId, supplier_id: 'su1', total_amount: 168000, paid_amount: 100000, balance_due: 68000, invoice_no: 'INV-22', due_date: iso(now + 7 * D).slice(0, 10), created_at: iso(now - 4 * D) }],
  supplier_payments: [],
  shifts: [
    { id: 'sh1', shop_id: shopId, user_id: uid, employee_name: 'Demo user', opening_cash: 20000, status: 'open', opened_at: iso(now - 6 * H) },
    { id: 'sh0', shop_id: shopId, user_id: 'u-cash', employee_name: 'Eric Cashier', opening_cash: 15000, status: 'closed', opened_at: iso(now - 30 * H), closed_at: iso(now - 20 * H), actual_cash: 64000, expected_cash: 65000, difference: -1000, variance_reason: 'Change error' }
  ],
  audit_logs: [{ id: 'a1', shop_id: shopId, user_name: 'Aline Uwase', action: 'created product', entity: 'product', created_at: iso(now - 5 * H) }],
  app_devices: [{ id: 'd1', shop_id: shopId, device_key: 'other', device_label: 'Phone · Android', last_seen: iso(now - 2 * H) }],
  shop_feature_flags: [],
  hospitality_tables: [{ id: 't1', shop_id: shopId, name: 'Table 1', seats: 4, active: true }, { id: 't2', shop_id: shopId, name: 'Terrace', seats: 6, active: true }],
  hospitality_tabs: [{ id: 'tab1', shop_id: shopId, table_id: 't1', status: 'open', waiter_name: 'Patrick', opened_at: iso(now - 2 * H) }],
  hospitality_tab_items: [
    { id: 'hi1', shop_id: shopId, tab_id: 'tab1', product_name: 'Brochette', qty: 2, unit_price: 1500, sent_at: iso(now - H), created_at: iso(now - H) },
    { id: 'hi2', shop_id: shopId, tab_id: 'tab1', product_name: 'Primus 72cl', qty: 3, unit_price: 1000, created_at: iso(now - H) }
  ],
  recipe_components: [], hospitality_wastage: [], hospitality_payments: []
};

const pays = ['Cash', 'Mobile Money', 'Cash', 'Bank', 'Split (Cash 1000, MoMo 800)'];
let receipt = 1000;
for (let d = 0; d < 14; d++) for (let k = 0; k < 3 + (d % 4); k++) {
  const p = db.products[(d + k) % db.products.length] as { id: string; name: string; price: number; cost: number };
  const qty = 1 + ((d + k) % 3);
  db.sales.push({ id: `s-${d}-${k}`, shop_id: shopId, receipt_no: `KV-${++receipt}`, product_id: p.id, product_name: p.name, qty, entered_qty: qty, sold_unit: 'Piece', total: qty * p.price, cost: qty * p.cost, discount: 0, payment: pays[(d + k) % pays.length], status: d === 2 && k === 0 ? 'voided' : 'completed', void_reason: d === 2 && k === 0 ? 'Customer changed mind' : null, created_at: iso(now - d * D - k * 2 * H - 30 * 60_000), user_id: uid, employee_name: 'Aline Uwase', shift_id: d === 0 ? 'sh1' : null });
}

export const mockCalls: { kind: string; name: string; body?: unknown }[] = [];
(window as unknown as { __mockCalls: typeof mockCalls; __mockDb: typeof db }).__mockCalls = mockCalls;
(window as unknown as { __mockDb: typeof db }).__mockDb = db;

const rpcAnswers: Record<string, (body: Record<string, unknown>) => unknown> = {
  is_duka_admin: () => false,
  register_app_device: () => ({ revoked: false }),
  create_staff_invite: () => 'NEW123',
  request_or_void_sale: () => (role === 'owner' || role === 'manager' ? 'voided' : 'requested'),
  request_or_adjust_stock: () => (role === 'owner' || role === 'manager' ? 'applied' : 'requested'),
  hospitality_open_tab: () => 'tab-new',
  record_sale_cart_v48: body => {
    const no = `KV-${++receipt}`;
    for (const it of body.p_items as { product_id: string; entered_qty: number; line_total: number }[]) {
      const p = db.products.find(x => x.id === it.product_id) as { name: string; qty: number } | undefined;
      if (p) p.qty -= it.entered_qty;
      db.sales.unshift({ id: `new-${no}-${it.product_id}`, shop_id: shopId, receipt_no: no, product_id: it.product_id, product_name: p?.name ?? 'Item', qty: it.entered_qty, entered_qty: it.entered_qty, total: it.line_total, cost: 0, payment: body.p_payment, status: 'completed', created_at: new Date().toISOString(), employee_name: 'Demo user', user_id: uid, shift_id: 'sh1' });
    }
    return no;
  }
};

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

// Signed-in session so the app opens straight into the shop.
const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0];
const user = { id: uid, aud: 'authenticated', email: 'owner@example.test', user_metadata: {}, app_metadata: {}, created_at: iso(now) };
localStorage.setItem(`sb-${projectRef}-auth-token`, JSON.stringify({ access_token: 'mock', token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: Math.floor(now / 1000) + 3600 * 24 * 365, refresh_token: 'mock', user }));

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (!url.href.startsWith(SUPABASE_URL)) return realFetch(input, init);
  const method = (init?.method || 'GET').toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : {};
  if (url.pathname.startsWith('/auth/v1/')) return json(url.pathname.endsWith('/user') ? user : {});
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    const name = url.pathname.split('/').pop()!;
    mockCalls.push({ kind: 'rpc', name, body });
    // Lets the UI's error path be tested: an invite for a name containing "fail" is refused.
    if (name === 'create_staff_invite' && /fail/i.test(String(body.p_employee_name))) return json({ code: '42883', message: 'function gen_random_bytes(integer) does not exist', details: null, hint: 'No function matches the given name and argument types.' }, 404);
    return json(rpcAnswers[name]?.(body) ?? null);
  }
  const table = url.pathname.replace('/rest/v1/', '');
  mockCalls.push({ kind: method, name: table, body: method === 'GET' ? undefined : body });
  if (method !== 'GET') return json([], 201);
  let rowsOut = [...(db[table] ?? [])];
  for (const [k, v] of url.searchParams) {
    if (v.startsWith('eq.') && k !== 'shop_id') rowsOut = rowsOut.filter(r => String(r[k]) === v.slice(3));
    if (v.startsWith('gte.')) rowsOut = rowsOut.filter(r => String(r[k]) >= decodeURIComponent(v.slice(4)));
  }
  const accept = new Headers(init?.headers).get('Accept') || '';
  if (accept.includes('vnd.pgrst.object')) return rowsOut[0] ? json(rowsOut[0]) : json({ message: 'No rows' }, 406);
  return json(rowsOut);
};
console.info('%cKivu mock backend active — no real database is used.', 'color:#059669;font-weight:bold');
