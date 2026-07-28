'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  Button,
  Badge,
  DataTable,
  Pagination,
  SearchInput,
  Select,
  type DataTableColumn,
  type OrderStatusKey,
  type SelectOption,
} from '@/components/ui';
import { useSocketEvent } from '@/hooks/use-socket';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus } from 'lucide-react';
import { OrderStatus, OrderType } from '@/lib/types';

const daysSince = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

interface OrderRow {
  id: string;
  orderNumber: string | null;
  factoryOrderNumber: string | null;
  quoteNumber: string | null;
  status: string;
  expectedDeliveryDate: string | null;
  createdAt: string;
  quotation?: { validUntil: string | null } | null;
  customer?: { name: string };
  product?: { nameEn: string } | null;
  assignedUser?: { name: string } | null;
  items?: Array<{ id: string; quantity: number; product: { nameEn: string } }>;
}

interface OrderListResponse {
  data: OrderRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const STATUS_OPTIONS: SelectOption[] = [
  { value: '', label: 'All' },
  ...Object.values(OrderStatus).map((s) => ({
    value: s,
    label: s.replace(/_/g, ' '),
  })),
];

const ORDER_TYPE_OPTIONS: SelectOption[] = [
  { value: '', label: 'All' },
  ...Object.values(OrderType).map((t) => ({
    value: t,
    label: t.replace(/_/g, ' '),
  })),
];

export default function OrdersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [orderType, setOrderType] = useState('');
  const [search, setSearch] = useState('');
  const [delayed, setDelayed] = useState(false);
  const [nearDeadline, setNearDeadline] = useState(false);
  const [page, setPage] = useState(1);
  const [tab, setTab] = useState<'ALL' | 'QUOTATIONS'>('ALL');

  const effectiveStatus = tab === 'QUOTATIONS' ? OrderStatus.QUOTATION : status;

  const filters = {
    ...(effectiveStatus && { status: effectiveStatus }),
    ...(orderType && { orderType }),
    ...(search && { search }),
    ...(delayed && { delayed: 'true' }),
    ...(nearDeadline && { nearDeadline: 'true' }),
    ...(tab === 'QUOTATIONS' && { sort: 'oldest' }),
    page: String(page),
    pageSize: '10',
  };

