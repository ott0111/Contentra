'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BlitzRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/creatos');
  }, [router]);
  return null;
}