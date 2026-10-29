-- ==============================================================================
-- KIVU SOLUTIONS: Staff Invite Procedure Fix
-- Resolves: "function gen_random_bytes(integer) does not exist"
-- ==============================================================================
--
-- Why this happens:
-- In Supabase PostgreSQL, the `pgcrypto` extension is installed in the `extensions`
-- schema. If the stored procedure `create_staff_invite` was created without
-- schema-qualifying `gen_random_bytes` or without `SET search_path = public, extensions`,
-- PostgreSQL only searches the `public` schema and throws:
--   "Notice: function gen_random_bytes(integer) does not exist" (SQLSTATE 42883)
--
-- HOW TO APPLY THIS FIX:
-- 1. Open your Supabase Dashboard (https://supabase.com/dashboard)
-- 2. Select your Kivu Solutions project
-- 3. Click "SQL Editor" in the left navigation
-- 4. Click "+ New query"
-- 5. Paste the SQL below and click "Run" (or Ctrl + Enter)
-- ==============================================================================

-- 1. Ensure pgcrypto extension is installed in extensions schema
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- 2. Recreate create_staff_invite using native gen_random_uuid()
--    gen_random_uuid() is built into PostgreSQL 13+ core (zero external dependencies)
CREATE OR REPLACE FUNCTION public.create_staff_invite(
  p_employee_name text,
  p_phone text,
  p_role text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_shop_id uuid;
  v_code text;
  v_role text;
BEGIN
  -- Verify caller is shop owner
  SELECT shop_id, role INTO v_shop_id, v_role
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_role <> 'owner' THEN
    RAISE EXCEPTION 'Only the shop owner can create staff invites.';
  END IF;

  -- Generate clean 6-character uppercase alphanumeric code (e.g. KV7M9X)
  v_code := UPPER(SUBSTRING(MD5(gen_random_uuid()::text || clock_timestamp()::text) FROM 1 FOR 6));

  -- Insert staff invite record
  INSERT INTO public.staff_invites (
    shop_id,
    employee_name,
    phone,
    role,
    code,
    expires_at
  ) VALUES (
    v_shop_id,
    p_employee_name,
    p_phone,
    p_role,
    v_code,
    NOW() + INTERVAL '14 days'
  );

  RETURN v_code;
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION public.create_staff_invite(text, text, text) TO authenticated;
