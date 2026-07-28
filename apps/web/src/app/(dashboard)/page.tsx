'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Card, Button, Badge } from '@/components/ui';
import type { OrderStatusKey } from '@/components/ui';
import { format } from 'date-fns';
import {
  Package,
  Activity,
  AlertTriangle,
  CheckCircle,
  Plus,
  ArrowRight,
} from 'lucide-react';

interface OrderListResponse {
  data: Array<{
    id: string;
    orderNumber: string | null;
    quoteNumber: string | null;
    status: string;
    expectedDeliveryDate: string | null;
    customer?: { name: string };
    assignedUser?: { name: string } | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function useOrders(filters: Record<string, string>) {
  return useQuery({
    queryKey: ['orders', filters],
    queryFn: () =>
      api.get<OrderListResponse>('/api/v1/orders', {
        ...filters,
        page: filters.page ?? '1',
        pageSize: filters.pageSize ?? '10',
      }),
  });
}

function StatCard({
  title,
  value,
  icon: Icon,
  iconBg,
}: {
  title: string;
  value: number;
  icon: React.ElementType;
  iconBg: string;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-4">
        <div className={`rounded-lg p-3 ${iconBg}`}>
          <Icon className="h-6 w-6 text-gray-700" />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const totalQuery = useOrders({ page: '1', pageSize: '1' });
  const completedQuery = useOrders({
    status: 'COMPLETED',
    page: '1',
    pageSize: '1',
  });
  const delayedQuery = useOrders({
    delayed: 'true',
    page: '1',
    pageSize: '1',
  });
  const recentQuery = useOrders({ page: '1', pageSize: '5' });
  const nearDeadlineQuery = useOrders({
    nearDeadline: 'true',
    page: '1',
    pageSize: '10',
  });

  const totalOrders = totalQuery.data?.total ?? 0;
  const completedOrders = completedQuery.data?.total ?? 0;
  const delayedOrders = delayedQuery.data?.total ?? 0;
  const activeOrders = totalOrders - completedOrders;

  const recentOrders = recentQuery.data?.data ?? [];
  const nearDeadlineOrders = nearDeadlineQuery.data?.data ?? [];

  const hasError = totalQuery.isError || recentQuery.isError;

  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <p className="text-center text-gray-600">
          Unable to load dashboard. Make sure the API server is running.
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={() => {
            totalQuery.refetch();
            recentQuery.refetch();
            completedQuery.refetch();
            delayedQuery.refetch();
            nearDeadlineQuery.refetch();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Orders"
          value={totalOrders}
          icon={Package}
          iconBg="bg-blue-100"
        />
        <StatCard
          title="Active Orders"
          value={activeOrders}
          icon={Activity}
          iconBg="bg-amber-100"
        />
        <StatCard
          title="Delayed Orders"
          value={delayedOrders}
          icon={AlertTriangle}
          iconBg="bg-red-100"
        />
        <StatCard
          title="Completed Orders"
          value={completedOrders}
          icon={CheckCircle}
          iconBg="bg-green-100"
        />
      </div>

      {/* Quick actions */}
      <div className="flex justify-end">
        <Link href="/orders/new">
          <Button variant="primary" size="md">
            <Plus className="h-4 w-4" />
            New Order
          </Button>
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Orders */}
        <Card
          title="Recent Orders"
          footer={
            recentOrders.length > 0 ? (
              <Link href="/orders">
                <Button variant="ghost" size="sm">
                  View all orders
                </Button>
              </Link>
            ) : undefined
          }
        >
          {recentQuery.isLoading ? (
            <div className="py-8 text-center text-sm text-gray-500">
              Loading...
            </div>
          ) : recentOrders.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No orders yet
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
                    <th className="pb-3 font-medium">Order</th>
                    <th className="pb-3 font-medium">Customer</th>
                    <th className="pb-3 font-medium">Status</th>
                    <th className="pb-3 font-medium">Expected</th>
                    <th className="pb-3 font-medium">Assigned</th>
                    <th className="pb-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-gray-100 text-sm"
                    >
                      <td className="py-3 font-medium text-gray-900">
                        {order.orderNumber ?? order.quoteNumber ?? '—'}
                      </td>
                      <td className="py-3 text-gray-600">
                        {order.customer?.name ?? '—'}
                      </td>
                      <td className="py-3">
                        <Badge variant={order.status as OrderStatusKey}>
                          {order.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="py-3 text-gray-600">
                        {order.expectedDeliveryDate
                          ? format(
                              new Date(order.expectedDeliveryDate),
                              'MMM d, yyyy'
                            )
                          : '—'}
                      </td>
                      <td className="py-3 text-gray-600">
                        {order.assignedUser?.name ?? '—'}
                      </td>
                      <td className="py-3">
                        <Link href={`/orders/${order.id}`}>
                          <ArrowRight className="h-4 w-4 text-gray-400 hover:text-blue-600" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Near Deadline */}
        <Card title="Near Deadline (7 days)">
          {nearDeadlineQuery.isLoading ? (
            <div className="py-8 text-center text-sm text-gray-500">
              Loading...
            </div>
          ) : nearDeadlineOrders.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              No orders near deadline
            </p>
          ) : (
            <div className="space-y-3">
              {nearDeadlineOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className="flex items-center justify-between rounded-lg border border-gray-200 p-3 transition-colors hover:bg-gray-50"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {order.orderNumber ?? order.quoteNumber ?? '—'}
                    </p>
                    <p className="text-sm text-gray-500">
                      {order.customer?.name ?? '—'} •{' '}
                      {order.expectedDeliveryDate
                        ? format(
                            new Date(order.expectedDeliveryDate),
                            'MMM d, yyyy'
                          )
                        : '—'}
                    </p>
                  </div>
                  <Badge variant={order.status as OrderStatusKey}>
                    {order.status.replace(/_/g, ' ')}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
