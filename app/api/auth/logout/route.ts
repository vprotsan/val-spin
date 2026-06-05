import { clearSession } from '@/lib/session';
import { redirect } from 'next/navigation';

// Supports both GET (link) and POST (legacy form) so either trigger works.
async function logout() {
  await clearSession();
  redirect('/');
}

export { logout as GET, logout as POST };
