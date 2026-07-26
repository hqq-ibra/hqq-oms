'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/analytics/stock', label: 'Stock & Demand' },
  { href: '/analytics/sales', label: 'Sales & Profit' },
  { href: '/analytics/customers', label: 'Customers' },
  { href: '/analytics/operations', label: 'Operations' },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
      <nav className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={pathname === tab.href ? 'page' : undefined}
            className={cn(
              'whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              pathname === tab.href
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
