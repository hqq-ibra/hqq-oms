'use client';

import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui';
import { cn } from '@/lib/utils';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Award,
  Loader2,
  Package,
  Upload,
  FileText,
  X,
} from 'lucide-react';

// ─── Types ───

interface QuoteLine {
  id: string;
  quoteSupplierId: string;
  quoteItemId: string;
  qty: number;
  unitPrice: number | string | null;
  amount: number | string | null;
  included: boolean;
  remark: string | null;
}

interface QuoteItem {
  id: string;
  itemName: string;
  targetQty: number;
  unitLabel: string;
  baselineSpec: string | null;
  orderIndex: number;
  lines: QuoteLine[];
}

interface QuoteSupplierData {
  id: string;
  candidateId: string | null;
  supplierName: string;
  country: string | null;
  quoteDate: string | null;
  validUntil: string | null;
  incoterm: string | null;
  paymentTerms: string | null;
  leadTimeDays: number | null;
  warrantyYears: number | null;
  depositPercent: number | string | null;
  notes: string | null;
  decision: string;
  decisionReason: string | null;
  lines: QuoteLine[];
}

interface ComparisonData {
  id: string;
  projectId: string;
  stageId: string;
  capabilityName: string;
  baseCurrency: string;
  incoterm: string | null;
  items: QuoteItem[];
  suppliers: QuoteSupplierData[];
}

// ─── Constants ───

function SarIcon({ className = 'h-3.5 w-3.5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 1124.14 1256.39" className={cn('inline-block', className)} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M699.62,1113.02h0c-20.06,44.48-33.32,92.75-38.4,143.37l424.51-90.24c20.06-44.47,33.31-92.75,38.4-143.37l-424.51,90.24Z" />
      <path d="M1085.73,895.8c20.06-44.47,33.32-92.75,38.4-143.37l-330.68,70.33v-135.2l292.27-62.11c20.06-44.47,33.32-92.75,38.4-143.37l-330.68,70.27V66.13c-50.67,28.45-95.67,66.32-132.25,110.99v403.35l-132.25,28.11V0c-50.67,28.44-95.67,66.32-132.25,110.99v525.69l-295.91,62.88c-20.06,44.47-33.33,92.75-38.42,143.37l334.33-71.05v170.26l-358.3,76.14c-20.06,44.47-33.32,92.75-38.4,143.37l375.04-79.7c30.53-6.35,56.77-24.4,73.83-49.24l68.78-101.97v-.02c7.14-10.55,11.3-23.27,11.3-36.97v-149.98l132.25-28.11v270.4l424.53-90.28Z" />
    </svg>
  );
}

const CURRENCIES = [
  { value: 'USD', label: '$ USD', textSymbol: '$' },
  { value: 'SAR', label: 'SAR', textSymbol: '' },
  { value: 'CNY', label: '¥ CNY', textSymbol: '¥' },
  { value: 'EUR', label: '€ EUR', textSymbol: '€' },
] as const;

function CurrencySymbol({ currency, className = '' }: { currency: string; className?: string }) {
  if (currency === 'SAR') return <SarIcon className={cn('h-3 w-3', className)} />;
  const c = CURRENCIES.find((c) => c.value === currency);
  return <span className={className}>{c?.textSymbol ?? '$'}</span>;
}

const DECISION_OPTIONS: { label: string; value: string }[] = [
  { label: 'Candidate', value: 'CANDIDATE' },
  { label: 'Selected', value: 'SELECTED' },
  { label: 'Rejected', value: 'REJECTED' },
];