  const { data, isLoading } = useQuery({
    queryKey: ['orders', filters],
    queryFn: () =>
      api.get<OrderListResponse>('/api/v1/orders', {
        ...filters,
        page: String(page),
        pageSize: '10',
      }),
  });

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['orders'] });
  }, [queryClient]);

  useSocketEvent('order.created', refetch, [refetch]);
  useSocketEvent('order.updated', refetch, [refetch]);
  useSocketEvent('order.status_changed', refetch, [refetch]);

  const orders = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  const columns: DataTableColumn<OrderRow>[] = [
    {
      key: 'orderNumber',
      header: 'Order #',
      render: (row) => row.orderNumber ?? row.quoteNumber ?? '—',
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => row.customer?.name ?? '—',
    },
    {
      key: 'product',
      header: 'Items',
      render: (row) => {
        const count = row.items?.length ?? 0;
        const totalQty = row.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
        if (count === 0) return '—';
        return (
          <span className="text-sm text-gray-700">
            {count} {count === 1 ? 'product' : 'products'}
            <span className="ml-1 text-xs text-gray-400">({totalQty} qty)</span>
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Badge variant={row.status as OrderStatusKey}>
          {row.status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'expectedDeliveryDate',
      header: 'Expected Delivery',
      render: (row) =>
        row.expectedDeliveryDate
          ? format(new Date(row.expectedDeliveryDate), 'MMM d, yyyy')
          : '—',
    },
  ];

  const quotationColumns: DataTableColumn<OrderRow>[] = [
    {
      key: 'createdAt',
      header: 'Waiting',
      render: (row) => {
        const d = daysSince(row.createdAt);
        return (
          <span className={d >= 7 ? 'font-semibold text-[#DC2626]' : 'text-gray-700'}>
            {d === 0 ? 'today' : `${d} ${d === 1 ? 'day' : 'days'}`}
          </span>
        );
      },
    },
    {
      key: 'validUntil',
      header: 'Valid until',
      render: (row) => {
        const v = row.quotation?.validUntil;
        if (!v) return '—';
        const expired = new Date(v).getTime() < Date.now();
        return (
          <span className={expired ? 'font-semibold text-[#DC2626]' : 'text-gray-700'}>
            {format(new Date(v), 'MMM d, yyyy')}
            {expired ? ' (expired)' : ''}
          </span>
        );
      },
    },
  ];

  const handleRowClick = (row: OrderRow) => {
    router.push(`/orders/${row.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
        <Link href="/orders/new">
          <Button variant="primary" size="md">
            <Plus className="h-4 w-4" />
            New Order
          </Button>
        </Link>
      </div>

      <div className="flex gap-1 border-b border-gray-200">
        {(['ALL', 'QUOTATIONS'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              setPage(1);
              // The delivery-date filters are meaningless for quotations — a
              // quotation is not late, it is unanswered — and the API now
              // excludes QUOTATION from them (orders.service.ts
              // DELIVERY_EXCLUDED_STATUSES), so leaving one ticked here would
              // silently produce an always-empty list.
              if (t === 'QUOTATIONS') {
                setDelayed(false);
                setNearDeadline(false);
              }
            }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'border-[#DC2626] text-[#DC2626]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'ALL' ? 'All Orders' : 'Quotations'}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <Select
            label="Status"
            options={STATUS_OPTIONS}
            value={status}
            disabled={tab === 'QUOTATIONS'}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          />
          <Select
            label="Order Type"
            options={ORDER_TYPE_OPTIONS}
            value={orderType}
            onChange={(e) => {
              setOrderType(e.target.value);
              setPage(1);
            }}
          />
          <div className="sm:col-span-2">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search orders..."
            />
          </div>
          {/* Disabled on the Quotations tab for the same reason the Status
              select is: a quotation has no delivery commitment to be late
              against. */}
          <div className="flex flex-col justify-end gap-2 sm:flex-row sm:items-end">
            <label
              className={`flex items-center gap-2 text-sm ${
                tab === 'QUOTATIONS' ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                checked={delayed}
                disabled={tab === 'QUOTATIONS'}
                onChange={(e) => {
                  setDelayed(e.target.checked);
                  setPage(1);
                }}
                className="h-4 w-4 rounded border-gray-300 disabled:cursor-not-allowed"
              />
              Delayed
            </label>
            <label
              className={`flex items-center gap-2 text-sm ${
                tab === 'QUOTATIONS' ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                checked={nearDeadline}
                disabled={tab === 'QUOTATIONS'}
                onChange={(e) => {
                  setNearDeadline(e.target.checked);
                  setPage(1);
                }}
                className="h-4 w-4 rounded border-gray-300 disabled:cursor-not-allowed"
              />
              Near deadline
            </label>
          </div>
        </div>
      </div>

      {/* Desktop: DataTable */}
      <div className="hidden md:block">
        <DataTable
          columns={tab === 'QUOTATIONS' ? [...columns, ...quotationColumns] : columns}
          data={orders}
          loading={isLoading}
          emptyMessage="No orders found"
          onRowClick={handleRowClick}
        />
      </div>

      {/* Mobile: Card list */}
      <div className="space-y-3 md:hidden">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-lg border border-gray-200 p-4"
              >
                <div className="h-4 w-24 rounded bg-gray-200" />
                <div className="mt-2 h-4 w-32 rounded bg-gray-200" />
                <div className="mt-2 h-4 w-20 rounded bg-gray-200" />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-500">
            No orders found
          </p>
        ) : (
          orders.map((order) => (
            <Link
              key={order.id}
              href={`/orders/${order.id}`}
              className="block rounded-lg border border-gray-200 p-4 transition-colors hover:bg-gray-50"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900">{order.orderNumber ?? order.quoteNumber ?? '—'}</p>
                  <p className="text-sm text-gray-500">
                    {order.customer?.name ?? '—'}
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    {order.expectedDeliveryDate
                      ? format(new Date(order.expectedDeliveryDate), 'MMM d, yyyy')
                      : '—'}
                  </p>
                </div>
                <Badge variant={order.status as OrderStatusKey}>
                  {order.status.replace(/_/g, ' ')}
                </Badge>
              </div>
            </Link>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}
