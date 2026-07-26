'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Loading, EmptyState } from '@/components/ui';

interface StatusDwellRow { status: string; averageDays: number; samples: number }
interface CycleTimeRow { orderId: string; orderNumber: string; days: number }
interface OverdueOrderRow { orderId: string; orderNumber: string; customerName: string; expectedDeliveryDate: string; daysOverdue: number }
interface FactoryLeadTimeRow { factoryId: string; factoryName: string; orderCount: number; completedCount: number; averageLeadDays: number | null }

export default function OperationsAnalyticsPage() {
  const { data: dwell, isLoading: loadingDwell, isError: errorDwell } = useQuery({
    queryKey: ['analytics', 'operations', 'dwell'],
    queryFn: () => api.get<StatusDwellRow[]>('/api/v1/analytics/operations/status-dwell'),
  });
  const { data: cycles, isLoading: loadingCycles, isError: errorCycles } = useQuery({
    queryKey: ['analytics', 'operations', 'cycles'],
    queryFn: () => api.get<CycleTimeRow[]>('/api/v1/analytics/operations/cycle-times'),
  });
  const { data: overdue, isLoading: loadingOverdue, isError: errorOverdue } = useQuery({
    queryKey: ['analytics', 'operations', 'overdue'],
    queryFn: () => api.get<OverdueOrderRow[]>('/api/v1/analytics/operations/overdue'),
  });
  const { data: factories, isLoading: loadingFactories, isError: errorFactories } = useQuery({
    queryKey: ['analytics', 'operations', 'factories'],
    queryFn: () => api.get<FactoryLeadTimeRow[]>('/api/v1/analytics/operations/factory-lead-times'),
  });

  const cycleRows = cycles ?? [];
  const avgCycle = cycleRows.length
    ? (cycleRows.reduce((s, c) => s + c.days, 0) / cycleRows.length).toFixed(1)
    : null;

  const dwellRows = dwell ?? [];
  const maxDwellDays = Math.max(...dwellRows.map((x) => x.averageDays), 1);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-xs text-gray-500">Completed orders</p>
          <p className="text-2xl font-bold">{loadingCycles || errorCycles ? '—' : cycleRows.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Avg cycle (days)</p>
          <p className="text-2xl font-bold">{loadingCycles || errorCycles ? '—' : avgCycle ?? '—'}</p>
        </Card>
        <Card>
          <p className="text-xs text-gray-500">Overdue orders</p>
          <p className="text-2xl font-bold text-red-600">{loadingOverdue || errorOverdue ? '—' : (overdue ?? []).length}</p>
        </Card>
      </div>

      <Card title="Where orders wait — average days per status">
        {loadingDwell ? <Loading className="min-h-0 py-8" />
          : errorDwell ? <EmptyState reason="Couldn't load this data." hint="The server didn't respond. Refresh the page to try again." />
          : dwellRows.length === 0 ? <EmptyState reason="Not enough status history yet." hint="Bottlenecks appear once orders have moved through several statuses." />
          : (
            <div className="space-y-2">
              {dwellRows.map((d) => (
                <div key={d.status} className="flex items-center gap-3">
                  <span className="w-52 shrink-0 truncate text-xs text-gray-600">{d.status}</span>
                  <div className="h-3 flex-1 rounded bg-gray-100">
                    <div className="h-3 rounded bg-blue-500" style={{ width: `${(d.averageDays / maxDwellDays) * 100}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs text-gray-600">{d.averageDays}d ({d.samples})</span>
                </div>
              ))}
            </div>
          )}
      </Card>

      <Card title="Overdue orders">
        {loadingOverdue ? <Loading className="min-h-0 py-8" />
          : errorOverdue ? <EmptyState reason="Couldn't load this data." hint="The server didn't respond. Refresh the page to try again." />
          : (overdue ?? []).length === 0 ? <EmptyState reason="No overdue orders." hint="Orders past their expected delivery date and not yet completed appear here." />
          : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="border-b border-gray-200">
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Order</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Customer</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Days overdue</th>
                </tr></thead>
                <tbody>
                  {(overdue ?? []).map((o) => (
                    <tr key={o.orderId} className="border-b border-gray-100">
                      <td className="px-4 py-2 font-mono text-xs">{o.orderNumber}</td>
                      <td className="px-4 py-2">{o.customerName}</td>
                      <td className="px-4 py-2 text-right font-semibold text-red-600">{o.daysOverdue}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <Card title="Factory lead times">
        {loadingFactories ? <Loading className="min-h-0 py-8" />
          : errorFactories ? <EmptyState reason="Couldn't load this data." hint="The server didn't respond. Refresh the page to try again." />
          : (factories ?? []).length === 0 ? <EmptyState reason="No factories recorded." />
          : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="border-b border-gray-200">
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Factory</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Orders</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Completed</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Avg lead (days)</th>
                </tr></thead>
                <tbody>
                  {(factories ?? []).map((f) => (
                    <tr key={f.factoryId} className="border-b border-gray-100">
                      <td className="px-4 py-2">{f.factoryName}</td>
                      <td className="px-4 py-2 text-right">{f.orderCount}</td>
                      <td className="px-4 py-2 text-right">{f.completedCount}</td>
                      <td className="px-4 py-2 text-right">
                        {f.averageLeadDays === null ? <span className="text-gray-400">—</span> : f.averageLeadDays}
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
