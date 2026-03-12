'use client';

import * as React from 'react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Modal, Input, useToast } from '@/components/ui';
import { useSocketEvent } from '@/hooks/use-socket';
import { formatDateRelative, cn } from '@/lib/utils';
import {
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Crown,
  File,
  FileSpreadsheet,
  FileText,
  Globe,
  Image,
  Loader2,
  Mail,
  Plus,
  Trash2,
  Trophy,
  Upload,
  X,
} from 'lucide-react';

// ─── Types ───

interface CandidateInfo {
  id: string;
  name: string;
  country: string | null;
  capabilities: string[];
  contactPerson: string | null;
  email: string | null;
  whatsapp: string | null;
  wechatId: string | null;
}

interface QFile {
  id: string;
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number | null;
  uploadedBy: { id: string; name: string };
  createdAt: string;
}

interface CompAttribute {
  id: string;
  name: string;
  orderIndex: number;
}

interface CompValue {
  id: string;
  value: string;
  attribute: { id: string; name: string; orderIndex: number };
}

interface QSupplier {
  id: string;
  candidateId: string;
  candidate: CandidateInfo;
  files: QFile[];
  values: CompValue[];
}

interface QCapability {
  id: string;
  name: string;
  orderIndex: number;
  suppliers: QSupplier[];
  attributes: CompAttribute[];
  winner: { id: string; candidate: { id: string; name: string } } | null;
}

// ─── Constants ───

const FILE_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  PDF: { icon: FileText, color: 'bg-red-50 text-red-500' },
  SPREADSHEET: { icon: FileSpreadsheet, color: 'bg-green-50 text-green-600' },
  DOCUMENT: { icon: FileText, color: 'bg-blue-50 text-blue-500' },
  IMAGE: { icon: Image, color: 'bg-purple-50 text-purple-500' },
  CAD: { icon: FileText, color: 'bg-orange-50 text-orange-600' },
  ARCHIVE: { icon: File, color: 'bg-amber-50 text-amber-600' },
  OTHER: { icon: File, color: 'bg-gray-100 text-gray-500' },
};

const COUNTRY_FLAGS: Record<string, string> = {
  'China': '🇨🇳', 'Saudi Arabia': '🇸🇦', 'Turkey': '🇹🇷', 'India': '🇮🇳',
  'Germany': '🇩🇪', 'Italy': '🇮🇹', 'Japan': '🇯🇵', 'South Korea': '🇰🇷',
  'Taiwan': '🇹🇼', 'Vietnam': '🇻🇳', 'Thailand': '🇹🇭', 'Indonesia': '🇮🇩',
  'Malaysia': '🇲🇾', 'UAE': '🇦🇪', 'United States': '🇺🇸', 'United Kingdom': '🇬🇧',
  'France': '🇫🇷', 'Spain': '🇪🇸', 'Brazil': '🇧🇷', 'Mexico': '🇲🇽',
  'Bangladesh': '🇧🇩', 'Pakistan': '🇵🇰', 'Egypt': '🇪🇬', 'Philippines': '🇵🇭',
  'Cambodia': '🇰🇭', 'Singapore': '🇸🇬', 'Netherlands': '🇳🇱', 'Poland': '🇵🇱',
  'Czech Republic': '🇨🇿', 'Australia': '🇦🇺', 'Canada': '🇨🇦', 'Russia': '🇷🇺',
};

const HIGHLIGHT_ATTRS = new Set(['Price', 'Lead Time']);

// ─── Main Component ───

