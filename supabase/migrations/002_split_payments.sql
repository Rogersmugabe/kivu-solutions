-- ============================================================================
-- KIVU 002 — Split payments (part cash, part Mobile Money / bank)
-- Run once in Supabase → SQL Editor, after 001. Safe to run again.
--
-- How it works (same pattern the database already uses for bar / restaurant bills):
--   * record_sale_cart_v60() records the sale through the existing record_sale_cart_v45(),
--     so prices, stock checks, discount rules and shift linking are exactly the same.
--   * It then checks, on the server, that the payment parts add up to the sale total,
--     marks the receipt's lines as payment 'Split' and stores each part in sale_payments.
--     If the parts do not match, the whole sale is rolled back — nothing is recorded.
--   * client_ref makes retries (offline sync) safe, like record_sale_cart_v48().
--   * close_shift_controlled() now counts the cash part of split sales in the drawer,
--     reduced in proportion when lines of the receipt are voided.
-- ============================================================================

create table if not exists public.sale_payments (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  receipt_no  text not null,
  method      text not null check (method in ('Cash', 'Mobile Money', 'Bank')),
  amount      numeric not null check (amount > 0),
  shift_id    uuid references public.shifts(id) on delete set null,
  created_by  uuid,
  created_at  timestamptz not null default now()
);
create index if not exists sale_payments_shop_receipt_idx on public.sale_payments (shop_id, receipt_no);
create index if not exists sale_payments_shift_idx on public.sale_payments (shift_id);

alter table public.sale_payments enable row level security;
drop policy if exists "sale payments read" on public.sale_payments;
-- Same visibility as sales: owners and managers see all, other staff see their own.
create policy "sale payments read" on public.sale_payments for select using (
  public.account_access_allowed() and shop_id = public.current_shop_id()
  and (public.current_role() in ('owner', 'manager') or created_by = auth.uid())
);
-- No insert / update / delete policies: rows are written only by record_sale_cart_v60().

