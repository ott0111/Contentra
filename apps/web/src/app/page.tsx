import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function Root(){
  const cookieHeader = (await cookies()).toString();
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  try {
    const response = await fetch(`${apiUrl}/api/v1/auth/me`, { headers: { cookie: cookieHeader }, cache: 'no-store' });
    redirect(response.ok ? '/app' : '/login');
  } catch { redirect('/login'); }
}
