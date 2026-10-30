// Supabase project used by Kivu. The publishable (anon) key is designed to be public:
// every table and function is protected by Row Level Security on the database side.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? 'https://frduolsneevyndnebxvy.supabase.co';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'sb_publishable_VCK_RPU-DGz4UtrWf5mj7w_iFwpthpe';

export const APP_VERSION = '6.0.0';
export const BUSINESS_TIME_ZONE = 'Africa/Kigali';