const DECISION_COLORS: Record<string, string> = {
  CANDIDATE: 'bg-gray-100 text-gray-700',
  SELECTED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const SUPPLIER_BG = ['bg-blue-50/60', 'bg-amber-50/60', 'bg-emerald-50/60', 'bg-purple-50/60', 'bg-rose-50/60'];
const SUPPLIER_BORDER = ['border-blue-200', 'border-amber-200', 'border-emerald-200', 'border-purple-200', 'border-rose-200'];
const SUPPLIER_HEADER_BG = ['bg-blue-100', 'bg-amber-100', 'bg-emerald-100', 'bg-purple-100', 'bg-rose-100'];

// ─── Main Wrapper Component ───

export default function QuoteComparison({
  projectId,
  stageId,
  stageName,
}: {
  projectId: string;
  stageId: string;
  stageName: string;
  stageStatus: string;
  onRefetch: () => void;
  onStatusChange: (status: string) => void;
}) {
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const apiBase = `/api/v1/projects/${projectId}/stages/${stageId}/quote-comparison`;
  const syncRef = useRef(false);
  const [syncing, setSyncing] = useState(false);

  const { data: comparisons, isLoading } = useQuery({
    queryKey: ['quote-comparisons', projectId, stageId],
    queryFn: () => api.get<ComparisonData[]>(apiBase),
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['quote-comparisons', projectId, stageId],
    });
  }, [queryClient, projectId, stageId]);

  const reorderMut = useMutation({
    mutationFn: (orderedIds: string[]) =>
      api.post(`${apiBase}/reorder`, { orderedIds }),
    onSuccess: () => invalidate(),
  });

  useEffect(() => {
    if (syncRef.current) return;
    syncRef.current = true;
    setSyncing(true);
    api.post(`${apiBase}/sync`)
      .then(() => invalidate())
      .catch(() => {})
      .finally(() => setSyncing(false));
  }, [apiBase, invalidate]);

  if (isLoading || syncing) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <Loader2 className="h-8 w-8 animate-spin text-[#DC2626]" />
        <p className="mt-3 text-sm">{syncing ? 'Syncing capabilities from Supplier Shortlist...' : 'Loading...'}</p>
      </div>
    );
  }

  if (!comparisons || comparisons.length === 0) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{stageName}</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Compare supplier quotations grouped by capability
          </p>
        </div>
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 py-16 text-gray-400">
          <Package className="mb-3 h-12 w-12" />
          <p className="text-sm font-medium">No capabilities found</p>
          <p className="mt-1 text-xs text-center max-w-md">
            Go to the <strong>Supplier Shortlist</strong> stage first, add suppliers with capabilities,
            then come back here. The comparison tables will be created automatically.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{stageName}</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          {comparisons.length} capability section{comparisons.length !== 1 ? 's' : ''} —
          suppliers auto-synced from Supplier Shortlist
        </p>
      </div>

      {comparisons.map((comp, idx) => (
        <CapabilityPanel
          key={comp.id}
          comparison={comp}
          apiBase={apiBase}
          onInvalidate={invalidate}
          index={idx}
          total={comparisons.length}
          onMoveUp={() => {
            if (idx === 0) return;
            const ids = comparisons.map((c) => c.id);
            [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
            reorderMut.mutate(ids);
          }}
          onMoveDown={() => {
            if (idx === comparisons.length - 1) return;
            const ids = comparisons.map((c) => c.id);
            [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
            reorderMut.mutate(ids);
          }}
        />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════
// CAPABILITY PANEL (collapsible)
// ═══════════════════════════════════════

function CapabilityPanel({
  comparison,
  apiBase,
  onInvalidate,
  index,
  total,
  onMoveUp,
  onMoveDown,
}: {
  comparison: ComparisonData;
  apiBase: string;
  onInvalidate: () => void;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { addToast } = useToast();
  const [expanded, setExpanded] = useState(true);
  const [newItemName, setNewItemName] = useState('');
  const newItemRef = useRef<HTMLInputElement>(null);

  const items = comparison.items;
  const suppliers = comparison.suppliers;
  const selectedSupplier = suppliers.find((s) => s.decision === 'SELECTED');

  // ─── Mutations ───

  const addItemMut = useMutation({
    mutationFn: (dto: { itemName: string; targetQty?: number; unitLabel?: string; baselineSpec?: string }) =>
      api.post(`${apiBase}/${comparison.id}/items`, dto),
    onSuccess: () => { onInvalidate(); setNewItemName(''); setTimeout(() => newItemRef.current?.focus(), 100); },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const updateItemMut = useMutation({
    mutationFn: ({ itemId, ...dto }: { itemId: string } & Record<string, unknown>) =>
      api.patch(`${apiBase}/items/${itemId}`, dto),
    onSuccess: () => onInvalidate(),
  });

  const deleteItemMut = useMutation({
    mutationFn: (itemId: string) => api.delete(`${apiBase}/items/${itemId}`),
    onSuccess: () => { onInvalidate(); addToast('Item removed', 'success'); },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const reorderItemMut = useMutation({
    mutationFn: ({ itemId, direction }: { itemId: string; direction: 'up' | 'down' }) =>
      api.post(`${apiBase}/items/${itemId}/reorder`, { direction }),
    onSuccess: () => onInvalidate(),
  });

  const updateSupplierMut = useMutation({
    mutationFn: ({ supplierId, ...dto }: { supplierId: string } & Record<string, unknown>) =>
      api.patch(`${apiBase}/suppliers/${supplierId}`, dto),
    onSuccess: () => onInvalidate(),
  });

  const updateLineMut = useMutation({
    mutationFn: ({ lineId, ...dto }: { lineId: string } & Record<string, unknown>) =>
      api.patch(`${apiBase}/lines/${lineId}`, dto),
    onSuccess: () => onInvalidate(),
  });

  const switchCurrencyMut = useMutation({
    mutationFn: (currency: string) =>
      api.post(`${apiBase}/${comparison.id}/switch-currency`, { currency }),
    onSuccess: () => { onInvalidate(); addToast('Currency converted', 'success'); },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const selectFinalMut = useMutation({
    mutationFn: (supplierId: string) =>
      api.post(`${apiBase}/${comparison.id}/select-final`, { supplierId }),
    onSuccess: () => { onInvalidate(); addToast('Final supplier selected', 'success'); },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  // ─── Helpers ───

  const getLine = (item: QuoteItem, supplierId: string): QuoteLine | undefined =>
    item.lines.find((l) => l.quoteSupplierId === supplierId);

  const getSubtotal = (supplierId: string): number => {
    let total = 0;
    for (const item of items) {
      const line = getLine(item, supplierId);
      if (line?.included && line.amount != null) total += Number(line.amount);
    }
    return total;
  };

  const cur = comparison.baseCurrency;

  const fmtNum = (val: number | string | null | undefined) => {
    if (val == null) return null;
    const n = typeof val === 'string' ? parseFloat(val) : val;
    if (isNaN(n)) return null;
    return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const PriceVal = ({ value }: { value: number | string | null | undefined }) => {
    const formatted = fmtNum(value);
    if (!formatted) return <span className="text-gray-300">—</span>;
    return <span className="inline-flex items-center gap-0.5"><CurrencySymbol currency={cur} /> {formatted}</span>;
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
      {/* Panel Header */}
      <div className="flex items-center">
        {/* Reorder arrows */}
        {total > 1 && (
          <div className="flex flex-col items-center border-r border-gray-100 px-1.5 py-2">
            <button type="button" onClick={(e) => { e.stopPropagation(); onMoveUp(); }} disabled={index === 0}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-20 disabled:hover:bg-transparent">
              <ChevronUp className="h-4 w-4" />
            </button>
            <span className="text-[10px] font-bold text-gray-300">{index + 1}</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); onMoveDown(); }} disabled={index === total - 1}
              className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-700 disabled:opacity-20 disabled:hover:bg-transparent">
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        )}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex flex-1 items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50"
      >
        <ChevronRight className={cn('h-5 w-5 text-gray-400 transition-transform', expanded && 'rotate-90')} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">{comparison.capabilityName}</h2>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
              {suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}
            </span>
            {comparison.baseCurrency !== 'USD' && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                {comparison.baseCurrency}
              </span>
            )}
            {selectedSupplier && (
              <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">
                <Award className="h-3 w-3" /> {selectedSupplier.supplierName}
              </span>
            )}
          </div>
        </div>
      </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-5 pb-5">
          {/* Actions */}
          <div className="flex items-center justify-end gap-2 py-3">
            {suppliers.length > 0 && (
              <CurrencyPicker
                value={comparison.baseCurrency}
                onChange={(v) => switchCurrencyMut.mutate(v)}
                disabled={switchCurrencyMut.isPending}
              />
            )}
          </div>

          {suppliers.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">
              No suppliers linked to this capability yet
            </div>
          ) : (
            <>
              {/* Comparison Table */}
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full border-collapse text-sm" style={{ minWidth: 'max-content' }}>
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="sticky left-0 z-20 bg-gray-50 border-r border-gray-200 px-3 py-2 text-left" style={{ minWidth: 250 }} colSpan={3}>
                        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Items</span>
                      </th>
                      {suppliers.map((s, idx) => (
                        <th
                          key={s.id}
                          colSpan={4}
                          className={cn(
                            'px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider',
                            SUPPLIER_HEADER_BG[idx % SUPPLIER_HEADER_BG.length],
                            idx < suppliers.length - 1 && 'border-r border-gray-200',
                          )}
                        >
                          <div className="flex items-center justify-center gap-2">
                            <span className="truncate">{s.supplierName}</span>
                            {s.country && <span className="text-[10px] font-normal text-gray-500">({s.country})</span>}
                            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', DECISION_COLORS[s.decision])}>
                              {s.decision}
                            </span>
                          </div>
                        </th>
                      ))}
                    </tr>
                    <tr className="border-b border-gray-300 bg-gray-50/80">
                      <th className="sticky left-0 z-20 w-10 bg-[#f9fafb] px-2 py-2 text-center text-xs font-medium text-gray-500">#</th>
                      <th className="sticky left-10 z-20 min-w-[140px] bg-[#f9fafb] px-3 py-2 text-left text-xs font-medium text-gray-500">Item</th>
                      <th className="sticky left-[196px] z-20 w-14 border-r border-gray-200 bg-[#f9fafb] px-2 py-2 text-center text-xs font-medium text-gray-500">Qty</th>
                      {suppliers.map((s, idx) => (
                        <React.Fragment key={s.id}>
                          <th className={cn('w-14 px-2 py-2 text-center text-xs font-medium text-gray-500', SUPPLIER_BG[idx % SUPPLIER_BG.length])}>Qty</th>
                          <th className={cn('w-20 px-2 py-2 text-center text-xs font-medium text-gray-500', SUPPLIER_BG[idx % SUPPLIER_BG.length])}>Price</th>
                          <th className={cn('w-20 px-2 py-2 text-center text-xs font-medium text-gray-500', SUPPLIER_BG[idx % SUPPLIER_BG.length])}>Amount</th>
                          <th className={cn(
                            'min-w-[80px] px-2 py-2 text-center text-xs font-medium text-gray-500',
                            SUPPLIER_BG[idx % SUPPLIER_BG.length],
                            idx < suppliers.length - 1 && 'border-r border-gray-200',
                          )}>Remark</th>
                        </React.Fragment>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, rowIdx) => (
                      <tr key={item.id} className="group border-b border-gray-100 transition-colors hover:bg-gray-50/50">
                        <td className="sticky left-0 z-10 bg-white px-2 py-2 text-center text-xs text-gray-400 group-hover:bg-gray-50">
                          <div className="flex flex-col items-center gap-0.5">
                            <span>{rowIdx + 1}</span>
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100">
                              <button type="button" onClick={() => reorderItemMut.mutate({ itemId: item.id, direction: 'up' })} disabled={rowIdx === 0} className="rounded p-0.5 text-gray-400 hover:bg-gray-200 disabled:opacity-30"><ChevronUp className="h-3 w-3" /></button>
                              <button type="button" onClick={() => reorderItemMut.mutate({ itemId: item.id, direction: 'down' })} disabled={rowIdx === items.length - 1} className="rounded p-0.5 text-gray-400 hover:bg-gray-200 disabled:opacity-30"><ChevronDown className="h-3 w-3" /></button>
                            </div>
                          </div>
                        </td>
                        <td className="sticky left-10 z-10 bg-white px-3 py-2 group-hover:bg-gray-50">
                          <div className="flex items-center gap-1">
                            <EditableText value={item.itemName} onSave={(v) => updateItemMut.mutate({ itemId: item.id, itemName: v })} className="font-medium text-gray-900" />
                            <button type="button" onClick={() => deleteItemMut.mutate(item.id)} className="shrink-0 rounded p-0.5 text-gray-300 opacity-0 hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </td>
                        <td className="sticky left-[196px] z-10 border-r border-gray-200 bg-white px-2 py-2 text-center group-hover:bg-gray-50">
                          <EditableNumber value={item.targetQty} onSave={(v) => updateItemMut.mutate({ itemId: item.id, targetQty: v })} className="text-center text-gray-700" />
                        </td>
                        {suppliers.map((sup, sIdx) => {
                          const line = getLine(item, sup.id);
                          if (!line) return <td key={sup.id} colSpan={4} className="text-center text-xs text-gray-300">—</td>;
                          const dimmed = !line.included;
                          const bg = SUPPLIER_BG[sIdx % SUPPLIER_BG.length];
                          return (
                            <React.Fragment key={sup.id}>
                              <td className={cn('px-2 py-2 text-center', bg, dimmed && 'opacity-40')}>
                                <EditableNumber value={line.qty} onSave={(v) => updateLineMut.mutate({ lineId: line.id, qty: v })} className="text-center text-gray-700" disabled={dimmed} />
                              </td>
                              <td className={cn('px-2 py-2 text-center', bg, dimmed && 'opacity-40')}>
                                <EditableNumber value={line.unitPrice != null ? Number(line.unitPrice) : null} onSave={(v) => updateLineMut.mutate({ lineId: line.id, unitPrice: v })} className="text-center text-gray-700" placeholder="—" allowNull disabled={dimmed} />
                              </td>
                              <td className={cn('px-2 py-2 text-center font-medium', bg, dimmed && 'opacity-40')}>
                                <div className="flex items-center justify-center gap-1">
                                  <span className={cn('text-sm', line.amount != null ? 'text-gray-900' : 'text-gray-300')}><PriceVal value={line.amount} /></span>
                                  <button type="button" onClick={() => updateLineMut.mutate({ lineId: line.id, included: !line.included })} className={cn('ml-0.5 h-3.5 w-3.5 shrink-0 rounded border transition-colors', line.included ? 'border-green-400 bg-green-400 text-white' : 'border-gray-300 bg-white hover:border-gray-400')} title={line.included ? 'Included' : 'Excluded'}>
                                    {line.included && <span className="block text-[8px] leading-none">✓</span>}
                                  </button>
                                </div>
                              </td>
                              <td className={cn('px-2 py-2', bg, sIdx < suppliers.length - 1 && 'border-r border-gray-200', dimmed && 'opacity-40')}>
                                <EditableText value={line.remark ?? ''} onSave={(v) => updateLineMut.mutate({ lineId: line.id, remark: v || null })} placeholder="—" className="text-gray-500 text-xs" disabled={dimmed} />
                              </td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    ))}
                    {/* Inline Add Item Row */}
                    <tr className="border-b border-gray-100 bg-gray-50/30">
                      <td className="sticky left-0 z-10 bg-gray-50/30 px-2 py-2 text-center text-xs text-gray-300">
                        <Plus className="mx-auto h-3.5 w-3.5" />
                      </td>
                      <td colSpan={2} className="sticky left-10 z-10 bg-gray-50/30 border-r border-gray-200 px-3 py-1.5">
                        <form onSubmit={(e) => { e.preventDefault(); const n = newItemName.trim(); if (n) addItemMut.mutate({ itemName: n }); }} className="flex items-center gap-2">
                          <input
                            ref={newItemRef}
                            type="text"
                            value={newItemName}
                            onChange={(e) => setNewItemName(e.target.value)}
                            placeholder="Type item name and press Enter..."
                            className="w-full bg-transparent py-1 text-sm text-gray-700 placeholder-gray-400 focus:outline-none"
                          />
                          {newItemName.trim() && (
                            <button type="submit" disabled={addItemMut.isPending} className="shrink-0 rounded bg-[#DC2626] px-2 py-1 text-[10px] font-medium text-white hover:bg-[#B91C1C] disabled:opacity-50">
                              {addItemMut.isPending ? '...' : 'Add'}
                            </button>
                          )}
                        </form>
                      </td>
                      <td colSpan={suppliers.length * 4} />
                    </tr>
                    {/* Subtotal */}
                    {items.length > 0 && (
                      <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                        <td className="sticky left-0 z-10 bg-gray-50" />
                        <td className="sticky left-10 z-10 bg-gray-50 px-3 py-3 text-sm text-gray-700">Subtotal</td>
                        <td className="sticky left-[196px] z-10 border-r border-gray-200 bg-gray-50" />
                        {suppliers.map((s, sIdx) => {
                          const sub = getSubtotal(s.id);
                          return (
                            <React.Fragment key={s.id}>
                              <td />
                              <td />
                              <td className={cn('px-2 py-3 text-center text-sm', SUPPLIER_BG[sIdx % SUPPLIER_BG.length])}>
                                <span className={sub > 0 ? 'text-gray-900' : 'text-gray-300'}>{sub > 0 ? <PriceVal value={sub} /> : '—'}</span>
                              </td>
                              <td className={cn(SUPPLIER_BG[sIdx % SUPPLIER_BG.length], sIdx < suppliers.length - 1 && 'border-r border-gray-200')} />
                            </React.Fragment>
                          );
                        })}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Supplier Cards */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {suppliers.map((s, idx) => (
                  <SupplierCard
                    key={s.id}
                    supplier={s}
                    colorIdx={idx}
                    subtotal={getSubtotal(s.id)}
                    currency={comparison.baseCurrency}
                    onUpdate={(dto) => updateSupplierMut.mutate({ supplierId: s.id, ...dto })}
                    onSelectFinal={() => selectFinalMut.mutate(s.id)}
                  />
                ))}
              </div>
            </>
          )}

        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// SUPPLIER CARD
// ═══════════════════════════════════════

interface QuotationFile {
  name: string;
  type: string;
  dataUrl: string;
  addedAt: number;
}

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const ACCEPT_STRING = '.pdf,.doc,.docx,.xls,.xlsx';

function getStorageKey(supplierId: string) {
  return `quotation_files_${supplierId}`;
}

function loadQuotationFiles(supplierId: string): QuotationFile[] {
  try {
    const raw = localStorage.getItem(getStorageKey(supplierId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveQuotationFiles(supplierId: string, files: QuotationFile[]) {
  try { localStorage.setItem(getStorageKey(supplierId), JSON.stringify(files)); } catch { /* full */ }
}

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'PDF';
  if (ext === 'doc' || ext === 'docx') return 'DOC';
  if (ext === 'xls' || ext === 'xlsx') return 'XLS';
  return 'FILE';
}

function fileIconColor(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'bg-red-50 text-red-500';
  if (ext === 'doc' || ext === 'docx') return 'bg-blue-50 text-blue-500';
  if (ext === 'xls' || ext === 'xlsx') return 'bg-green-50 text-green-600';
  return 'bg-gray-100 text-gray-500';
}

function SupplierCard({
  supplier,
  colorIdx,
  subtotal,
  currency,
  onUpdate,
  onSelectFinal,
}: {
  supplier: QuoteSupplierData;
  colorIdx: number;
  subtotal: number;
  currency: string;
  onUpdate: (dto: Record<string, unknown>) => void;
  onSelectFinal: () => void;
}) {
  const validUntilStr = supplier.validUntil ? supplier.validUntil.slice(0, 10) : '';
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [quotFiles, setQuotFiles] = useState<QuotationFile[]>(() => loadQuotationFiles(supplier.id));
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

  const processFiles = (fileList: globalThis.File[]) => {
    const valid = fileList.filter(
      (f) => ACCEPTED_TYPES.includes(f.type) || ACCEPT_STRING.split(',').some((ext) => f.name.toLowerCase().endsWith(ext)),
    );
    if (valid.length === 0) return;

    for (const file of valid) {
      const reader = new FileReader();
      reader.onload = () => {
        const entry: QuotationFile = {
          name: file.name,
          type: file.type,
          dataUrl: reader.result as string,
          addedAt: Date.now(),
        };
        setQuotFiles((prev) => {
          const next = [...prev, entry];
          saveQuotationFiles(supplier.id, next);
          return next;
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(e.target.files ?? []));
    e.target.value = '';
  };

  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current++; setIsDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragging(false); } };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); };
  const onDrop = (e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); dragCounter.current = 0; setIsDragging(false); processFiles(Array.from(e.dataTransfer.files)); };

  const removeFile = (idx: number) => {
    setQuotFiles((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      saveQuotationFiles(supplier.id, next);
      return next;
    });
  };

  const openFile = (file: QuotationFile) => {
    const link = document.createElement('a');
    link.href = file.dataUrl;
    link.download = file.name;
    link.click();
  };

  return (
    <div className={cn('rounded-lg border p-3', SUPPLIER_BORDER[colorIdx % SUPPLIER_BORDER.length])}>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900">{supplier.supplierName}</h3>
          {supplier.country && <p className="text-xs text-gray-500">{supplier.country}</p>}
        </div>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', DECISION_COLORS[supplier.decision])}>
          {supplier.decision}
        </span>
      </div>

      <div className="mt-2 space-y-1 text-xs text-gray-600">
        {subtotal > 0 && (
          <div className="flex justify-between">
            <span>Total</span>
            <span className="inline-flex items-center gap-1 font-bold text-gray-900"><CurrencySymbol currency={currency} /> {fmt(subtotal)}</span>
          </div>
        )}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <MiniInput label="Lead Time (days)" type="number" value={supplier.leadTimeDays ?? ''} onChange={(v) => onUpdate({ leadTimeDays: v ? parseInt(v) : null })} />
        <MiniInput label="Deposit %" type="number" value={supplier.depositPercent ?? ''} onChange={(v) => onUpdate({ depositPercent: v ? parseFloat(v) : null })} />
        {supplier.depositPercent != null && subtotal > 0 && (
          <div className="col-span-2 rounded bg-gray-50 px-2 py-1">
            <span className="text-[10px] text-gray-400">Deposit Amount: </span>
            <span className="inline-flex items-center gap-0.5 text-xs font-bold text-gray-800">
              <CurrencySymbol currency={currency} /> {fmt(subtotal * parseFloat(String(supplier.depositPercent)) / 100)}
            </span>
          </div>
        )}
        <MiniInput label="Warranty (years)" type="number" value={supplier.warrantyYears ?? ''} onChange={(v) => onUpdate({ warrantyYears: v ? parseInt(v) : null })} />
        <div className="col-span-2">
          <label className="mb-0.5 block text-[10px] font-medium text-gray-400">Valid Until</label>
          <input
            type="date"
            value={validUntilStr}
            onChange={(e) => onUpdate({ validUntil: e.target.value || null })}
            className="w-full rounded border border-gray-200 bg-gray-50 px-1.5 py-1 text-xs text-gray-700 focus:border-[#DC2626] focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* Quotation Files */}
      <div
        className="mt-2"
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[10px] font-medium text-gray-400">Quotation Files</label>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-[#DC2626] hover:bg-red-50 transition-colors"
          >
            <Upload className="h-3 w-3" /> Attach
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_STRING}
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
        {isDragging ? (
          <div className="rounded-lg border-2 border-dashed border-[#DC2626] bg-red-50/50 py-4 text-center transition-all">
            <Upload className="mx-auto h-5 w-5 text-[#DC2626]" />
            <p className="mt-1 text-[10px] font-medium text-[#DC2626]">Drop files here</p>
          </div>
        ) : (
          <>
            {quotFiles.length > 0 && (
              <div className="space-y-1">
                {quotFiles.map((file, idx) => (
                  <div key={`${file.name}-${file.addedAt}`} className="group flex items-center gap-2 rounded border border-gray-100 bg-gray-50 px-2 py-1">
                    <span className={cn('flex h-5 w-8 items-center justify-center rounded text-[8px] font-bold', fileIconColor(file.name))}>
                      {fileIcon(file.name)}
                    </span>
                    <button
                      type="button"
                      onClick={() => openFile(file)}
                      className="flex-1 truncate text-left text-[11px] text-gray-700 hover:text-[#DC2626] hover:underline"
                    >
                      {file.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      className="shrink-0 rounded p-0.5 text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {quotFiles.length === 0 && (
              <div className="rounded-lg border border-dashed border-gray-200 py-3 text-center cursor-pointer hover:border-gray-300 transition-colors" onClick={() => fileInputRef.current?.click()}>
                <Upload className="mx-auto h-4 w-4 text-gray-300" />
                <p className="mt-1 text-[10px] text-gray-400">Drop files or click to attach</p>
                <p className="text-[9px] text-gray-300">PDF, Word, Excel</p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="mt-2 flex items-center gap-2">
        <select
          value={supplier.decision}
          onChange={(e) => onUpdate({ decision: e.target.value })}
          className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 focus:border-[#DC2626] focus:outline-none"
        >
          {DECISION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button
          type="button"
          onClick={onSelectFinal}
          className="flex items-center gap-1 rounded bg-green-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-green-700"
        >
          <Award className="h-3 w-3" /> Select
        </button>
      </div>
    </div>
  );
}

function MiniInput({ label, value, onChange, type = 'text' }: { label: string; value: string | number; onChange: (v: string) => void; type?: string }) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const [local, setLocal] = useState(String(value));
  React.useEffect(() => { setLocal(String(value)); }, [value]);
  const commit = (v: string) => { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = setTimeout(() => onChange(v), 600); };
  return (
    <div>
      <label className="mb-0.5 block text-[10px] font-medium text-gray-400">{label}</label>
      <input type={type} value={local} onChange={(e) => { setLocal(e.target.value); commit(e.target.value); }} className="w-full rounded border border-gray-200 bg-gray-50 px-1.5 py-1 text-xs text-gray-700 focus:border-[#DC2626] focus:bg-white focus:outline-none" />
    </div>
  );
}

function fmt(val: number | string | null | undefined) {
  if (val == null) return '—';
  const n = typeof val === 'string' ? parseFloat(val) : val;
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ═══════════════════════════════════════
// INLINE EDITABLE CELLS
// ═══════════════════════════════════════

function EditableText({ value, onSave, placeholder = '—', className = '', disabled = false }: { value: string; onSave: (val: string) => void; placeholder?: string; className?: string; disabled?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (!editing) setLocal(value); }, [value, editing]);
  React.useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  const commit = () => { setEditing(false); if (local !== value) onSave(local); };
  if (disabled) return <span className={cn('text-sm', className)}>{value || placeholder}</span>;
  if (editing) return <input ref={ref} value={local} onChange={(e) => setLocal(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setLocal(value); setEditing(false); } }} className="w-full rounded border border-[#DC2626] bg-white px-1.5 py-0.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#DC2626]" />;
  return <div onClick={() => setEditing(true)} className={cn('min-h-[24px] cursor-text rounded px-1.5 py-0.5 text-sm transition-colors hover:bg-gray-100', value ? '' : 'text-gray-300', className)}>{value || placeholder}</div>;
}

function EditableNumber({ value, onSave, placeholder = '—', className = '', allowNull = false, disabled = false }: { value: number | null; onSave: (val: number | null) => void; placeholder?: string; className?: string; allowNull?: boolean; disabled?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value != null ? String(value) : '');
  const ref = useRef<HTMLInputElement>(null);
  React.useEffect(() => { if (!editing) setLocal(value != null ? String(value) : ''); }, [value, editing]);
  React.useEffect(() => { if (editing) ref.current?.focus(); }, [editing]);
  const commit = () => { setEditing(false); const t = local.trim(); if (t === '' && allowNull) { if (value !== null) onSave(null); return; } const n = parseFloat(t); if (!isNaN(n) && n !== value) onSave(n); };
  if (disabled) return <span className={cn('text-sm', className)}>{value != null ? value : placeholder}</span>;
  if (editing) return <input ref={ref} type="number" step="any" value={local} onChange={(e) => setLocal(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setLocal(value != null ? String(value) : ''); setEditing(false); } }} className="w-full rounded border border-[#DC2626] bg-white px-1.5 py-0.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#DC2626] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />;
  return <div onClick={() => setEditing(true)} className={cn('min-h-[24px] cursor-text rounded px-1.5 py-0.5 text-sm transition-colors hover:bg-gray-100', value != null ? '' : 'text-gray-300', className)}>{value != null ? value : placeholder}</div>;
}

// ═══════════════════════════════════════
// CURRENCY PICKER (custom dropdown with SAR icon)
// ═══════════════════════════════════════

function CurrencyPicker({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className="flex items-center gap-1.5 rounded border border-gray-300 bg-white px-2.5 py-1 text-xs font-bold text-gray-700 shadow-sm transition-colors hover:bg-gray-50 focus:border-[#DC2626] focus:outline-none disabled:opacity-50"
      >
        <CurrencySymbol currency={value} className="h-3 w-3" />
        <span>{value}</span>
        <ChevronDown className="h-3 w-3 text-gray-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {CURRENCIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => { onChange(c.value); setOpen(false); }}
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-gray-100',
                c.value === value && 'bg-gray-50 font-bold text-[#DC2626]',
              )}
            >
              <CurrencySymbol currency={c.value} className="h-3.5 w-3.5" />
              <span>{c.value}</span>
              {c.value === value && <span className="ml-auto text-[10px] text-[#DC2626]">&#10003;</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

