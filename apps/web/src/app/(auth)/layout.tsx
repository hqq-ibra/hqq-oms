'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useEffect } from 'react';
import { Loading } from '@/components/ui/loading';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { isAuthenticated, mounted } = useAuth();

  useEffect(() => {
    if (mounted && isAuthenticated) {
      router.replace('/orders');
    }
  }, [mounted, isAuthenticated, router]);

  if (!mounted) {
    return <Loading />;
  }

  if (isAuthenticated) {
    return <Loading />;
  }

  return <>{children}</>;
}
