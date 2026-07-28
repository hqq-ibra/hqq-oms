'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Loading } from '@/components/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission } from '@/lib/types';
import Link from 'next/link';

interface MonthlyCostRow {
  month: string;
  currency: string;
  totalCost: number;
  costCount: number;
}

interface OrdersPerformanceRow {
  status: string;
  count: number;
}

interface FactoryPerformanceRow {
  factoryId: string;
  factoryName: string;
  orderCount: number;
}

interface InactiveCustomerRow {
  id: string;
  customerCode: string;
  name: string;
  lastOrderAt: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  QUOTATION: 'bg-amber-500',
  CONFIRMED: 'bg-blue-500',
  SAMPLE_RECEIVED: 'bg-purple-500',
  CAD_DRAWING_READY: 'bg-indigo-500',
  SENT_TO_FACTORY: 'bg-orange-500',
  MOLD_READY: 'bg-yellow-500',
  SILICONE_CASTING: 'bg-teal-500',
  SHIPPED_FROM_FACTORY: 'bg-cyan-500',
  RECEIVED_LOCALLY: 'bg-emerald-500',
  SHIPPED_TO_CUSTOMER: 'bg-sky-500',
  COMPLETED: 'bg-green-500',
  REJECTED: 'bg-gray-400',
};

export default function ReportsPage() {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !hasPermission(Permission.VIEW_REPORTS)) {
      router.replace('/dashboard');
    }
  }, [mounted, hasPermission, router]);

  const { data: monthlyCosts, isLoading: loadingCosts } = useQuery({
    queryKey: ['reports', 'monthly-costs'],
    queryFn: () => api.get<MonthlyCostRow[]>('/api/v1/reports/monthly-costs'),
    enabled: hasPermission(Permission.VIEW_REPORTS),
  });

  const { data: ordersPerformance, isLoading: loadingOrders } = useQuery({
    queryKey: ['reports', 'orders-performance'],
    queryFn: () =>
      api.get<OrdersPerformanceRow[]>('/api/v1/reports/orders-performance'),
    enabled: hasPermission(Permission.VIEW_REPORTS),
  });

  const { data: factoryPerformance, isLoading: loadingFactory } = useQuery({
    queryKey: ['reports', 'factory-performance'],
    queryFn: () =>
      api.get<FactoryPerformanceRow[]>('/api/v1/reports/factory-performance'),
    enabled: hasPermission(Permission.VIEW_REPORTS),
  });

  const { data: inactiveCustomers, isLoading: loadingInactive } = useQuery({
    queryKey: ['reports', 'inactive-customers'],
    queryFn: () =>
      api.get<InactiveCustomerRow[]>('/api/v1/reports/inactive-customers'),
    enabled: hasPermission(Permission.VIEW_REPORTS),
  });

  const maxOrderCount =
    ordersPerformance?.reduce((max, r) => Math.max(max, r.count), 0) ?? 1;

  if (!mounted || !hasPermission(Permission.VIEW_REPORTS)) {
    return (
      <div className="flex items-center justify-center py-24">
        <p className="text-gray-500">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Reports</h1>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Monthly Costs — spend only. Selling prices are excluded, and each
            currency is reported separately since no exchange rate exists. */}
        <Card title="Monthly Costs">
          {loadingCosts ? (
            <div className="flex items-center justify-center py-12">
              <Loading className="min-h-0 py-0" />
            </div>
          ) : !monthlyCosts || monthlyCosts.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No costs recorded yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-2 text-left font-medium text-gray-700">
                      Month
                    </th>
                    <th className="px-4 py-2 text-left font-medium text-gray-700">
                      Currency
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-gray-700">
                      Total Costs
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-gray-700">
                      Count
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyCosts.map((row) => (
                    <tr
                      key={`${row.month}-${row.currency}`}
                      className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2">{row.month}</td>
                      <td className="px-4 py-2">{row.currency}</td>
                      <td className="px-4 py-2 text-right">
                        {row.totalCost.toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-right">{row.costCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Orders Performance */}
        <Card title="Orders Performance">
          {loadingOrders ? (
            <div className="flex items-center justify-center py-12">
              <Loading className="min-h-0 py-0" />
            </div>
          ) : !ordersPerformance || ordersPerformance.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No data available
            </p>
          ) : (
            <div className="space-y-3">
              {ordersPerformance.map((row) => (
                <div key={row.status} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="font-medium text-gray-700">
                      {row.status.replace(/_/g, ' ')}
                    </span>
                    <span className="text-gray-600">{row.count}</span>
                  </div>
                  <div className="h-6 overflow-hidden rounded bg-gray-100">
                    <div
                      className={`h-full transition-all ${
                        STATUS_COLORS[row.status] ?? 'bg-gray-400'
                      }`}
                      style={{
                        width: `${(row.count / maxOrderCount) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Factory Performance */}
        <Card title="Factory Performance">
          {loadingFactory ? (
            <div className="flex items-center justify-center py-12">
              <Loading className="min-h-0 py-0" />
            </div>
          ) : !factoryPerformance || factoryPerformance.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No data available
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-2 text-left font-medium text-gray-700">
                      Factory
                    </th>
                    <th className="px-4 py-2 text-right font-medium text-gray-700">
                      Total Orders
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {factoryPerformance.map((row) => (
                    <tr
                      key={row.factoryId}
                      className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2">{row.factoryName}</td>
                      <td className="px-4 py-2 text-right">
                        {row.orderCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Inactive Customers */}
        <Card title="Inactive Customers (no orders in 90 days)">
          {loadingInactive ? (
            <div className="flex items-center justify-center py-12">
              <Loading className="min-h-0 py-0" />
            </div>
          ) : !inactiveCustomers || inactiveCustomers.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No inactive customers
            </p>
          ) : (
            <ul className="space-y-2">
              {inactiveCustomers.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/customers/${c.id}`}
                    className="text-blue-600 hover:underline">
                    {c.customerCode} - {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
