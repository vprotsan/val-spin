import 'server-only';
import { createClient } from '@supabase/supabase-js';

if (!process.env.SUPABASE_URL) throw new Error('SUPABASE_URL is not set');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

// Single shared client for all server-side Supabase calls.
// Uses the service role key to bypass RLS — this file is server-only so the
// key is never sent to the browser. Per-user data separation is enforced at
// the application layer via spotify_user_id.
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);
