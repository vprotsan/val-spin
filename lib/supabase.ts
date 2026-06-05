import 'server-only';
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL is not set');
if (!process.env.SUPABASE_ANON_KEY) throw new Error('SUPABASE_ANON_KEY is not set');

// Single shared client for all server-side Supabase calls.
// The anon key is never exposed to the browser — every call goes through
// Server Components, Route Handlers, or Server Actions.
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { persistSession: false } }, // stateless — we manage auth ourselves
);