create or replace function public.record_sale_cart_v60(p_items jsonb, p_payments jsonb, p_discount numeric default 0, p_client_ref text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_shop    uuid := public.current_shop_id();
  v_ref     text := nullif(trim(coalesce(p_client_ref, '')), '');
  v_receipt text;
  v_total   numeric;
  v_paid    numeric := 0;
  v_shift   uuid;
  v_pay     jsonb;
  v_method  text;
  v_amount  numeric;
  v_methods int;
begin
  if v_uid is null or v_shop is null then raise exception 'Not authenticated'; end if;
  if not public.account_access_allowed() then raise exception 'Kivu Solutions access is not active'; end if;
  if public.current_role() not in ('owner', 'manager', 'cashier') then raise exception 'Your role cannot record retail sales'; end if;
  if p_payments is null or jsonb_typeof(p_payments) <> 'array' or jsonb_array_length(p_payments) = 0 then
    raise exception 'Add at least one payment';
  end if;

  for v_pay in select * from jsonb_array_elements(p_payments) loop
    v_method := v_pay ->> 'method';
    v_amount := (v_pay ->> 'amount')::numeric;
    if v_method not in ('Cash', 'Mobile Money', 'Bank') then raise exception 'Invalid payment method: %', v_method; end if;
    if v_amount is null or v_amount <= 0 then raise exception 'Every payment amount must be greater than zero'; end if;
    v_paid := v_paid + v_amount;
  end loop;
  select count(distinct value ->> 'method') into v_methods from jsonb_array_elements(p_payments);

  -- Retries with the same reference return the original receipt instead of selling twice.
  if v_ref is null then v_ref := gen_random_uuid()::text; end if;
  if length(v_ref) > 120 then raise exception 'Invalid offline sale reference'; end if;
  perform pg_advisory_xact_lock(hashtext(v_shop::text || ':' || v_ref));
  select receipt_no into v_receipt from public.offline_sale_sync where shop_id = v_shop and client_ref = v_ref;
  if v_receipt is not null then return v_receipt; end if;

  if v_methods = 1 then
    -- One method only: an ordinary sale.
    v_receipt := public.record_sale_cart_v45(p_items, (p_payments -> 0 ->> 'method'), p_discount, null, null);
    select coalesce(sum(total), 0) into v_total from public.sales where shop_id = v_shop and receipt_no = v_receipt;
    if abs(v_paid - v_total) > 0.01 then raise exception 'Payments (%) must equal the sale total (%)', v_paid, v_total; end if;
  else
    -- Record with a placeholder method, then verify the parts against the server-computed total.
    v_receipt := public.record_sale_cart_v45(p_items, 'Cash', p_discount, null, null);
    select coalesce(sum(total), 0) into v_total from public.sales where shop_id = v_shop and receipt_no = v_receipt;
    if abs(v_paid - v_total) > 0.01 then raise exception 'Payments (%) must equal the sale total (%)', v_paid, v_total; end if;

    update public.sales set payment = 'Split' where shop_id = v_shop and receipt_no = v_receipt;
    select shift_id into v_shift from public.sales where shop_id = v_shop and receipt_no = v_receipt limit 1;
    for v_pay in select * from jsonb_array_elements(p_payments) loop
      insert into public.sale_payments (shop_id, receipt_no, method, amount, shift_id, created_by)
      values (v_shop, v_receipt, v_pay ->> 'method', (v_pay ->> 'amount')::numeric, v_shift, v_uid);
    end loop;

    insert into public.audit_logs (shop_id, user_id, user_name, action, entity, details)
    values (v_shop, v_uid, public.current_full_name(), 'recorded split payment', 'sale',
            jsonb_build_object('receipt_no', v_receipt, 'total', v_total, 'payments', p_payments));
  end if;

  insert into public.offline_sale_sync (shop_id, client_ref, receipt_no, created_by) values (v_shop, v_ref, v_receipt, v_uid);
  return v_receipt;
end;
$$;

grant execute on function public.record_sale_cart_v60(jsonb, jsonb, numeric, text) to authenticated;

-- ----------------------------------------------------------------------------
-- close_shift_controlled: unchanged except that the cash part of split sales
-- (v_scash) now counts toward the expected drawer.
-- ----------------------------------------------------------------------------
create or replace function public.close_shift_controlled(p_shift_id uuid, p_actual_cash numeric, p_variance_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_shop uuid := public.current_shop_id(); v_role text := public.current_role(); v_name text := public.current_full_name();
  v_shift public.shifts%rowtype; v_cash numeric := 0; v_scash numeric := 0; v_hcash numeric := 0; v_exp numeric := 0; v_expected numeric := 0; v_diff numeric := 0; v_request uuid;
begin
  if v_uid is null or v_shop is null then raise exception 'Not authenticated'; end if;
  if not public.account_access_allowed() then raise exception 'Your Kivu subscription is not active'; end if;
  if v_role not in ('owner','manager','cashier') then raise exception 'Your role does not use cash shifts'; end if;
  if p_actual_cash is null or p_actual_cash < 0 then raise exception 'Actual cash cannot be negative'; end if;
  select * into v_shift from public.shifts where id = p_shift_id and shop_id = v_shop for update;
  if not found then raise exception 'Shift not found'; end if;
  if v_shift.status <> 'open' then raise exception 'Shift is already closed'; end if;
  if v_shift.user_id <> v_uid and v_role not in ('owner','manager') then raise exception 'You can only close your own shift'; end if;

  select coalesce(sum(total),0) into v_cash from public.sales where shop_id = v_shop and shift_id = p_shift_id and status <> 'voided' and payment = 'Cash';
  -- Cash part of split sales, scaled by the share of each receipt that was not voided.
  with r as (
    select receipt_no, sum(total) filter (where status <> 'voided') as live_total, sum(total) as all_total
    from public.sales where shop_id = v_shop and payment = 'Split'
      and receipt_no in (select receipt_no from public.sale_payments where shop_id = v_shop and shift_id = p_shift_id)
    group by receipt_no
  )
  select coalesce(round(sum(sp.amount * case when r.all_total > 0 then coalesce(r.live_total, 0) / r.all_total else 0 end)), 0)
  into v_scash
  from public.sale_payments sp join r on r.receipt_no = sp.receipt_no
  where sp.shop_id = v_shop and sp.shift_id = p_shift_id and sp.method = 'Cash';
  select coalesce(sum(amount),0) into v_hcash from public.hospitality_payments where shop_id = v_shop and shift_id = p_shift_id and method = 'Cash';
  select coalesce(sum(amount),0) into v_exp from public.expenses where shop_id = v_shop and shift_id = p_shift_id and coalesce(approval_status,'approved') <> 'rejected';

  v_expected := coalesce(v_shift.opening_cash,0) + v_cash + v_scash + v_hcash - v_exp; v_diff := p_actual_cash - v_expected;
  if abs(v_diff) > 0.001 and nullif(trim(coalesce(p_variance_reason,'')),'') is null then raise exception 'A reason is required when actual cash does not match expected cash'; end if;
  update public.shifts set status='closed', closed_at=now(), expected_cash=v_expected, actual_cash=p_actual_cash, difference=v_diff,
    variance_reason=nullif(trim(coalesce(p_variance_reason,'')),''),
    review_status=case when abs(v_diff)>0.001 and v_role='cashier' then 'pending' when abs(v_diff)>0.001 then 'reviewed' else 'not_required' end,
    reviewed_by=case when abs(v_diff)>0.001 and v_role in ('owner','manager') then v_uid else null end,
    reviewed_at=case when abs(v_diff)>0.001 and v_role in ('owner','manager') then now() else null end
  where id = p_shift_id;
  if abs(v_diff) > 0.001 and v_role = 'cashier' and public.control_plan_allowed() then
    insert into public.approval_requests(shop_id,request_type,entity_id,reason,payload,requested_by,requested_by_name)
    values(v_shop,'cash_variance_review',p_shift_id,trim(p_variance_reason),jsonb_build_object('expected_cash',v_expected,'actual_cash',p_actual_cash,'difference',v_diff),v_uid,v_name) returning id into v_request;
  end if;
  insert into public.audit_logs(shop_id,user_id,user_name,action,entity,details)
  values(v_shop,v_uid,v_name,'closed shift','shift',jsonb_build_object('shift_id',p_shift_id,'expected_cash',v_expected,'actual_cash',p_actual_cash,'difference',v_diff,'split_cash',v_scash,'hospitality_cash',v_hcash,'variance_reason',p_variance_reason,'approval_request_id',v_request));
end $$;
