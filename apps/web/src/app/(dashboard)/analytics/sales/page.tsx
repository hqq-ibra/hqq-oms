'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '@/lib/api';
import { Card, Loading, EmptyState } from '@/components/ui';

interface MonthlyMoneyRow {
  month: string;
  currency: string;
  revenue: number;
  cost: number;
  margin: number | null;
  marginPct: number | null;
}

export default function SalesAnalyticsPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['analytics', 'sales', 'monthly'],
    queryFn: () => api.get<MonthlyMoneyRow[]>('/api/v1/analytics/sales/monthly'),
  });

  const rows = data ?? [];
  const currencies = [...new Set(rows.map((r) => r.currency))];
  const hasRevenue = rows.some((r) => r.revenue > 0);
  // Chart category label: plain month when only one currency is present (the
  // common case), otherwise "month currency" so same-month bars from different
  // currencies are never mistaken for one another. Never sums/merges values.
  const chartRows = rows.map((r) => ({
    ...r,
    label: currencies.length > 1 ? `${r.month} ${r.currency}` : r.month,
  }));

  if (isLoading) return <Loading className="min-h-0 py-8" />;
  if (isError) return (
    <div className="space-y-6">
      <Card title="Margin by month">
        <EmptyState reason="Couldn't load this data." hint="The server didn't respond. Refresh the page to try again." />
      </Card>
      <Card title="Monthly costs">
        <EmptyState reason="Couldn't load this data." hint="The server didn't respond. Refresh the page to try again." />
      </Card>
    </div>
  );

  return (
    <div className="space-y-6">
      {currencies.length > 1 && (
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Costs are recorded in {currencies.join(', ')}. Figures are shown per currency and are never added together.
        </p>
      )}

      <Card title="Margin by month">
        {!hasRevenue ? (
          <EmptyState
            reason="No selling prices recorded."
            hint="Add a SELLING_PRICE cost to an order to see revenue and margin here. Until then only costs can be reported."
          />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="revenue" fill="#2563eb" name="Revenue" />
                <Bar dataKey="cost" fill="#f59e0b" name="Cost" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Monthly costs">
        {rows.length === 0 ? (
          <EmptyState reason="No costs recorded yet." hint="Costs appear here once orders have cost entries." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b border-gray-200">
                <th className="px-4 py-2 text-left font-medium text-gray-700">Month</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Currency</th>
                <th className="px-4 py-2 text-right font-medium text-gray-700">Cost</th>
                <th className="px-4 py-2 text-right font-medium text-gray-700">Revenue</th>
                <th className="px-4 py-2 text-right font-medium text-gray-700">Margin</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.month}-${r.currency}`} className="border-b border-gray-100">
                    <td className="px-4 py-2">{r.month}</td>
                    <td className="px-4 py-2">{r.currency}</td>
                    <td className="px-4 py-2 text-right">{r.cost.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">
                      {r.margin === null ? <span className="text-gray-400">—</span> : r.revenue.toFixed(2)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.margin === null ? <span className="text-gray-400">—</span> : r.margin.toFixed(2)}
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
