import { clearSession } from '@/lib/session';
import { redirect } from 'next/navigation';

// POST /api/auth/logout — clears the session cookie and returns to login
export async function POST() {
  await clearSession();
  redirect('/');
}
