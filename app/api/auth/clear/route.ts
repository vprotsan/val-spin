import { clearSession } from '@/lib/session';
import { redirect } from 'next/navigation';

// GET /api/auth/clear
// Clears a stale session cookie then sends the user back to the login page.
// Used by protected pages that detect an invalid/expired token.
export async function GET() {
  await clearSession();
  redirect('/');
}
