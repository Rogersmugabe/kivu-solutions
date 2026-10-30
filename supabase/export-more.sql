-- KIVU — second read-only export (changes nothing). Run in Supabase → SQL Editor and share the result.
-- Shows how sales are priced and recorded, how voids / adjustments / bills are applied,
-- and the CHECK constraints (e.g. which payment methods the sales table accepts).

select json_build_object(
  'functions', (
    select json_agg(json_build_object('name', p.proname, 'args', pg_get_function_identity_arguments(p.oid), 'source', pg_get_functiondef(p.oid)))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('record_sale_cart_v45', 'apply_sale_void', 'apply_stock_adjustment', 'hospitality_close_tab',
                        'record_supplier_purchase_v44', 'account_access_allowed', 'plan_allows', 'control_plan_allowed')
  ),
  'check_constraints', (
    select json_agg(json_build_object('table', rel.relname, 'name', con.conname, 'definition', pg_get_constraintdef(con.oid)))
    from pg_constraint con join pg_class rel on rel.oid = con.conrelid join pg_namespace n on n.oid = rel.relnamespace
    where n.nspname = 'public' and con.contype = 'c'
  )
) as kivu_schema_more;
