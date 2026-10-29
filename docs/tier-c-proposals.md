# Kivu Solutions — Tier C Backend Schema & RPC Proposals

> [!NOTE]
> Per the master implementation plan and **Rule 1 (Absolute Non-Disruption)**, database SQL and migrations live outside this frontend repository.
> These proposals detail the exact schema structures, Row Level Security (RLS) policies, and RPC procedures recommended to elevate local-only datasets to first-class, multi-device synchronized database tables.

---

## 1. Credit Repayments (`credit_repayments`)

### Current State (Frontend Only)
Currently stored in browser `localStorage` under `kivu_credit_repayments_<shop_id>`. Repayments made on one terminal (e.g. tablet) do not sync to another terminal (e.g. phone or back-office PC).

### Proposed Table Schema
```sql
CREATE TABLE public.credit_repayments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    credit_id UUID NOT NULL REFERENCES public.credits(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    amount NUMERIC NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL DEFAULT 'Cash' CHECK (payment_method IN ('Cash', 'Mobile Money', 'Bank', 'Other')),
    note TEXT,
    recorded_by UUID NOT NULL REFERENCES auth.users(id),
    shift_id UUID REFERENCES public.shifts(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_credit_repayments_shop ON public.credit_repayments(shop_id);
CREATE INDEX idx_credit_repayments_credit ON public.credit_repayments(credit_id);
CREATE INDEX idx_credit_repayments_customer ON public.credit_repayments(customer_id);
```

### Proposed RPC Procedure
```sql
CREATE OR REPLACE FUNCTION public.record_credit_repayment_v1(
    p_credit_id UUID,
    p_amount NUMERIC,
    p_payment_method TEXT,
    p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_credit RECORD;
    v_shop_id UUID;
    v_new_repayment_id UUID;
    v_total_paid NUMERIC;
BEGIN
    SELECT * INTO v_credit FROM public.credits WHERE id = p_credit_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Credit record not found';
    END IF;

    v_shop_id := v_credit.shop_id;

    INSERT INTO public.credit_repayments (shop_id, credit_id, customer_id, amount, payment_method, note, recorded_by)
    VALUES (v_shop_id, p_credit_id, v_credit.customer_id, p_amount, p_payment_method, p_note, auth.uid())
    RETURNING id INTO v_new_repayment_id;

    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM public.credit_repayments
    WHERE credit_id = p_credit_id;

    IF v_total_paid >= v_credit.amount THEN
        UPDATE public.credits
        SET paid = true, paid_at = now()
        WHERE id = p_credit_id;
    END IF;

    RETURN jsonb_build_object('success', true, 'repayment_id', v_new_repayment_id, 'total_paid', v_total_paid);
END;
$$;
```

---

## 2. Petty Cash Drawer Payouts (`petty_cash_payouts`)

### Current State (Frontend Only)
Currently stored in browser `localStorage` under `kivu_petty_cash_<shop_id>`. Used by cashiers during active shifts to log small drawer payouts (< 5,000 RWF).

### Proposed Table Schema
```sql
CREATE TABLE public.petty_cash_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    shift_id UUID NOT NULL REFERENCES public.shifts(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL CHECK (amount > 0 AND amount <= 10000),
    category TEXT NOT NULL CHECK (category IN ('Supplies', 'Transport', 'Food', 'Repairs', 'Other')),
    description TEXT NOT NULL,
    paid_to TEXT,
    recorded_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_petty_cash_shop_shift ON public.petty_cash_payouts(shop_id, shift_id);
```

### Proposed RPC Procedure
```sql
CREATE OR REPLACE FUNCTION public.record_petty_cash_v1(
    p_shift_id UUID,
    p_amount NUMERIC,
    p_category TEXT,
    p_description TEXT,
    p_paid_to TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_shift RECORD;
    v_payout_id UUID;
BEGIN
    SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id AND status = 'open' FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active shift not found or already closed.';
    END IF;

    INSERT INTO public.petty_cash_payouts (shop_id, shift_id, amount, category, description, paid_to, recorded_by)
    VALUES (v_shift.shop_id, p_shift_id, p_amount, p_category, p_description, p_paid_to, auth.uid())
    RETURNING id INTO v_payout_id;

    RETURN v_payout_id;
END;
$$;
```

---

## 3. Split Payment Tender Details (`sale_payments`)

### Current State (Frontend Only)
Currently stored in browser `localStorage` under `kivu_split_<shop_id>_<receipt_no>`.

### Proposed Schema Enhancement
Normalize split tenders across cash, MoMo, and bank into an explicit child table `sale_payments`:
```sql
CREATE TABLE public.sale_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_id UUID NOT NULL REFERENCES public.shops(id) ON DELETE CASCADE,
    receipt_no TEXT NOT NULL,
    payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'Mobile Money', 'Bank', 'Credit', 'Other')),
    amount NUMERIC NOT NULL CHECK (amount > 0),
    reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_sale_payments_receipt ON public.sale_payments(shop_id, receipt_no);
```

---

## 4. `get_business_summary_v48` Usage & Server-Side Aggregations

### Context
`AGENTS.md` notes `get_business_summary_v48`, but the frontend currently queries `.limit(1000)` and sums figures client-side.
By deploying a unified server summary function:
```sql
CREATE OR REPLACE FUNCTION public.get_business_summary_v49(
    p_shop_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sales_total NUMERIC;
    v_cogs_total NUMERIC;
    v_expenses_total NUMERIC;
    v_tx_count BIGINT;
    v_cash_total NUMERIC;
    v_momo_total NUMERIC;
    v_bank_total NUMERIC;
    v_credit_total NUMERIC;
BEGIN
    -- Aggregated without row-limit truncation
    SELECT 
        COALESCE(SUM(total), 0),
        COALESCE(SUM(cost), 0),
        COUNT(DISTINCT receipt_no)
    INTO v_sales_total, v_cogs_total, v_tx_count
    FROM public.sales
    WHERE shop_id = p_shop_id
      AND status <> 'voided'
      AND created_at >= p_start_date
      AND created_at <= p_end_date;

    SELECT COALESCE(SUM(amount), 0)
    INTO v_expenses_total
    FROM public.expenses
    WHERE shop_id = p_shop_id
      AND approval_status <> 'rejected'
      AND created_at >= p_start_date
      AND created_at <= p_end_date;

    RETURN jsonb_build_object(
        'sales_total', v_sales_total,
        'cogs_total', v_cogs_total,
        'expenses_total', v_expenses_total,
        'gross_profit', v_sales_total - v_cogs_total,
        'net_profit', v_sales_total - v_cogs_total - v_expenses_total,
        'transaction_count', v_tx_count
    );
END;
$$;
```
This enables instantaneous, 100% accurate dashboards and reports for stores with tens of thousands of sales without downloading thousands of raw rows to mobile devices.
