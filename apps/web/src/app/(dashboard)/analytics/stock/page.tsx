'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Loading, EmptyState } from '@/components/ui';

interface ProductDemandRow {
  productId: string;
  sku: string;
  nameEn: string;
  inventory: number;
  customers: number;
  stockGap: boolean;
}

interface CatalogueHealth {
  totalProducts: number;
  productsWithoutCustomer: number;
  productsWithoutDrawing: number;
  totalLinks: number;
}

export default function StockAnalyticsPage() {
  const { data: demand, isLoading: loadingDemand } = useQuery({
    queryKey: ['analytics', 'stock', 'demand'],
    queryFn: () => api.get<ProductDemandRow[]>('/api/v1/analytics/stock/demand'),
  });

  const { data: health } = useQuery({
    queryKey: ['analytics', 'stock', 'health'],
    queryFn: () => api.get<CatalogueHealth>('/api/v1/analytics/stock/catalogue-health'),
  });

  const gaps = (demand ?? []).filter((r) => r.stockGap);
  const wanted = (demand ?? []).filter((r) => r.customers > 0);
  const dead = (demand ?? []).filter((r) => r.customers === 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><p className="text-xs text-gray-500">Products</p><p className="text-2xl font-bold">{health?.totalProducts ?? '—'}</p></Card>
        <Card><p className="text-xs text-gray-500">Customer links</p><p className="text-2xl font-bold">{health?.totalLinks ?? '—'}</p></Card>
        <Card><p className="text-xs text-gray-500">No customer</p><p className="text-2xl font-bold text-amber-600">{health?.productsWithoutCustomer ?? '—'}</p></Card>
        <Card><p className="text-xs text-gray-500">No drawing</p><p className="text-2xl font-bold text-red-600">{health?.productsWithoutDrawing ?? '—'}</p></Card>
      </div>

      <Card title="Stock gaps — wanted by 2+ customers, zero inventory">
        {loadingDemand ? <Loading className="min-h-0 py-8" />
          : gaps.length === 0 ? <EmptyState reason="No stock gaps." hint="Every product wanted by two or more customers currently has inventory." />
          : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="border-b border-gray-200">
                  <th className="px-4 py-2 text-left font-medium text-gray-700">SKU</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Product</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Customers</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Inventory</th>
                </tr></thead>
                <tbody>
                  {gaps.map((r) => (
                    <tr key={r.productId} className="border-b border-gray-100 bg-red-50/40">
                      <td className="px-4 py-2 font-mono text-xs">{r.sku}</td>
                      <td className="px-4 py-2">{r.nameEn}</td>
                      <td className="px-4 py-2 text-right font-semibold">{r.customers}</td>
                      <td className="px-4 py-2 text-right font-semibold text-red-600">{r.inventory}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <Card title="Demand vs stock">
        {loadingDemand ? <Loading className="min-h-0 py-8" />
          : wanted.length === 0 ? <EmptyState reason="No products are linked to customers yet." hint="Link products to customers from the customer page to build demand data." />
          : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="border-b border-gray-200">
                  <th className="px-4 py-2 text-left font-medium text-gray-700">SKU</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Customers</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Inventory</th>
                </tr></thead>
                <tbody>
                  {wanted.map((r) => (
                    <tr key={r.productId} className="border-b border-gray-100">
                      <td className="px-4 py-2 font-mono text-xs">{r.sku}</td>
                      <td className="px-4 py-2 text-right">{r.customers}</td>
                      <td className="px-4 py-2 text-right">{r.inventory}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <Card title={loadingDemand ? 'Dead catalogue — no customer linked' : `Dead catalogue — no customer linked (${dead.length})`}>
        {loadingDemand ? <Loading className="min-h-0 py-8" />
          : dead.length === 0 ? <EmptyState reason="Every product is linked to at least one customer." />
          : (
            <div className="flex flex-wrap gap-2">
              {dead.map((r) => (
                <span key={r.productId} className="rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-600">{r.sku}</span>
              ))}
            </div>
          )}
      </Card>
    </div>
  );
}
