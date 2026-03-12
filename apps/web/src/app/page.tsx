'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { Loading } from '@/components/ui/loading';

export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, mounted } = useAuth();

  useEffect(() => {
    if (!mounted) return;
    if (isAuthenticated) {
      router.replace('/orders');
    } else {
      router.replace('/login');
    }
  }, [mounted, isAuthenticated, router]);

  return <Loading />;
}
