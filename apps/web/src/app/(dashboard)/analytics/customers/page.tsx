'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Loading, EmptyState } from '@/components/ui';

type CustomerSegment = 'ACTIVE' | 'AT_RISK' | 'DORMANT' | 'NEVER_ORDERED';

interface CustomerSegmentRow {
  customerId: string;
  customerCode: string;
  name: string;
  lastOrderAt: string | null;
  daysSinceLastOrder: number | null;
  segment: CustomerSegment;
}

interface CustomerBreadthRow {
  customerId: string;
  customerCode: string;
  name: string;
  products: number;
}

const SEGMENT_STYLE: Record<CustomerSegment, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  AT_RISK: 'bg-amber-100 text-amber-700',
  DORMANT: 'bg-red-100 text-red-700',
  NEVER_ORDERED: 'bg-gray-100 text-gray-600',
};

export default function CustomerAnalyticsPage() {
  const { data: segments, isLoading: loadingSegments } = useQuery({
    queryKey: ['analytics', 'customers', 'segments'],
    queryFn: () => api.get<CustomerSegmentRow[]>('/api/v1/analytics/customers/segments'),
  });

  const { data: breadth, isLoading: loadingBreadth } = useQuery({
    queryKey: ['analytics', 'customers', 'breadth'],
    queryFn: () => api.get<CustomerBreadthRow[]>('/api/v1/analytics/customers/breadth'),
  });

  const rows = segments ?? [];
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.segment] = (acc[r.segment] ?? 0) + 1;
    return acc;
  }, {});

  const linked = (breadth ?? []).filter((b) => b.products > 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(['ACTIVE', 'AT_RISK', 'DORMANT', 'NEVER_ORDERED'] as CustomerSegment[]).map((s) => (
          <Card key={s}>
            <p className="text-xs text-gray-500">{s.replace('_', ' ')}</p>
            <p className="text-2xl font-bold">{loadingSegments ? '—' : counts[s] ?? 0}</p>
          </Card>
        ))}
      </div>

      <Card title="Products per customer">
        {loadingBreadth ? <Loading className="min-h-0 py-8" />
          : linked.length === 0 ? <EmptyState reason="No customer is linked to a product yet." />
          : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="border-b border-gray-200">
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Code</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Customer</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Products</th>
                </tr></thead>
                <tbody>
                  {linked.map((b) => (
                    <tr key={b.customerId} className="border-b border-gray-100">
                      <td className="px-4 py-2 font-mono text-xs">{b.customerCode}</td>
                      <td className="px-4 py-2">{b.name}</td>
                      <td className="px-4 py-2 text-right font-semibold">{b.products}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <Card title="Customer recency">
        {loadingSegments ? <Loading className="min-h-0 py-8" />
          : rows.length === 0 ? <EmptyState reason="No customers found." />
          : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="border-b border-gray-200">
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Customer</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Segment</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Days since order</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.customerId} className="border-b border-gray-100">
                      <td className="px-4 py-2">{r.name}</td>
                      <td className="px-4 py-2">
                        <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEGMENT_STYLE[r.segment]}`}>
                          {r.segment.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        {r.daysSinceLastOrder === null ? <span className="text-gray-400">—</span> : r.daysSinceLastOrder}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </div>
  );
}
