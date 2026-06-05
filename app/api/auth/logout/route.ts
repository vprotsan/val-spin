import { clearSession } from '@/lib/session';
import { clearHydrationState } from '@/lib/db/hydrate';
import { redirect } from 'next/navigation';

async function logout() {
  await clearSession();
  clearHydrationState();
  redirect('/');
}

export { logout as GET, logout as POST };
