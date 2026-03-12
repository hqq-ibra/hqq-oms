'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gray-50 p-4">
      <h1 className="text-xl font-semibold text-gray-900">Something went wrong</h1>
      <p className="max-w-md text-center text-sm text-gray-600">
        The application encountered an error. You can try again or go to the login page.
      </p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-[#DC2626] px-4 py-2 text-sm font-medium text-white hover:bg-[#B91C1C]"
        >
          Try again
        </button>
        <Link
          href="/login"
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Go to login
        </Link>
      </div>
    </div>
  );
}
