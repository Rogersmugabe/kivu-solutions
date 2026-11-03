-- ============================================================================
-- KIVU 003 — Owners pay for their plan with MTN MoMo (no manual confirmation)
-- Run once in Supabase → SQL Editor, after 002. Safe to run again.
--
-- How it works:
--   * The momo-pay Edge Function (supabase/functions/momo-pay) records a 'pending' row in the
--     existing subscription_payments table and asks MTN to send a payment prompt to the phone.
--     The amount comes from kivu_plan_price() here, never from the browser.
--   * When MTN reports the payment SUCCESSFUL (the function asks MTN itself; it never trusts a
--     message that only claims "paid"), it calls kivu_confirm_momo_payment(), which marks the
--     row confirmed and extends the shop's plan. Calling it twice changes nothing the second time.
--   * Both functions can only be called by the Edge Function (service role), not from the app.
--   * Owners can read their own shop's payments, so the Plans page can show the history.
-- ============================================================================

-- Online-payment details on the existing table.
alter table public.subscription_payments add column if not exists provider        text;
alter table public.subscription_payments add column if not exists provider_ref    text;
alter table public.subscription_payments add column if not exists provider_txn_id text;
alter table public.subscription_payments add column if not exists payer_phone     text;
alter table public.subscription_payments add column if not exists months          integer not null default 1;
alter table public.subscription_payments add column if not exists requested_by    uuid;
alter table public.subscription_payments add column if not exists failure_reason  text;
alter table public.subscription_payments add column if not exists updated_at      timestamptz not null default now();

alter table public.subscription_payments drop constraint if exists subscription_payments_status_check;
alter table public.subscription_payments add constraint subscription_payments_status_check
  check (status in ('pending', 'confirmed', 'rejected', 'refunded', 'failed'));
alter table public.subscription_payments drop constraint if exists subscription_payments_months_check;
alter table public.subscription_payments add constraint subscription_payments_months_check check (months between 1 and 12);

-- One provider reference can only ever be one payment.
create unique index if not exists subscription_payments_provider_ref_key
  on public.subscription_payments (provider, provider_ref) where provider_ref is not null;
create index if not exists subscription_payments_shop_idx on public.subscription_payments (shop_id, created_at desc);

-- Owners read their own payments (writes only happen through the functions below).
alter table public.subscription_payments enable row level security;
drop policy if exists "subscription payments owner read" on public.subscription_payments;
create policy "subscription payments owner read" on public.subscription_payments
  for select using (exists (select 1 from public.shops s where s.id = shop_id and s.owner_id = auth.uid()));

-- Plan prices in whole RWF. Keep in step with PLANS in src/lib/access.ts.
create or replace function public.kivu_plan_price(p_plan text)
returns integer
language sql
immutable
as $$
  select case p_plan
    when 'basic'    then 2000
    when 'one_time' then 50000
    when 'business' then 5000
    when 'control'  then 10000
    when 'pro'      then 20000
  end
$$;

-- Marks a pending MoMo payment confirmed and extends the plan.
--   * Same plan and still running: the new months are added after the current end date.
--   * Otherwise (new plan, trial, or expired): the paid period starts now.
--   * Kivu One-Time has no end date.
create or replace function public.kivu_confirm_momo_payment(p_payment_id uuid, p_provider_txn_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pay   public.subscription_payments%rowtype;
  shop  public.shops%rowtype;
  v_from timestamptz;
  v_to   timestamptz;
begin
  select * into pay from public.subscription_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if pay.status = 'confirmed' then
    return jsonb_build_object('status', 'confirmed', 'already', true);
  end if;
  if pay.status <> 'pending' then
    raise exception 'Payment is %, it cannot be confirmed', pay.status;
  end if;

  select * into shop from public.shops where id = pay.shop_id for update;

  if pay.plan = 'one_time' then
    v_from := now();
    v_to   := null;
  else
    v_from := case
      when shop.plan = pay.plan and shop.subscription_status in ('active', 'grace')
           and shop.current_period_end is not null and shop.current_period_end > now()
        then shop.current_period_end
      else now()
    end;
    v_to := v_from + make_interval(months => pay.months);
  end if;

  update public.subscription_payments
     set status = 'confirmed',
         provider_txn_id = coalesce(p_provider_txn_id, provider_txn_id),
         covered_from = v_from::date,
         covered_to = v_to::date,
         confirmed_by_name = 'MTN MoMo (automatic)',
         updated_at = now()
   where id = pay.id;

  update public.shops
     set plan = pay.plan,
         subscription_status = 'active',
         subscription_started_at = coalesce(subscription_started_at, now()),
         current_period_start = case when v_from > now() then current_period_start else v_from end,
         current_period_end = v_to,
         grace_ends_at = case when v_to is null then null else v_to + interval '3 days' end,
         cancelled_at = null
   where id = pay.shop_id;

  return jsonb_build_object('status', 'confirmed', 'plan', pay.plan, 'covered_to', v_to);
end;
$$;

-- Marks a pending MoMo payment failed (declined, timed out, not enough balance…).
create or replace function public.kivu_fail_momo_payment(p_payment_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.subscription_payments
     set status = 'failed', failure_reason = left(coalesce(p_reason, 'Payment failed'), 300), updated_at = now()
   where id = p_payment_id and status = 'pending';
$$;

-- Only the Edge Function (service role) may confirm or fail payments.
revoke all on function public.kivu_confirm_momo_payment(uuid, text) from public, anon, authenticated;
revoke all on function public.kivu_fail_momo_payment(uuid, text) from public, anon, authenticated;
grant execute on function public.kivu_confirm_momo_payment(uuid, text) to service_role;
grant execute on function public.kivu_fail_momo_payment(uuid, text) to service_role;
grant execute on function public.kivu_plan_price(text) to authenticated, service_role;