export default function QuotationWorkspace({
  projectId,
  stageId,
  stageName,
  stageStatus,
  onRefetch,
  onStatusChange,
}: {
  projectId: string;
  stageId: string;
  stageName: string;
  stageStatus: string;
  onRefetch: () => void;
  onStatusChange: (status: string) => void;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const apiBase = `/api/v1/projects/${projectId}/stages/${stageId}/quotation`;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const { data: capabilities = [], isLoading } = useQuery({
    queryKey: ['quotation-caps', projectId, stageId],
    queryFn: () => api.get<QCapability[]>(`${apiBase}/capabilities`),
  });

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['quotation-caps', projectId, stageId] });
    onRefetch();
  }, [queryClient, projectId, stageId, onRefetch]);

  useSocketEvent('project.stage.updated', refetch, [refetch]);

  const [syncing, setSyncing] = useState(false);
  const syncRef = useRef(false);

  useEffect(() => {
    if (syncRef.current) return;
    syncRef.current = true;
    setSyncing(true);
    api.post(`${apiBase}/init`)
      .then(() => refetch())
      .catch(() => {})
      .finally(() => setSyncing(false));
  }, [apiBase, refetch]);

  const hasCapabilities = capabilities.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{stageName}</h1>
          <p className="text-sm text-gray-500">
            {hasCapabilities
              ? `${capabilities.length} capability section${capabilities.length !== 1 ? 's' : ''}`
              : 'Loading capabilities from Supplier Shortlist...'}
          </p>
        </div>
      </div>

      {/* Content */}
      {isLoading || syncing ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#DC2626]" />
        </div>
      ) : !hasCapabilities ? (
        <div className="flex flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed border-gray-200 bg-white py-20">
          <Trophy className="h-14 w-14 text-gray-300" />
          <div className="text-center">
            <p className="text-base font-medium text-gray-700">No capabilities found</p>
            <p className="mt-1 text-sm text-gray-500">
              Add suppliers with capabilities in the "Supplier Shortlist" stage first.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {capabilities.map((cap) => (
            <CapabilityPanel
              key={cap.id}
              cap={cap}
              projectId={projectId}
              stageId={stageId}
              apiBase={apiBase}
              apiUrl={apiUrl}
              onRefetch={refetch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Capability Panel ───

function CapabilityPanel({
  cap,
  projectId,
  stageId,
  apiBase,
  apiUrl,
  onRefetch,
}: {
  cap: QCapability;
  projectId: string;
  stageId: string;
  apiBase: string;
  apiUrl: string;
  onRefetch: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { addToast } = useToast();

  const winnerMutation = useMutation({
    mutationFn: (candidateId: string) =>
      api.post(`${apiBase}/${cap.id}/winner`, { candidateId }),
    onSuccess: () => { onRefetch(); addToast('Winner selected', 'success'); },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const clearWinnerMutation = useMutation({
    mutationFn: () => api.delete(`${apiBase}/${cap.id}/winner`),
    onSuccess: () => { onRefetch(); addToast('Winner cleared', 'success'); },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const supplierCount = cap.suppliers.length;
  const fileCount = cap.suppliers.reduce((sum, s) => sum + s.files.length, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      {/* Panel Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-gray-50"
      >
        {expanded ? (
          <ChevronDown className="h-5 w-5 text-gray-400" />
        ) : (
          <ChevronRight className="h-5 w-5 text-gray-400" />
        )}
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-gray-900">{cap.name}</h2>
          <p className="text-xs text-gray-500">
            {supplierCount} supplier{supplierCount !== 1 ? 's' : ''}
            {' · '}
            {fileCount} file{fileCount !== 1 ? 's' : ''}
          </p>
        </div>
        {cap.winner && (
          <div className="flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1.5">
            <Crown className="h-4 w-4 text-amber-500" />
            <span className="text-sm font-medium text-amber-700">{cap.winner.candidate.name}</span>
          </div>
        )}
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-5 pb-5 pt-4 space-y-6">
          {/* Suppliers + File Upload */}
          <SuppliersList
            suppliers={cap.suppliers}
            capId={cap.id}
            projectId={projectId}
            stageId={stageId}
            apiBase={apiBase}
            apiUrl={apiUrl}
            onRefetch={onRefetch}
          />

          {/* Comparison Table */}
          {cap.suppliers.length > 0 && (
            <ComparisonTable
              cap={cap}
              apiBase={apiBase}
              onRefetch={onRefetch}
              onSelectWinner={(candidateId) => winnerMutation.mutate(candidateId)}
              onClearWinner={() => clearWinnerMutation.mutate()}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── Suppliers List ───

function SuppliersList({
  suppliers,
  capId,
  projectId,
  stageId,
  apiBase,
  apiUrl,
  onRefetch,
}: {
  suppliers: QSupplier[];
  capId: string;
  projectId: string;
  stageId: string;
  apiBase: string;
  apiUrl: string;
  onRefetch: () => void;
}) {
  const { addToast } = useToast();

  if (suppliers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-200 py-6 text-center">
        <Building2 className="mx-auto h-8 w-8 text-gray-300" />
        <p className="mt-2 text-sm text-gray-500">
          No suppliers with this capability in Supplier Shortlist.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-700">Suppliers & Quotation Files</h3>
      <div className="space-y-2">
        {suppliers.map((sup) => (
          <SupplierRow
            key={sup.id}
            supplier={sup}
            capId={capId}
            projectId={projectId}
            stageId={stageId}
            apiBase={apiBase}
            apiUrl={apiUrl}
            onRefetch={onRefetch}
          />
        ))}
      </div>
    </div>
  );
}

function SupplierRow({
  supplier,
  capId,
  projectId,
  stageId,
  apiBase,
  apiUrl,
  onRefetch,
}: {
  supplier: QSupplier;
  capId: string;
  projectId: string;
  stageId: string;
  apiBase: string;
  apiUrl: string;
  onRefetch: () => void;
}) {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [showFiles, setShowFiles] = useState(supplier.files.length > 0);

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => api.delete(`${apiBase}/files/${fileId}`),
    onSuccess: () => { onRefetch(); addToast('File deleted', 'success'); },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const uploadFiles = async (fileList: globalThis.File[]) => {
    if (fileList.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (const f of fileList) formData.append('files', f);
      await api.upload(`${apiBase}/${capId}/files/upload?supplierId=${supplier.id}`, formData);
      onRefetch();
      setShowFiles(true);
      addToast(`${fileList.length} file${fileList.length > 1 ? 's' : ''} uploaded`, 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) uploadFiles(files);
  };

  const c = supplier.candidate;
  const flag = c.country ? COUNTRY_FLAGS[c.country] ?? '' : '';

  return (
    <div
      className="rounded-lg border border-gray-100 bg-gray-50/50 transition-colors hover:border-gray-200"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white border border-gray-100">
          <Building2 className="h-5 w-5 text-gray-300" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-sm font-medium text-gray-900">{c.name}</span>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {c.country && <span>{flag} {c.country}</span>}
            {c.contactPerson && <span>· {c.contactPerson}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {supplier.files.length > 0 && (
            <button
              type="button"
              onClick={() => setShowFiles(!showFiles)}
              className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-200"
            >
              {supplier.files.length} file{supplier.files.length !== 1 ? 's' : ''}
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-lg bg-[#DC2626] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#C41E1E] disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Upload Quotation
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const selected = Array.from(e.target.files ?? []);
            if (selected.length > 0) uploadFiles(selected);
            e.target.value = '';
          }}
        />
      </div>

      {/* File list */}
      {showFiles && supplier.files.length > 0 && (
        <div className="border-t border-gray-100 px-4 py-2 space-y-1">
          {supplier.files.map((file) => {
            const ft = FILE_ICONS[file.fileType] ?? FILE_ICONS.OTHER;
            const Icon = ft.icon;
            const href = `${apiUrl}${file.filePath}`;
            const isImage = file.fileType === 'IMAGE';
            return (
              <div key={file.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white">
                {isImage ? (
                  <div className="h-8 w-8 shrink-0 overflow-hidden rounded border border-gray-200">
                    <img src={href} alt={file.fileName} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded', ft.color)}>
                    <Icon className="h-4 w-4" />
                  </div>
                )}
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700 hover:text-[#DC2626] hover:underline"
                >
                  {file.fileName}
                </a>
                <span className="text-[10px] text-gray-400">{formatDateRelative(file.createdAt)}</span>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(file.id)}
                  className="rounded p-1 text-gray-300 opacity-0 hover:bg-red-100 hover:text-red-500 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Comparison Table ───

function ComparisonTable({
  cap,
  apiBase,
  onRefetch,
  onSelectWinner,
  onClearWinner,
}: {
  cap: QCapability;
  apiBase: string;
  onRefetch: () => void;
  onSelectWinner: (candidateId: string) => void;
  onClearWinner: () => void;
}) {
  const { addToast } = useToast();
  const [addingAttr, setAddingAttr] = useState(false);
  const [newAttrName, setNewAttrName] = useState('');
  const attrInputRef = useRef<HTMLInputElement>(null);

  const addAttrMutation = useMutation({
    mutationFn: (name: string) => api.post(`${apiBase}/${cap.id}/attributes`, { name }),
    onSuccess: () => { onRefetch(); setAddingAttr(false); setNewAttrName(''); addToast('Column added', 'success'); },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const deleteAttrMutation = useMutation({
    mutationFn: (attrId: string) => api.delete(`${apiBase}/attributes/${attrId}`),
    onSuccess: () => { onRefetch(); addToast('Column removed', 'success'); },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const updateValueMutation = useMutation({
    mutationFn: (dto: { attributeId: string; supplierId: string; value: string }) =>
      api.patch(`${apiBase}/values`, dto),
    onSuccess: () => onRefetch(),
  });

  const getValue = (supplierId: string, attrId: string) => {
    const supplier = cap.suppliers.find((s) => s.id === supplierId);
    return supplier?.values.find((v) => v.attribute.id === attrId)?.value ?? '';
  };

  const findBestValues = (attrName: string) => {
    if (!HIGHLIGHT_ATTRS.has(attrName)) return new Set<string>();
    const numericValues = cap.suppliers.map((s) => {
      const val = s.values.find((v) => v.attribute.name === attrName)?.value ?? '';
      const num = parseFloat(val.replace(/[^0-9.]/g, ''));
      return { id: s.id, num: isNaN(num) ? Infinity : num };
    }).filter((v) => v.num !== Infinity);

    if (numericValues.length === 0) return new Set<string>();
    const minVal = Math.min(...numericValues.map((v) => v.num));
    return new Set(numericValues.filter((v) => v.num === minVal).map((v) => v.id));
  };

  React.useEffect(() => {
    if (addingAttr) attrInputRef.current?.focus();
  }, [addingAttr]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">Comparison Table</h3>
        {cap.winner && (
          <button
            type="button"
            onClick={onClearWinner}
            className="text-xs text-gray-400 hover:text-red-500 hover:underline"
          >
            Clear winner
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="sticky left-0 z-10 bg-gray-50 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Supplier
              </th>
              {cap.attributes.map((attr) => (
                <th key={attr.id} className="group relative px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <div className="flex items-center gap-1">
                    {attr.name}
                    <button
                      type="button"
                      onClick={() => deleteAttrMutation.mutate(attr.id)}
                      className="rounded p-0.5 text-gray-300 opacity-0 hover:text-red-500 group-hover:opacity-100"
                      title="Remove column"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </th>
              ))}
              <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                Winner
              </th>
              <th className="px-2 py-2.5">
                {addingAttr ? (
                  <div className="flex items-center gap-1">
                    <input
                      ref={attrInputRef}
                      value={newAttrName}
                      onChange={(e) => setNewAttrName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && newAttrName.trim()) addAttrMutation.mutate(newAttrName.trim());
                        if (e.key === 'Escape') { setAddingAttr(false); setNewAttrName(''); }
                      }}
                      placeholder="Column name..."
                      className="w-28 rounded border border-gray-300 px-2 py-1 text-xs focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
                    />
                    <button
                      type="button"
                      onClick={() => { if (newAttrName.trim()) addAttrMutation.mutate(newAttrName.trim()); }}
                      disabled={!newAttrName.trim()}
                      className="rounded bg-[#DC2626] p-1 text-white disabled:opacity-50"
                    >
                      <Check className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddingAttr(false); setNewAttrName(''); }}
                      className="rounded p-1 text-gray-400 hover:text-gray-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingAttr(true)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-[#DC2626] hover:bg-red-50"
                    title="Add column"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {cap.suppliers.map((sup) => {
              const isWinner = cap.winner?.candidate.id === sup.candidate.id;
              return (
                <tr
                  key={sup.id}
                  className={cn('transition-colors', isWinner ? 'bg-amber-50/60' : 'hover:bg-gray-50/50')}
                >
                  <td className="sticky left-0 z-10 bg-inherit px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {isWinner && <Crown className="h-4 w-4 text-amber-500" />}
                      <div>
                        <span className="text-sm font-medium text-gray-900">{sup.candidate.name}</span>
                        {sup.candidate.country && (
                          <p className="text-[11px] text-gray-400">
                            {COUNTRY_FLAGS[sup.candidate.country] ?? ''} {sup.candidate.country}
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  {cap.attributes.map((attr) => {
                    const bestSet = findBestValues(attr.name);
                    const isBest = bestSet.has(sup.id);
                    return (
                      <td key={attr.id} className="px-4 py-2.5">
                        <InlineEditCell
                          value={getValue(sup.id, attr.id)}
                          isBest={isBest}
                          onChange={(val) =>
                            updateValueMutation.mutate({
                              attributeId: attr.id,
                              supplierId: sup.id,
                              value: val,
                            })
                          }
                        />
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5">
                    {isWinner ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700">
                        <Trophy className="h-3 w-3" /> Winner
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSelectWinner(sup.candidate.id)}
                        className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-500 transition-colors hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700"
                      >
                        Select
                      </button>
                    )}
                  </td>
                  <td />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Inline Edit Cell ───

function InlineEditCell({
  value,
  isBest,
  onChange,
}: {
  value: string;
  isBest: boolean;
  onChange: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const [committed, setCommitted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!editing) setLocalValue(value);
  }, [value, editing]);

  React.useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (localValue !== value) {
      setCommitted(true);
      onChange(localValue);
    }
  };

  const displayValue = committed ? localValue : (localValue || value);

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') { setLocalValue(value); setEditing(false); }
        }}
        className="w-full min-w-[80px] rounded border border-[#DC2626] bg-white px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
      />
    );
  }

  return (
    <div
      onClick={() => setEditing(true)}
      className={cn(
        'min-h-[28px] min-w-[80px] cursor-text rounded px-2 py-1 text-sm transition-colors hover:bg-gray-100',
        displayValue ? 'text-gray-900' : 'text-gray-300',
        isBest && displayValue ? 'bg-green-50 font-semibold text-green-700' : '',
      )}
    >
      {displayValue || '—'}
    </div>
  );
}
