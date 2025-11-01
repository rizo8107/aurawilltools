import { createClient } from '@supabase/supabase-js';
// Centralized Supabase client constants for browser-side REST usage
// IMPORTANT: Use only the anon key on the client. Never expose service_role keys in client code.

export const SUPABASE_URL = 'https://app-supabase.9krcxo.easypanel.host';
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzUwMDEyMjAwLCJleHAiOjE5MDc3Nzg2MDB9.eJ81pv114W4ZLvg0E-AbNtNZExPoLYbxGdeWTY5PVVs';

export const sbHeadersObj = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
} as const;

export function sbHeaders(): HeadersInit {
  return { ...sbHeadersObj };
}

// Supabase client for supabase-js usage in the app
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
