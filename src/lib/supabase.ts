import { createClient, type PostgrestError } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/config';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

/** Turns database errors into messages a shop owner can act on. */
export function friendlyError(error: unknown): string {
  const e = error as Partial<PostgrestError> & { message?: string };
  const msg = e?.message || String(error || 'Something went wrong');
  if (/failed to fetch|network/i.test(msg)) return 'No internet connection. Check your connection and try again.';
  if (/JWT expired|invalid jwt/i.test(msg)) return 'Your session expired. Please sign in again.';
  if (/row-level security|permission denied/i.test(msg)) return 'Your account is not allowed to do this. Ask the owner.';
  return msg;
}

/** Calls a database function and throws a readable error on failure. */
export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw Object.assign(new Error(friendlyError(error)), { cause: error, code: error.code });
  return data as T;
}

/** Runs a select builder and throws a readable error on failure. */
export async function rows<T>(query: PromiseLike<{ data: T[] | null; error: PostgrestError | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw Object.assign(new Error(friendlyError(error)), { cause: error, code: error.code });
  return data ?? [];
}

/** Synthetic sign-in email for staff, who log in with phone number + 6-digit PIN. */
export const staffAuthEmail = (phone: string) => `staff.${phone.replace(/\D/g, '')}@auth.duka.local`;
