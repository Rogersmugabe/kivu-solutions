-- KIVU — export the database structure (read-only; changes nothing)
-- Run in Supabase → SQL Editor, then copy the single JSON result and send it to the developer.
-- It lists tables/columns, Row Level Security policies and the source of the Kivu functions,
-- so database fixes (like staff invites) can be written against the real schema.

select json_build_object(
  'columns', (
    select json_agg(json_build_object('table', table_name, 'column', column_name, 'type', data_type, 'nullable', is_nullable, 'default', column_default) order by table_name, ordinal_position)
    from information_schema.columns
    where table_schema = 'public'
  ),
  'policies', (
    select json_agg(json_build_object('table', tablename, 'policy', policyname, 'command', cmd, 'roles', roles, 'using', qual, 'check', with_check))
    from pg_policies
    where schemaname = 'public'
  ),
  'rls_enabled', (
    select json_agg(json_build_object('table', relname, 'rls', relrowsecurity))
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
  ),
  'functions', (
    select json_agg(json_build_object('name', p.proname, 'args', pg_get_function_identity_arguments(p.oid), 'security_definer', p.prosecdef, 'config', p.proconfig, 'source', pg_get_functiondef(p.oid)))
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('create_staff_invite', 'claim_staff_invite', 'create_owner_shop', 'set_employee_active', 'record_sale_cart_v48',
                        'request_or_void_sale', 'request_or_adjust_stock', 'review_control_request', 'receive_stock', 'close_shift_controlled', 'record_expense')
  ),
  'triggers', (
    select json_agg(json_build_object('table', event_object_table, 'trigger', trigger_name, 'timing', action_timing, 'event', event_manipulation, 'action', action_statement))
    from information_schema.triggers
    where trigger_schema = 'public'
  )
) as kivu_schema;
