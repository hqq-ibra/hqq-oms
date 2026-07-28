'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { Printer } from 'lucide-react';

interface FactorySheetData {
  factoryOrderNumber: string | null;
  productNameEn: string;
  sku: string;
  notes: string | null;
  items?: Array<{ productNameEn: string; sku: string; quantity: number }>;
  cadFiles: Array<{ fileName: string; fileUrl: string }>;
}

export default function FactorySheetPage() {
  const params = useParams();
  const id = params.id as string;

  const { data, isLoading } = useQuery({
    queryKey: ['factory-sheet', id],
    queryFn: () =>
      api.get<FactorySheetData>(`/api/v1/orders/${id}/factory-sheet`),
    enabled: !!id,
  });

  const handlePrint = () => {
    window.print();
  };

  if (isLoading || !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Print button - hidden when printing */}
      <div className="sticky top-0 z-10 border-b border-gray-200 bg-white p-4 print:hidden">
        <Button variant="primary" size="md" onClick={handlePrint}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
      </div>

      {/* Content - print optimized */}
      <div className="mx-auto max-w-2xl p-8 print:p-0">
        <div className="space-y-8">
          {/* Factory order number - large */}
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 print:text-gray-600">
              Factory Order Number
            </p>
            <p className="mt-1 text-3xl font-bold text-gray-900 md:text-4xl">
              {data.factoryOrderNumber ?? 'Not confirmed yet'}
            </p>
          </div>

          {/* Items */}
          {data.items && data.items.length > 0 ? (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 print:text-gray-600">
                Items
              </p>
              <div className="mt-2 space-y-3">
                {data.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-4 rounded-lg border border-gray-200 p-3">
                    <div className="flex-1">
                      <p className="text-lg font-semibold text-gray-900">{item.productNameEn}</p>
                      <p className="text-sm text-gray-500">SKU: {item.sku}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-gray-900">{item.quantity}</p>
                      <p className="text-xs text-gray-500">qty</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500 print:text-gray-600">
                  Product
                </p>
                <p className="mt-1 text-xl font-semibold text-gray-900">
                  {data.productNameEn}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-gray-500 print:text-gray-600">
                  SKU
                </p>
                <p className="mt-1 text-lg font-medium text-gray-900">
                  {data.sku}
                </p>
              </div>
            </>
          )}

          {/* Notes */}
          {data.notes && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 print:text-gray-600">
                Notes
              </p>
              <p className="mt-1 whitespace-pre-wrap text-gray-900">
                {data.notes}
              </p>
            </div>
          )}

          {/* CAD file links */}
          {data.cadFiles.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500 print:text-gray-600">
                CAD Files
              </p>
              <ul className="mt-2 space-y-2 print:space-y-1">
                {data.cadFiles.map((file: { fileName: string; fileUrl: string }) => {
                  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
                  const href = file.fileUrl.startsWith('http') ? file.fileUrl : `${apiBase}${file.fileUrl}`;
                  return (
                    <li key={file.fileUrl}>
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline print:text-blue-900 print:no-underline"
                      >
                        {file.fileName}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
