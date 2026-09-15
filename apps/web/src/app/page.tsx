'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function Root() {
  const router = useRouter();
  useEffect(() => {
    let mounted = true;
    api('/api/v1/auth/me')
      .then(() => { if (mounted) router.replace('/app'); })
      .catch(() => { if (mounted) router.replace('/login'); });
    return () => { mounted = false; };
  }, [router]);
  return null;
}