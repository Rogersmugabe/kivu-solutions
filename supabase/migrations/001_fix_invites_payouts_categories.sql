-- ============================================================================
-- KIVU 001 — Fix staff invites, link owner pay-outs to shifts, add product categories
-- Run once in Supabase → SQL Editor. Safe to run again.
--
-- Why invites failed: public.staff_invites.created_by is NOT NULL with no default,
-- but create_staff_invite() never set it, so every invite was rejected with
-- "null value in column created_by violates not-null constraint".
--
-- This version also checks, before creating the code, the same rules that
-- claim_staff_invite() enforces when the employee joins — so the owner gets a
-- clear message now instead of the employee hitting an error later:
--   * only the owner can invite, on Kivu Business or higher with active access
--   * role must be manager / cashier / stock_clerk / waiter / kitchen
--   * waiter and kitchen roles only for bars and restaurants
--   * valid Rwandan phone, not already linked to a staff account
-- ============================================================================

create or replace function public.create_staff_invite(p_employee_name text, p_phone text, p_role text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid   uuid := auth.uid();
  v_shop  uuid;
  v_role  text;
  v_type  text;
  v_phone text := public.normalize_rw_phone(coalesce(p_phone, ''));
  v_new_role text := lower(trim(coalesce(p_role, '')));
  v_code  text;
  v_try   int := 0;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select shop_id, role into v_shop, v_role from public.profiles where id = v_uid;
  if v_role is distinct from 'owner' then raise exception 'Only the shop owner can create staff invites.'; end if;

  if not public.account_access_allowed() then
    raise exception 'Your Kivu subscription is not active. Renew it before inviting staff.';
  end if;
  if not public.plan_allows('business') then
    raise exception 'Staff accounts need Kivu Business or higher. Upgrade your plan to invite staff.';
  end if;

  if coalesce(trim(p_employee_name), '') = '' then raise exception 'Employee name is required.'; end if;
  if v_new_role not in ('manager', 'cashier', 'stock_clerk', 'waiter', 'kitchen') then
    raise exception 'Choose a valid role: manager, cashier, stock clerk, waiter or kitchen.';
  end if;

  select business_type into v_type from public.shops where id = v_shop;
  if v_new_role in ('waiter', 'kitchen') and coalesce(v_type, 'retail') not in ('bar', 'restaurant', 'bar_restaurant') then
    raise exception 'Waiter and kitchen roles are only for bars and restaurants. Change the business type in Settings first.';
  end if;

  if v_phone !~ '^\+2507[0-9]{8}$' then raise exception 'Enter a valid Rwanda phone number, for example 0788 123 456.'; end if;
  if exists (select 1 from public.employees e where e.user_id is not null and public.normalize_rw_phone(e.phone) = v_phone) then
    raise exception 'This phone number already has a staff account.';
  end if;

  -- Six-character code from the built-in gen_random_uuid() (no pgcrypto needed); retry on the rare clash.
  loop
    v_try := v_try + 1;
    v_code := upper(substring(md5(gen_random_uuid()::text || clock_timestamp()::text) from 1 for 6));
    exit when not exists (select 1 from public.staff_invites where upper(code) = v_code and used_at is null);
    if v_try >= 5 then raise exception 'Could not generate a unique invite code. Try again.'; end if;
  end loop;

  insert into public.staff_invites (shop_id, code, employee_name, phone, role, created_by, expires_at)
  values (v_shop, v_code, trim(p_employee_name), v_phone, v_new_role, v_uid, now() + interval '14 days');

  insert into public.audit_logs (shop_id, user_id, user_name, action, entity, details)
  values (v_shop, v_uid, public.current_full_name(), 'created staff invite', 'staff account',
          jsonb_build_object('employee_name', trim(p_employee_name), 'role', v_new_role, 'phone', v_phone));

  return v_code;
end;
$$;

grant execute on function public.create_staff_invite(text, text, text) to authenticated;

-- Product categories are used by the POS category filter and the product list.
alter table public.products add column if not exists category text;

-- ----------------------------------------------------------------------------
-- Owner pay-outs count against the drawer.
-- record_expense() linked an expense to the open shift only for managers, so when an
-- owner paid cash out of the drawer, close_shift_controlled() still expected that cash
-- and the shift showed a false shortage. Managers keep their existing behaviour; an
-- owner's expense is linked to their open shift only for "Petty cash" (the drawer
-- pay-out on the Cash shifts page), so rent or bank payments never touch the drawer.
-- ----------------------------------------------------------------------------
create or replace function public.record_expense(p_description text, p_amount numeric, p_category text default 'Other')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_shop uuid := public.current_shop_id();
  v_role text := public.current_role();
  v_name text := public.current_full_name();
  v_shift uuid;
  v_id uuid;
begin
  if v_uid is null or v_shop is null then raise exception 'Not authenticated'; end if;
  if v_role not in ('owner','manager') then raise exception 'Only an owner or manager can record expenses'; end if;
  if not public.account_access_allowed() then raise exception 'This account does not currently have business access'; end if;
  if coalesce(trim(p_description),'') = '' then raise exception 'Expense description is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Expense amount must be greater than zero'; end if;
  if v_role = 'manager' and not public.plan_allows('business') then raise exception 'Manager access requires Business plan or higher'; end if;

  if public.plan_allows('business') and (v_role = 'manager' or lower(coalesce(trim(p_category),'')) = 'petty cash') then
    select id into v_shift from public.shifts
    where shop_id = v_shop and user_id = v_uid and status = 'open'
    order by opened_at desc limit 1;
  end if;

  insert into public.expenses(shop_id, description, amount, shift_id, user_id, category, employee_name, approval_status, approved_by, approved_at)
  values (v_shop, trim(p_description), p_amount, v_shift, v_uid, coalesce(nullif(trim(p_category),''),'Other'),
          coalesce(nullif(v_name,''),'Owner'), 'approved', v_uid, now())
  returning id into v_id;

  insert into public.audit_logs(shop_id, user_id, user_name, action, entity, details)
  values (v_shop, v_uid, v_name, 'recorded expense', 'expense',
          jsonb_build_object('expense_id', v_id, 'amount', p_amount, 'category', p_category, 'shift_id', v_shift));
  return v_id;
end $$;
