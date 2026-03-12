'use client';

import * as React from 'react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Input, Select, useToast, type SelectOption } from '@/components/ui';
import { formatDateRelative, cn } from '@/lib/utils';
import {
  Upload,
  FileText,
  Image as ImageIcon,
  File as FileIcon,
  Trash2,
  Loader2,
  Plus,
  DollarSign,
  MessageSquare,
  CheckCircle2,
  Clock,
  Send,
  Search,
  Handshake,
  XCircle,
  ExternalLink,
  ChevronRight,
  Printer,
  Percent,
  ChevronUp,
  ChevronDown,
  Languages,
} from 'lucide-react';

// ─── Types ───

interface ApprovalFile {
  id: string;
  fileName: string;
  filePath: string;
  fileType: string;
  fileSize: number | null;
  uploadedBy: { id: string; name: string };
  createdAt: string;
}

interface PricingItem {
  id: string;
  itemName: string;
  amount: string;
  currency: string;
}

interface ApprovalStatus {
  id: string;
  status: string;
  updatedBy: { id: string; name: string };
  updatedAt: string;
}

interface ApprovalNote {
  id: string;
  content: string;
  createdBy: { id: string; name: string };
  createdAt: string;
}

interface CostLine {
  itemId: string;
  itemName: string;
  itemNameAr: string | null;
  description: string | null;
  qty: number;
  unitPrice: number;
  amount: number;
  imageUrl: string | null;
}

interface CostCapability {
  comparisonId: string;
  capability: string;
  capabilityAr: string | null;
  supplierName: string;
  currency: string;
  profitPercent: number;
  imageUrl: string | null;
  lines: CostLine[];
  subtotal: number;
  leadTimeDays: number | null;
  warrantyYears: number | null;
  depositPercent: number | null;
  paymentTerms: string | null;
  validUntil: string | null;
  conditions: string[];
}

interface CostSummary {
  items: CostCapability[];
  stageId: string | null;
  allComparisonIds: string[];
  projectName: string | null;
  customerName: string | null;
  customerPhone: string | null;
  includeVat: boolean;
  quoteCurrency: string;
}

interface WorkspaceData {
  files: ApprovalFile[];
  pricing: PricingItem[];
  status: ApprovalStatus | null;
  notes: ApprovalNote[];
  costSummary: CostSummary;
}

// ─── Constants ───

type WorkspaceTab = 'quotation' | 'status';

const TABS: { key: WorkspaceTab; label: string; icon: React.ElementType }[] = [
  { key: 'quotation', label: 'Client Quotation', icon: FileText },
  { key: 'status', label: 'Client Status', icon: Clock },
];

const STATUS_PIPELINE = [
  { value: 'DRAFT', label: 'Draft', icon: FileText, color: 'gray' },
  { value: 'SENT_TO_CLIENT', label: 'Sent to Client', icon: Send, color: 'blue' },
  { value: 'CLIENT_REVIEWING', label: 'Client Reviewing', icon: Search, color: 'indigo' },
  { value: 'NEGOTIATION', label: 'Negotiation', icon: Handshake, color: 'yellow' },
  { value: 'ACCEPTED', label: 'Accepted', icon: CheckCircle2, color: 'green' },
  { value: 'REJECTED', label: 'Rejected', icon: XCircle, color: 'red' },
] as const;

const STATUS_STYLES: Record<string, { bg: string; text: string; ring: string; dot: string }> = {
  DRAFT: { bg: 'bg-gray-50', text: 'text-gray-700', ring: 'ring-gray-300', dot: 'bg-gray-400' },
  SENT_TO_CLIENT: { bg: 'bg-blue-50', text: 'text-blue-700', ring: 'ring-blue-300', dot: 'bg-blue-500' },
  CLIENT_REVIEWING: { bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-300', dot: 'bg-indigo-500' },
  NEGOTIATION: { bg: 'bg-yellow-50', text: 'text-yellow-700', ring: 'ring-yellow-300', dot: 'bg-yellow-500' },
  ACCEPTED: { bg: 'bg-green-50', text: 'text-green-700', ring: 'ring-green-400', dot: 'bg-green-500' },
  REJECTED: { bg: 'bg-red-50', text: 'text-red-700', ring: 'ring-red-300', dot: 'bg-red-500' },
};

const CURRENCY_OPTIONS: SelectOption[] = [
  { value: 'SAR', label: 'SAR' },
  { value: 'USD', label: 'USD' },
  { value: 'EUR', label: 'EUR' },
  { value: 'CNY', label: 'CNY' },
];

const FILE_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  PDF: { icon: FileText, color: 'bg-red-50 text-red-500' },
  SPREADSHEET: { icon: FileText, color: 'bg-green-50 text-green-600' },
  DOCUMENT: { icon: FileText, color: 'bg-blue-50 text-blue-500' },
  IMAGE: { icon: ImageIcon, color: 'bg-purple-50 text-purple-500' },
  OTHER: { icon: FileIcon, color: 'bg-gray-100 text-gray-500' },
};

// ─── Main Component ───

export default function ClientApprovalWorkspace({
  projectId,
  stageId,
  stageName,
  onRefetch: parentRefetch,
}: {
  projectId: string;
  stageId: string;
  stageName: string;
  stageStatus: string;
  onRefetch: () => void;
  onStatusChange: (status: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('quotation');
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const apiBase = `/api/v1/projects/${projectId}/client-approval`;
  const staticBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['client-approval', projectId],
    queryFn: () => api.get<WorkspaceData>(apiBase),
  });

  const workspace = data ?? { files: [], pricing: [], status: null, notes: [], costSummary: { items: [], stageId: null, allComparisonIds: [], projectName: null, customerName: null, customerPhone: null, includeVat: false, quoteCurrency: 'SAR' } as CostSummary };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{stageName}</h1>
        <p className="text-sm text-gray-500">
          Build client quotation with profit margin and generate printable A4 document
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const count = 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                activeTab === tab.key
                  ? 'border-[#DC2626] text-[#DC2626]'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {count > 0 && (
                <span className={cn(
                  'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  activeTab === tab.key ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600',
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#DC2626]" />
        </div>
      ) : (
        <>
          {activeTab === 'quotation' && (
            <QuotationBuilder
              projectId={projectId}
              costSummary={workspace.costSummary}
              onRefetch={refetch}
            />
          )}
          {activeTab === 'status' && (
            <StatusPanel projectId={projectId} status={workspace.status} onRefetch={refetch} onStageRefetch={parentRefetch} />
          )}
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// IMAGE PICKER MODAL (Paste / Browse)
// ═══════════════════════════════════════

function ImagePickerModal({ onSelect, onClose }: { onSelect: (dataUrl: string) => void; onClose: () => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => { if (e.target?.result) setPreview(e.target.result as string); };
    reader.readAsDataURL(file);
  }, []);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) processFile(file);
          e.preventDefault();
          break;
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processFile]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gray-900">Add Image</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-gray-400 hover:text-gray-600">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {preview ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 flex items-center justify-center">
              <img src={preview} alt="Preview" className="max-h-64 max-w-full object-contain rounded" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="md" onClick={() => setPreview(null)}>
                Change
              </Button>
              <Button variant="primary" size="md" onClick={() => onSelect(preview)}>
                <CheckCircle2 className="h-4 w-4" /> Use this image
              </Button>
            </div>
          </div>
        ) : (
          <div
            ref={dropRef}
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            className="rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center hover:border-gray-400 transition-colors"
          >
            <ImageIcon className="mx-auto h-10 w-10 text-gray-300" />
            <div className="mt-3 text-sm font-medium text-gray-600">Paste image from clipboard</div>
            <div className="mt-1 text-xs text-gray-400">Ctrl+V to paste a screenshot or copied image</div>
            <div className="mt-4 flex items-center gap-3 justify-center">
              <div className="h-px w-16 bg-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="h-px w-16 bg-gray-200" />
            </div>
            <Button variant="secondary" size="md" className="mt-4" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" /> Browse from device
            </Button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) processFile(f);
                e.target.value = '';
              }} />
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// CONDITIONS EDITOR
// ═══════════════════════════════════════

const SUGGESTIONS_KEY = 'hqq-condition-suggestions';

function loadSuggestions(): string[] {
  try {
    const raw = localStorage.getItem(SUGGESTIONS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveSuggestions(list: string[]) {
  localStorage.setItem(SUGGESTIONS_KEY, JSON.stringify(list));
}

function ConditionsEditor({ conditions, onSave }: { conditions: string[]; onSave: (updated: string[]) => void }) {
  const [localConditions, setLocalConditions] = useState<string[]>(conditions);
  const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [newSuggestion, setNewSuggestion] = useState('');
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLocalConditions(conditions);
  }, [conditions]);

  useEffect(() => {
    localConditions.forEach((_, i) => {
      const el = textareaRefs.current[i];
      if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
    });
  }, [localConditions]);

  useEffect(() => {
    if (showSuggestions) {
      setSuggestions(loadSuggestions());
    }
  }, [showSuggestions]);

  useEffect(() => {
    if (!showSuggestions) return;
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showSuggestions]);

  const saveAll = (updated: string[]) => {
    const cleaned = updated.filter((c) => c.trim().length > 0);
    onSave(cleaned);
  };

  const handleBlur = (ci: number) => {
    const val = localConditions[ci];
    if (val !== conditions[ci]) {
      saveAll(localConditions);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, ci: number) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const updated = [...localConditions];
      const currentVal = updated[ci]?.trim();
      if (!currentVal) return;
      updated.splice(ci + 1, 0, '');
      setLocalConditions(updated);
      onSave(updated.filter((c) => c.trim().length > 0));
      setTimeout(() => textareaRefs.current[ci + 1]?.focus(), 50);
    }
  };

  const addCondition = (text = '') => {
    const updated = [...localConditions, text];
    setLocalConditions(updated);
    if (text) {
      saveAll(updated);
    } else {
      setTimeout(() => textareaRefs.current[updated.length - 1]?.focus(), 50);
    }
    setShowSuggestions(false);
  };

  const removeCondition = (ci: number) => {
    const updated = localConditions.filter((_, i) => i !== ci);
    setLocalConditions(updated);
    saveAll(updated);
  };

  const moveCondition = (ci: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? ci - 1 : ci + 1;
    if (target < 0 || target >= localConditions.length) return;
    const updated = [...localConditions];
    [updated[ci], updated[target]] = [updated[target], updated[ci]];
    setLocalConditions(updated);
    saveAll(updated);
  };

  const addSuggestionTemplate = () => {
    const text = newSuggestion.trim();
    if (!text || suggestions.includes(text)) return;
    const updated = [...suggestions, text];
    setSuggestions(updated);
    saveSuggestions(updated);
    setNewSuggestion('');
  };

  const removeSuggestionTemplate = (idx: number) => {
    const updated = suggestions.filter((_, i) => i !== idx);
    setSuggestions(updated);
    saveSuggestions(updated);
  };

  return (
    <div className="border-t border-gray-100 overflow-hidden">
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center">
        <span className="text-xs font-bold text-amber-800">الشروط والأحكام</span>
      </div>
      {localConditions.length > 0 && (
        <table className="w-full border-collapse" dir="rtl">
          <thead>
            <tr className="bg-gray-700 border-b border-gray-600">
              <th className="w-8 px-2 py-2 text-center text-xs font-bold text-white">#</th>
              <th className="px-3 py-2 text-right text-xs font-bold text-white">الشرط</th>
              <th className="w-16 px-2 py-2 text-center text-xs font-bold text-white">ترتيب</th>
              <th className="w-8 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {localConditions.map((cond, ci) => (
              <tr key={`cond-${ci}`} className={cn(
                'group border-b border-gray-200 transition-colors hover:bg-blue-50/40',
                ci % 2 === 0 ? 'bg-white' : 'bg-gray-200/50'
              )}>
                <td className="px-2 py-2 text-center text-xs font-bold text-gray-400 align-top">{ci + 1}</td>
                <td className="px-2 py-1 align-top">
                  <textarea
                    ref={(el) => { textareaRefs.current[ci] = el; }}
                    dir="rtl"
                    rows={1}
                    value={cond}
                    placeholder="اكتب الشرط هنا..."
                    onChange={(e) => {
                      const updated = [...localConditions];
                      updated[ci] = e.target.value;
                      setLocalConditions(updated);
                    }}
                    onBlur={() => handleBlur(ci)}
                    onKeyDown={(e) => handleKeyDown(e, ci)}
                    className="w-full resize-none rounded border border-transparent bg-transparent px-2 py-1.5 text-xs leading-relaxed text-gray-700 placeholder:text-gray-300 hover:border-gray-200 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400/30"
                    style={{ minHeight: '28px', overflow: 'hidden' }}
                  />
                </td>
                <td className="px-1 py-2 text-center align-top">
                  <div className="inline-flex items-center rounded-md border border-gray-200 bg-white">
                    <button type="button" disabled={ci === 0} onClick={() => moveCondition(ci, 'up')}
                      className="rounded-r-md px-1 py-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <div className="w-px h-4 bg-gray-200" />
                    <button type="button" disabled={ci === localConditions.length - 1} onClick={() => moveCondition(ci, 'down')}
                      className="rounded-l-md px-1 py-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
                <td className="px-2 py-2 text-center align-top">
                  <button type="button" onClick={() => removeCondition(ci)}
                    className="rounded p-1 text-gray-300 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="border-t border-gray-200 bg-gray-50 px-4 py-2 text-center">
        <button type="button" onClick={() => setShowSuggestions(true)}
          className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-200 transition-colors">
          <Plus className="h-3 w-3" /> إضافة شرط
        </button>
      </div>

      {showSuggestions && (
        <>
          <div className="fixed inset-0 bg-black/40 z-[100]" onClick={() => setShowSuggestions(false)} />
          <div ref={suggestionsRef} dir="rtl"
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] rounded-xl border border-gray-200 bg-white shadow-2xl z-[101] flex flex-col" style={{ maxHeight: '80vh' }}>
            <div className="flex items-center justify-between bg-gray-700 px-4 py-3 rounded-t-xl shrink-0">
              <span className="text-sm font-bold text-white">اختر شرط أو أضف جديد</span>
              <button type="button" onClick={() => setShowSuggestions(false)} className="text-gray-300 hover:text-white transition-colors">
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
              {suggestions.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {suggestions.map((s, si) => (
                    <div key={si} className={cn(
                      'flex items-start gap-2 px-4 py-3 hover:bg-blue-50 transition-colors group/s cursor-pointer',
                      si % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                    )} onClick={() => addCondition(s)}>
                      <span className="shrink-0 mt-1 h-2 w-2 rounded-full bg-amber-400" />
                      <span className="flex-1 text-right text-sm text-gray-700 leading-relaxed" style={{ whiteSpace: 'pre-wrap' }}>
                        {s}
                      </span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); removeSuggestionTemplate(si); }}
                        className="shrink-0 mt-0.5 rounded p-1 text-gray-300 opacity-0 group-hover/s:opacity-100 hover:bg-red-50 hover:text-red-500 transition-all">
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm text-gray-400">لا توجد مقترحات محفوظة بعد</p>
                  <p className="text-xs text-gray-300 mt-1">أضف مقترحات من الأسفل لاستخدامها في جميع المشاريع</p>
                </div>
              )}
            </div>

            <div className="border-t-2 border-gray-200 bg-gray-100 p-4 rounded-b-xl shrink-0">
              <div className="flex gap-2 mb-3">
                <textarea dir="rtl" rows={2} value={newSuggestion} onChange={(e) => setNewSuggestion(e.target.value)}
                  placeholder="اكتب مقترح جديد لحفظه للاستخدام في جميع المشاريع..."
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addSuggestionTemplate(); } }}
                  className="flex-1 resize-none rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm leading-relaxed text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400/30"
                />
                <button type="button" onClick={addSuggestionTemplate} disabled={!newSuggestion.trim()}
                  className="self-end shrink-0 rounded-lg bg-blue-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  حفظ مقترح
                </button>
              </div>
              <button type="button" onClick={() => addCondition('')}
                className="w-full rounded-lg border-2 border-dashed border-gray-300 bg-white py-2.5 text-sm font-medium text-gray-500 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-700 transition-colors">
                <Plus className="inline h-3.5 w-3.5 ml-1" /> كتابة شرط جديد فارغ
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// QUOTATION BUILDER (Profit + A4 Preview)
// ═══════════════════════════════════════

function QuotationBuilder({
  projectId,
  costSummary,
  onRefetch,
}: {
  projectId: string;
  costSummary: CostSummary;
  onRefetch: () => void;
}) {
  const { addToast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const [defaultProfit, setDefaultProfit] = useState(15);
  const [sectionProfits, setSectionProfits] = useState<Record<string, number>>({});

  const costItemsKey = costSummary.items.map(c => `${c.comparisonId}:${c.profitPercent}`).join(',');
  useEffect(() => {
    const fromServer: Record<string, number> = {};
    costSummary.items.forEach((cap) => { fromServer[cap.comparisonId] = cap.profitPercent; });
    setSectionProfits(fromServer);
  }, [costItemsKey]);

  const [quoteCurrency, setQuoteCurrency] = useState(costSummary.quoteCurrency || 'SAR');
  const [includeVAT, setIncludeVAT] = useState(costSummary.includeVat ?? false);

  const settingsInitRef = useRef(false);
  useEffect(() => {
    if (!settingsInitRef.current) {
      setQuoteCurrency(costSummary.quoteCurrency || 'SAR');
      setIncludeVAT(costSummary.includeVat ?? false);
      if (costSummary.items.length > 0) settingsInitRef.current = true;
    }
  }, [costSummary.quoteCurrency, costSummary.includeVat, costSummary.items.length]);
  const VAT_RATE = 0.15;
  const [imgModal, setImgModal] = useState<{ open: boolean; callback: ((url: string) => void) | null }>({ open: false, callback: null });

  const stageId = costSummary.stageId;
  const staticBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const apiBase = `/api/v1/projects/${projectId}/stages/${stageId}/quote-comparison`;

  const uploadImage = async (endpoint: string, dataUrl: string): Promise<string> => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const file = new File([blob], `image-${Date.now()}.png`, { type: blob.type });
    const fd = new FormData();
    fd.append('file', file);
    const result = await api.upload(endpoint, fd);
    return (result as { url: string }).url;
  };

  const openSectionImagePicker = (comparisonId: string) => {
    setImgModal({
      open: true,
      callback: async (dataUrl: string) => {
        try {
          await uploadImage(`${apiBase}/${comparisonId}/image`, dataUrl);
          onRefetch();
        } catch (err: any) { addToast(err.message, 'error'); }
      },
    });
  };

  const openItemImagePicker = (itemId: string) => {
    setImgModal({
      open: true,
      callback: async (dataUrl: string) => {
        try {
          await uploadImage(`${apiBase}/items/${itemId}/image`, dataUrl);
          onRefetch();
        } catch (err: any) { addToast(err.message, 'error'); }
      },
    });
  };

  const getProfitFor = (comparisonId: string) => sectionProfits[comparisonId] ?? defaultProfit;

  const queryClient = useQueryClient();

  const saveProfitMutation = useMutation({
    mutationFn: (args: { compId: string; profitPercent: number }) => {
      if (!stageId) throw new Error('Stage not found');
      return api.patch(`/api/v1/projects/${projectId}/stages/${stageId}/quote-comparison/${args.compId}/profit-percent`, { profitPercent: args.profitPercent });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-approval', projectId] });
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: (settings: { includeVat?: boolean; quoteCurrency?: string }) =>
      api.patch(`/api/v1/projects/${projectId}/client-approval/settings`, settings),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-approval', projectId] }),
  });

  const saveConditionsMutation = useMutation({
    mutationFn: (args: { compId: string; conditions: string[] }) => {
      if (!stageId) throw new Error('Stage not found');
      return api.patch(`/api/v1/projects/${projectId}/stages/${stageId}/quote-comparison/${args.compId}/conditions`, { conditions: args.conditions });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['client-approval', projectId] }),
  });

  const applyDefaultToAll = () => {
    const updated: Record<string, number> = {};
    costSummary.items.forEach((cap) => {
      updated[cap.comparisonId] = defaultProfit;
      saveProfitMutation.mutate({ compId: cap.comparisonId, profitPercent: defaultProfit });
    });
    setSectionProfits(updated);
  };

  const FX_RATES: Record<string, number> = { USD: 1, SAR: 3.75, CNY: 7.25, EUR: 0.92 };
  const convert = (amount: number, fromCurrency: string) => {
    if (fromCurrency === quoteCurrency) return amount;
    const fromRate = FX_RATES[fromCurrency] ?? 1;
    const toRate = FX_RATES[quoteCurrency] ?? 1;
    return amount * (toRate / fromRate);
  };

  // Build quotation sections from supplier cost data
  const capabilitySections = costSummary.items.map((cap) => {
    const pct = getProfitFor(cap.comparisonId);
    const srcCurrency = cap.currency;
    const detailLines = cap.lines.map((l) => {
      const unitPrice = convert(l.unitPrice, srcCurrency);
      const cost = convert(l.amount, srcCurrency);
      const rawClientAmount = cost * (1 + pct / 100);
      const clientAmount = Math.ceil(rawClientAmount / 100) * 100;
      const actualProfit = clientAmount - cost;
      return {
        itemId: l.itemId,
        itemName: l.itemName,
        itemNameAr: l.itemNameAr,
        description: l.description,
        qty: l.qty,
        unitPrice,
        cost,
        profit: actualProfit,
        clientUnitPrice: l.qty > 0 ? clientAmount / l.qty : clientAmount,
        clientAmount,
        imageUrl: l.imageUrl,
      };
    });
    const cost = convert(cap.subtotal, srcCurrency);
    const clientPrice = detailLines.reduce((s, dl) => s + dl.clientAmount, 0);
    const profit = clientPrice - cost;
    const terms: string[] = [];
    if (cap.leadTimeDays) terms.push(`Lead Time: ${cap.leadTimeDays} days`);
    if (cap.warrantyYears) terms.push(`Warranty: ${cap.warrantyYears} year${cap.warrantyYears > 1 ? 's' : ''}`);
    if (cap.depositPercent) terms.push(`Deposit: ${cap.depositPercent}%`);
    if (cap.paymentTerms) terms.push(`Payment: ${cap.paymentTerms}`);
    const rawDeposit = cap.depositPercent ? clientPrice * (cap.depositPercent / 100) : 0;
    const depositAmount = rawDeposit > 0 ? Math.ceil(rawDeposit / 100) * 100 : 0;
    return {
      comparisonId: cap.comparisonId,
      capability: cap.capability,
      capabilityAr: cap.capabilityAr,
      supplierName: cap.supplierName,
      imageUrl: cap.imageUrl,
      cost,
      profit,
      profitPercent: pct,
      effectiveProfitPercent: cost > 0 ? (profit / cost) * 100 : 0,
      clientPrice,
      currency: srcCurrency,
      detailLines,
      terms,
      depositPercent: cap.depositPercent,
      depositAmount,
      conditions: cap.conditions ?? [],
    };
  });

  const grandCost = capabilitySections.reduce((s, c) => s + c.cost, 0);
  const grandProfit = capabilitySections.reduce((s, c) => s + c.profit, 0);
  const grandClientPriceBeforeVAT = capabilitySections.reduce((s, c) => s + c.clientPrice, 0);
  const vatAmount = includeVAT ? grandClientPriceBeforeVAT * VAT_RATE : 0;
  const grandClientPrice = grandClientPriceBeforeVAT + vatAmount;
  const totalDepositBeforeVAT = capabilitySections.reduce((s, c) => s + c.depositAmount, 0);
  const totalDeposit = includeVAT ? Math.ceil((totalDepositBeforeVAT * (1 + VAT_RATE)) / 100) * 100 : totalDepositBeforeVAT;

  const fmt = (n: number) => {
    const s = n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return s.endsWith('.00') ? s.slice(0, -3) : s;
  };

  const SAR_SVG = `<svg viewBox="0 0 1124.14 1256.39" style="display:inline-block;height:0.7em;width:0.7em;vertical-align:-0.05em" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M699.62,1113.02h0c-20.06,44.48-33.32,92.75-38.4,143.37l424.51-90.24c20.06-44.47,33.31-92.75,38.4-143.37l-424.51,90.24Z"/><path d="M1085.73,895.8c20.06-44.47,33.32-92.75,38.4-143.37l-330.68,70.33v-135.2l292.27-62.11c20.06-44.47,33.32-92.75,38.4-143.37l-330.68,70.27V66.13c-50.67,28.45-95.67,66.32-132.25,110.99v403.35l-132.25,28.11V0c-50.67,28.44-95.67,66.32-132.25,110.99v525.69l-295.91,62.88c-20.06,44.47-33.33,92.75-38.42,143.37l334.33-71.05v170.26l-358.3,76.14c-20.06,44.47-33.32,92.75-38.4,143.37l375.04-79.7c30.53-6.35,56.77-24.4,73.83-49.24l68.78-101.97v-.02c7.14-10.55,11.3-23.27,11.3-36.97v-149.98l132.25-28.11v270.4l424.53-90.28Z"/></svg>`;

  const currencyText = quoteCurrency === 'CNY' ? '¥'
    : quoteCurrency === 'EUR' ? '€'
    : quoteCurrency === 'USD' ? '$' : '';
  const isSAR = quoteCurrency === 'SAR';

  const CurrBadge = () => isSAR
    ? <span dangerouslySetInnerHTML={{ __html: SAR_SVG }} />
    : <span>{currencyText}</span>;
  const today = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
  const todayEn = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const customerName = costSummary.customerName ?? '_______________';

  const logoUrl = typeof window !== 'undefined' ? `${window.location.origin}/logo.png` : '/logo.png';

  const buildPrintWindow = () => {
    const el = printRef.current;
    if (!el) return null;
    const win = window.open('', '_blank');
    if (!win) return null;
    win.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>\u200B</title>
<style>
  @page { size: A4; margin: 15mm 15mm 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Segoe UI', Tahoma, Arial, sans-serif; font-size: 12px; color: #222; direction: rtl; }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head><body>`);
    win.document.write(el.innerHTML);
    win.document.write('</body></html>');
    win.document.close();
    return win;
  };

  const handlePrint = () => {
    const win = buildPrintWindow();
    if (!win) return;
    setTimeout(() => { win.print(); }, 500);
  };

  const [sendingWhatsApp, setSendingWhatsApp] = useState(false);

  const handleSendWhatsApp = async () => {
    const phone = costSummary.customerPhone;
    if (!phone) {
      addToast('No customer phone number found. Please add a contact with a phone number to the customer.', 'error');
      return;
    }

    const el = printRef.current;
    if (!el) return;

    setSendingWhatsApp(true);
    try {
      const html2pdf = (await import('html2pdf.js')).default;

      const projectName = costSummary.projectName ?? 'Quotation';
      const custName = costSummary.customerName ?? 'Customer';
      const fileName = `${projectName} - ${custName}.pdf`;

      const worker = html2pdf()
        .set({
          margin: [15, 15, 12, 15],
          filename: fileName,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, letterRendering: true },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        })
        .from(el)
        .toPdf();

      const pdf = await worker.get('pdf');
      const pdfBlob = pdf.output('blob') as Blob;

      const formData = new FormData();
      formData.append('pdf', pdfBlob, fileName);
      formData.append('phone', phone);
      formData.append('fileName', fileName);

      await api.upload(`/api/v1/projects/${projectId}/client-approval/send-whatsapp`, formData);
      addToast('PDF sent to WhatsApp', 'success');
    } catch (err) {
      addToast('Failed to send to WhatsApp', 'error');
    } finally {
      setSendingWhatsApp(false);
    }
  };

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => {
      const stageId = costSummary.stageId;
      if (!stageId) throw new Error('Stage not found');
      return api.post(`/api/v1/projects/${projectId}/stages/${stageId}/quote-comparison/reorder`, { orderedIds });
    },
    onSuccess: () => onRefetch(),
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const translateMutation = useMutation({
    mutationFn: () => {
      if (!stageId) throw new Error('Stage not found');
      return api.post(`/api/v1/projects/${projectId}/stages/${stageId}/quote-comparison/translate`, {});
    },
    onSuccess: () => { onRefetch(); addToast('تمت الترجمة بنجاح', 'success'); },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const updateNameArMutation = useMutation({
    mutationFn: (args: { type: 'capability' | 'item'; id: string; nameAr: string }) => {
      if (!stageId) throw new Error('Stage not found');
      const endpoint = args.type === 'capability'
        ? `/api/v1/projects/${projectId}/stages/${stageId}/quote-comparison/${args.id}/name-ar`
        : `/api/v1/projects/${projectId}/stages/${stageId}/quote-comparison/items/${args.id}/name-ar`;
      return api.patch(endpoint, { nameAr: args.nameAr });
    },
    onSuccess: () => onRefetch(),
  });

  const updateDescriptionMutation = useMutation({
    mutationFn: (args: { itemId: string; description: string }) => {
      if (!stageId) throw new Error('Stage not found');
      return api.patch(`/api/v1/projects/${projectId}/stages/${stageId}/quote-comparison/items/${args.itemId}/description`, { description: args.description });
    },
    onSuccess: () => onRefetch(),
  });

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const allIds = [...costSummary.allComparisonIds];
    const currentId = costSummary.items[index]?.comparisonId;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= costSummary.items.length) return;
    const targetId = costSummary.items[targetIdx]?.comparisonId;
    if (!currentId || !targetId) return;
    const posA = allIds.indexOf(currentId);
    const posB = allIds.indexOf(targetId);
    if (posA === -1 || posB === -1) return;
    [allIds[posA], allIds[posB]] = [allIds[posB], allIds[posA]];
    reorderMutation.mutate(allIds);
  };

  return (
    <div className="space-y-6">
      {/* Image Picker Modal */}
      {imgModal.open && (
        <ImagePickerModal
          onSelect={(url) => { imgModal.callback?.(url); setImgModal({ open: false, callback: null }); }}
          onClose={() => setImgModal({ open: false, callback: null })}
        />
      )}

      {/* ─── PART 1: Profit Calculator ─── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-2 text-gray-700">
          <Percent className="h-5 w-5 text-[#DC2626]" />
          <h2 className="text-lg font-bold">Profit Margin</h2>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          Set profit percentage per section, or use the default to apply to all
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="w-36">
            <label className="mb-1 block text-xs font-medium text-gray-600">Default Profit %</label>
            <div className="flex items-center gap-1">
              <input
                value={defaultProfit}
                onChange={(e) => setDefaultProfit(parseFloat(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-center text-lg font-bold text-gray-900 focus:border-[#DC2626] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              />
              <span className="text-lg font-bold text-gray-400">%</span>
            </div>
          </div>
          <Button variant="secondary" size="md" onClick={applyDefaultToAll}>
            Apply to All
          </Button>
          <Button variant="secondary" size="md"
            onClick={() => translateMutation.mutate()}
            disabled={translateMutation.isPending}>
            {translateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
            {translateMutation.isPending ? 'جاري الترجمة...' : 'ترجمة للعربي'}
          </Button>
          <div className="w-32">
            <label className="mb-1 block text-xs font-medium text-gray-600">Currency</label>
            <Select options={CURRENCY_OPTIONS} value={quoteCurrency}
              onChange={(e) => {
                setQuoteCurrency(e.target.value);
                saveSettingsMutation.mutate({ quoteCurrency: e.target.value });
              }} />
          </div>
          <button type="button" onClick={() => {
              const newVal = !includeVAT;
              setIncludeVAT(newVal);
              saveSettingsMutation.mutate({ includeVat: newVal });
            }}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors',
              includeVAT
                ? 'border-green-400 bg-green-50 text-green-700'
                : 'border-gray-300 bg-gray-50 text-gray-500 hover:border-gray-400'
            )}>
            <div className={cn(
              'h-4 w-4 rounded border-2 flex items-center justify-center transition-colors',
              includeVAT ? 'border-green-500 bg-green-500' : 'border-gray-400 bg-white'
            )}>
              {includeVAT && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
            </div>
            ضريبة القيمة المضافة 15%
          </button>
        </div>

        {/* Capability sections breakdown */}
        {capabilitySections.map((sec, si) => (
          <div key={sec.comparisonId} className="mt-5 rounded-lg border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button type="button" disabled={si === 0}
                    onClick={() => moveSection(si, 'up')}
                    className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" disabled={si === capabilitySections.length - 1}
                    onClick={() => moveSection(si, 'down')}
                    className="rounded p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed">
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div>
                  <div>
                    <span className="text-sm font-bold text-gray-900">{sec.capability}</span>
                    <span className="ml-2 text-xs text-gray-400">({sec.supplierName})</span>
                  </div>
                  <input
                    dir="rtl"
                    placeholder="الاسم بالعربي..."
                    defaultValue={sec.capabilityAr ?? ''}
                    onBlur={(e) => {
                      const val = e.target.value.trim();
                      if (val !== (sec.capabilityAr ?? '')) {
                        updateNameArMutation.mutate({ type: 'capability', id: sec.comparisonId, nameAr: val });
                      }
                    }}
                    className="mt-0.5 w-64 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-gray-600 placeholder:text-gray-300 hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400/30"
                  />
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 rounded-md bg-white border border-gray-200 px-2 py-1">
                  <span className="text-xs text-gray-400 whitespace-nowrap">Profit</span>
                  <input
                    value={sec.profitPercent}
                    onChange={(e) => setSectionProfits((prev) => ({ ...prev, [sec.comparisonId]: parseFloat(e.target.value) || 0 }))}
                    onBlur={() => saveProfitMutation.mutate({ compId: sec.comparisonId, profitPercent: sec.profitPercent })}
                    className="w-12 bg-transparent text-center text-sm font-bold text-gray-700 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="text-xs font-bold text-gray-400">%</span>
                </div>
                {sec.effectiveProfitPercent !== sec.profitPercent && (
                  <span className="text-xs tabular-nums text-green-600 font-medium">≈ {sec.effectiveProfitPercent.toFixed(1)}%</span>
                )}
                <span className="text-sm font-bold tabular-nums text-gray-900">{fmt(sec.clientPrice)} <CurrBadge /></span>
              </div>
            </div>
            {/* Section image — large */}
            <div className="border-b border-gray-100 px-4 py-3">
              {sec.imageUrl ? (
                <div className="relative rounded-lg border border-gray-200 overflow-hidden">
                  <img src={`${staticBase}${sec.imageUrl}`} alt={sec.capability} className="w-full max-h-96 object-contain bg-gray-50" />
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button type="button" onClick={() => openSectionImagePicker(sec.comparisonId)}
                      className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-gray-600 shadow hover:bg-white">
                      Change
                    </button>
                    <button type="button" onClick={async () => {
                      await api.delete(`${apiBase}/${sec.comparisonId}/image`);
                      onRefetch();
                    }}
                      className="rounded-md bg-white/90 px-2 py-1 text-xs font-medium text-red-600 shadow hover:bg-white">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => openSectionImagePicker(sec.comparisonId)}
                  className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 px-4 py-5 text-sm text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors">
                  <ImageIcon className="h-5 w-5" />
                  <span>Add section image</span>
                </button>
              )}
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">#</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Item</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Qty</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Cost</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Profit</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Client Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sec.detailLines.map((dl, di) => (
                  <tr key={di} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 align-middle">{di + 1}</td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-3">
                        {dl.imageUrl ? (
                          <div className="relative flex-shrink-0 group">
                            <img src={`${staticBase}${dl.imageUrl}`} alt={dl.itemName}
                              className="h-24 w-24 rounded-lg border border-gray-200 object-contain bg-white cursor-pointer hover:opacity-80 transition-opacity"
                              onClick={() => openItemImagePicker(dl.itemId)} />
                            <button type="button"
                              onClick={async () => { await api.delete(`${apiBase}/items/${dl.itemId}/image`); onRefetch(); }}
                              className="absolute -top-1.5 -right-1.5 rounded-full bg-red-500 p-0.5 text-white shadow hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ) : (
                          <button type="button" title="Add image"
                            onClick={() => openItemImagePicker(dl.itemId)}
                            className="flex-shrink-0 flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-300 hover:border-gray-400 hover:text-gray-400 transition-colors">
                            <ImageIcon className="h-5 w-5" />
                          </button>
                        )}
                        <div className="min-w-0">
                          <span className="text-gray-900 font-medium">{dl.itemName}</span>
                          <input
                            dir="rtl"
                            placeholder="الاسم بالعربي..."
                            defaultValue={dl.itemNameAr ?? ''}
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (val !== (dl.itemNameAr ?? '')) {
                                updateNameArMutation.mutate({ type: 'item', id: dl.itemId, nameAr: val });
                              }
                            }}
                            className="mt-0.5 block w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-gray-600 placeholder:text-gray-300 hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400/30"
                          />
                          <textarea
                            dir="rtl"
                            placeholder="وصف فرعي..."
                            defaultValue={dl.description ?? ''}
                            rows={1}
                            onBlur={(e) => {
                              const val = e.target.value.trim();
                              if (val !== (dl.description ?? '')) {
                                updateDescriptionMutation.mutate({ itemId: dl.itemId, description: val });
                              }
                            }}
                            className="mt-0.5 block w-full resize-none rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-gray-500 placeholder:text-gray-300 hover:border-gray-300 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-400/30"
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 align-middle">{dl.qty}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-gray-600 align-middle">{fmt(dl.cost)}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-green-600 align-middle">+{fmt(dl.profit)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900 align-middle">{fmt(dl.clientAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                  <td colSpan={3} className="px-4 py-2 text-gray-700">Subtotal</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-600">{fmt(sec.cost)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-green-600">+{fmt(sec.profit)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-gray-900">{fmt(sec.clientPrice)}</td>
                </tr>
              </tfoot>
            </table>
            {sec.terms.length > 0 && (
              <div className="border-t border-gray-100 bg-gray-50/50 px-4 py-2 text-xs text-gray-500">
                {sec.terms.join(' · ')}
              </div>
            )}

            {/* Conditions / شروط */}
            <ConditionsEditor
              conditions={sec.conditions}
              onSave={(updated) => saveConditionsMutation.mutate({ compId: sec.comparisonId, conditions: updated })}
            />
          </div>
        ))}

        {/* Grand Total */}
        {capabilitySections.length > 0 && (
          <div className="mt-4 space-y-2">
            <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 px-4 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-indigo-400" />
                <span className="text-sm font-medium text-indigo-700">الأرباح</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-indigo-400">التكلفة {fmt(grandCost)}</span>
                <span className="text-xs text-indigo-300">|</span>
                <span className="text-xs font-semibold text-indigo-500">{grandCost > 0 ? ((grandProfit / grandCost) * 100).toFixed(1) : 0}%</span>
                <span className="text-base font-bold text-indigo-600">+{fmt(grandProfit)} <CurrBadge /></span>
              </div>
            </div>
            <div className="rounded-lg border-2 border-gray-300 bg-gray-50 px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-900">{includeVAT ? 'الإجمالي شامل الضريبة' : 'Grand Total'}</span>
              <div className="text-lg font-bold text-gray-900">{fmt(grandClientPrice)} <CurrBadge /></div>
            </div>
            {totalDeposit > 0 && (
              <div className="rounded-lg border-2 border-green-300 bg-green-50 px-4 py-3 flex items-center justify-between">
                <span className="text-sm font-bold text-green-800">المبلغ المطلوب لبداية المشروع / Required Deposit</span>
                <div className="text-lg font-bold text-green-700">{fmt(totalDeposit)} <CurrBadge /></div>
              </div>
            )}
          </div>
        )}

        {capabilitySections.length === 0 && (
          <div className="mt-4 py-8 text-center text-sm text-gray-400">
            No items yet. Select suppliers in <strong>Quotation &amp; Samples</strong> first.
          </div>
        )}
      </div>

      {/* ─── PART 2: A4 Quotation Preview + Print ─── */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-gray-700">
            <FileText className="h-5 w-5 text-[#1E4BA5]" />
            <h2 className="text-lg font-bold">Client Quotation Preview</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={sendingWhatsApp}
              className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#1da851] active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {sendingWhatsApp ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              )}
              {sendingWhatsApp ? 'Generating PDF...' : 'Send to Customer'}
            </button>
            <Button variant="primary" size="md" onClick={handlePrint}>
              <Printer className="h-4 w-4" /> Print / PDF
            </Button>
          </div>
        </div>

        {/* A4 Preview */}
        <div className="mt-4 mx-auto overflow-hidden rounded-lg border-2 border-gray-300 bg-white shadow-xl" style={{ maxWidth: '210mm' }}>
          <div ref={printRef} style={{ fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif", direction: 'rtl' }}>

            {/* Top colored bar */}
            <div style={{ height: '6px', background: 'linear-gradient(to left, #C41E1E 33%, #22A03E 33%, #22A03E 66%, #1E4BA5 66%)' }} />

            <div style={{ padding: '28px 32px 24px' }}>
              {/* ── Header ── */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', paddingBottom: '16px', marginBottom: '12px', borderBottom: '2px solid #e5e7eb' }}>
                {/* Arabic side */}
                <div style={{ textAlign: 'right', fontSize: '11px', lineHeight: '1.8', color: '#333' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#C41E1E', marginBottom: '2px' }}>مؤسسة حسن جاسم القرقوش التجارية</div>
                  <div style={{ color: '#555' }}>س ت: 2050044548</div>
                  <div style={{ color: '#555' }}>الدمام .هجر بلازا .بجوار حياة بلازا</div>
                  <div style={{ color: '#555' }}>ص ب 8035 &nbsp; رمز بريدي 31482</div>
                </div>

                {/* Logo */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px' }}>
                  <img src={logoUrl} alt="HQQ" style={{ height: '72px', objectFit: 'contain' }} />
                </div>

                {/* English side */}
                <div style={{ textAlign: 'left', fontSize: '11px', lineHeight: '1.8', direction: 'ltr', color: '#333' }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: '#1E4BA5', marginBottom: '2px' }}>Hassan AlQarqoosh Trading Est.</div>
                  <div style={{ color: '#555' }}>C.R. 2050044548</div>
                  <div style={{ color: '#555' }}>Dammam. Hajer plaza. Near Hyat plaza</div>
                  <div style={{ color: '#555' }}>Bo.Box 8035 . Zip 31482</div>
                </div>
              </div>

              {/* ── Title ── */}
              <div style={{ textAlign: 'center', margin: '20px 0 6px' }}>
                <div style={{ fontSize: '24px', fontWeight: 700, color: '#1E4BA5', letterSpacing: '1px' }}>عرض سعر</div>
              </div>

              {/* ── Date ── */}
              <div style={{ textAlign: 'center', fontSize: '12px', color: '#666', marginBottom: '18px' }}>
                التاريخ: {today}
              </div>

              {/* ── Customer Greeting ── */}
              <div style={{ margin: '0 0 4px', fontSize: '13px', color: '#333' }}>
                السادة <span style={{ fontWeight: 700, color: '#1E4BA5', margin: '0 4px' }}>{customerName}</span> المحترمين
              </div>
              <div style={{ marginBottom: '10px', fontSize: '13px', color: '#333' }}>
                السلام عليكم ورحمة الله وبركاته,
              </div>
              <div style={{ marginBottom: '16px', fontSize: '12px', color: '#666' }}>
                يسرنا أن نقدم لكم عرض السعر التالي:
              </div>

              {/* ── Detailed Tables per Capability ── */}
              {capabilitySections.map((sec, si) => (
                <div key={si} style={{ marginBottom: '18px', marginTop: si > 0 ? '24px' : '0', breakBefore: si > 0 ? 'page' : 'auto', pageBreakBefore: si > 0 ? 'always' : 'auto' }}>
                  <div style={{ background: '#1E4BA5', color: '#fff', padding: '12px 14px', fontSize: '16px', fontWeight: 700, borderRadius: '4px 4px 0 0' }}>
                    {si + 1}. {sec.capabilityAr || sec.capability}
                  </div>
                  {/* Section image — large */}
                  {sec.imageUrl && (
                    <div style={{ padding: '10px', textAlign: 'center', background: '#fafbfc', borderBottom: '1px solid #e5e7eb' }}>
                      <img src={`${staticBase}${sec.imageUrl}`} alt={sec.capability} style={{ maxWidth: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '4px' }} />
                    </div>
                  )}
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ background: '#eef2ff', color: '#1E4BA5', padding: '8px 10px', fontSize: '13px', fontWeight: 600, textAlign: 'center', width: '35px', borderBottom: '1px solid #c7d2fe' }}>م</th>
                        <th style={{ background: '#eef2ff', color: '#1E4BA5', padding: '8px 10px', fontSize: '13px', fontWeight: 600, textAlign: 'right', borderBottom: '1px solid #c7d2fe' }}>البند</th>
                        <th style={{ background: '#eef2ff', color: '#1E4BA5', padding: '8px 10px', fontSize: '13px', fontWeight: 600, textAlign: 'center', width: '55px', borderBottom: '1px solid #c7d2fe' }}>الكمية</th>
                        <th style={{ background: '#eef2ff', color: '#1E4BA5', padding: '8px 10px', fontSize: '13px', fontWeight: 600, textAlign: 'left', width: '100px', borderBottom: '1px solid #c7d2fe' }}>سعر الوحدة</th>
                        <th style={{ background: '#eef2ff', color: '#1E4BA5', padding: '8px 10px', fontSize: '13px', fontWeight: 600, textAlign: 'left', width: '120px', borderBottom: '1px solid #c7d2fe' }}>المبلغ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.detailLines.map((dl, di) => {
                        const bg = di % 2 === 1 ? '#f8fafc' : '#fff';
                        return (
                          <tr key={di}>
                            <td style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', fontSize: '13px', textAlign: 'center', color: '#888', background: bg, verticalAlign: 'middle' }}>{di + 1}</td>
                            <td style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', fontSize: '14px', fontWeight: 600, color: '#222', background: bg, verticalAlign: 'middle' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                {dl.imageUrl && (
                                  <img src={`${staticBase}${dl.imageUrl}`} alt={dl.itemName} style={{ height: '100px', width: '100px', objectFit: 'contain', borderRadius: '4px', border: '1px solid #e5e7eb', flexShrink: 0, background: '#fff' }} />
                                )}
                                <div>
                                  <div>{dl.itemNameAr || dl.itemName}</div>
                                  {dl.description && <div style={{ fontSize: '11px', fontWeight: 400, color: '#666', marginTop: '3px', lineHeight: '1.4' }}>{dl.description}</div>}
                                </div>
                              </div>
                            </td>
                            <td style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', fontSize: '14px', textAlign: 'center', color: '#333', background: bg, verticalAlign: 'middle', fontWeight: 500 }}>{dl.qty}</td>
                            <td style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', fontSize: '14px', textAlign: 'left', direction: 'ltr', fontFamily: "'Courier New', monospace", color: '#333', background: bg, verticalAlign: 'middle', fontWeight: 500 }}>{fmt(dl.clientUnitPrice)}</td>
                            <td style={{ padding: '10px', borderBottom: '1px solid #e5e7eb', fontSize: '15px', textAlign: 'left', direction: 'ltr', fontFamily: "'Courier New', monospace", fontWeight: 700, color: '#111', background: bg, verticalAlign: 'middle' }}>{fmt(dl.clientAmount)}</td>
                          </tr>
                        );
                      })}
                      <tr>
                        <td colSpan={4} style={{ padding: '10px', borderTop: '1px solid #c7d2fe', fontSize: '14px', fontWeight: 700, background: '#eef2ff', textAlign: 'right', color: '#1E4BA5' }}>
                          المجموع
                        </td>
                        <td style={{ padding: '10px', borderTop: '1px solid #c7d2fe', fontSize: '15px', fontWeight: 700, background: '#eef2ff', textAlign: 'left', direction: 'ltr', fontFamily: "'Courier New', monospace", color: '#1E4BA5', whiteSpace: 'nowrap' }}>
                          {fmt(sec.clientPrice)} {isSAR ? <span dangerouslySetInnerHTML={{ __html: SAR_SVG }} /> : currencyText}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {sec.conditions.length > 0 && (
                    <div style={{ background: '#fefce8', borderTop: '1px solid #e5e7eb', padding: '10px 14px', direction: 'rtl' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#92400e', marginBottom: '6px' }}>الشروط والأحكام:</div>
                      <ul style={{ margin: 0, paddingRight: '18px', paddingLeft: 0 }}>
                        {sec.conditions.map((c, ci) => (
                          <li key={ci} style={{ fontSize: '11px', color: '#78350f', lineHeight: '1.8', listStyleType: 'disc', whiteSpace: 'pre-wrap' }}>{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}

              {/* ── Grand Total ── */}
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '4px', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                <tbody>
                  {includeVAT && (
                    <>
                      <tr>
                        <td style={{ padding: '10px 12px', background: '#f0f4ff', fontSize: '14px', fontWeight: 600, color: '#1E4BA5', textAlign: 'right', borderBottom: '1px solid #c7d2fe' }}>
                          المجموع قبل الضريبة
                        </td>
                        <td style={{ padding: '10px 12px', background: '#f0f4ff', fontSize: '14px', fontWeight: 600, color: '#1E4BA5', textAlign: 'left', direction: 'ltr', fontFamily: "'Courier New', monospace", width: '180px', borderBottom: '1px solid #c7d2fe', whiteSpace: 'nowrap' }}>
                          {fmt(grandClientPriceBeforeVAT)} {isSAR ? <span dangerouslySetInnerHTML={{ __html: SAR_SVG }} /> : currencyText}
                        </td>
                      </tr>
                      <tr>
                        <td style={{ padding: '10px 12px', background: '#fef9ee', fontSize: '14px', fontWeight: 600, color: '#92400e', textAlign: 'right', borderBottom: '1px solid #fde68a' }}>
                          ضريبة القيمة المضافة (15%)
                        </td>
                        <td style={{ padding: '10px 12px', background: '#fef9ee', fontSize: '14px', fontWeight: 600, color: '#92400e', textAlign: 'left', direction: 'ltr', fontFamily: "'Courier New', monospace", width: '180px', borderBottom: '1px solid #fde68a', whiteSpace: 'nowrap' }}>
                          {fmt(vatAmount)} {isSAR ? <span dangerouslySetInnerHTML={{ __html: SAR_SVG }} /> : currencyText}
                        </td>
                      </tr>
                    </>
                  )}
                  <tr>
                    <td style={{ padding: '12px', background: '#1E4BA5', fontSize: '15px', fontWeight: 700, color: '#fff', textAlign: 'right' }}>
                      {includeVAT ? 'الإجمالي شامل الضريبة' : 'الإجمالي الكلي'}
                    </td>
                    <td style={{ padding: '12px', background: '#1E4BA5', fontSize: '16px', fontWeight: 700, color: '#fff', textAlign: 'left', direction: 'ltr', fontFamily: "'Courier New', monospace", width: '180px', whiteSpace: 'nowrap' }}>
                      {fmt(grandClientPrice)} {isSAR ? <span dangerouslySetInnerHTML={{ __html: SAR_SVG }} /> : currencyText}
                    </td>
                  </tr>
                  {totalDeposit > 0 && (
                    <tr>
                      <td style={{ padding: '12px', background: '#22A03E', fontSize: '15px', fontWeight: 700, color: '#fff', textAlign: 'right' }}>
                        المبلغ المطلوب لبداية المشروع
                      </td>
                      <td style={{ padding: '12px', background: '#22A03E', fontSize: '16px', fontWeight: 700, color: '#fff', textAlign: 'left', direction: 'ltr', fontFamily: "'Courier New', monospace", width: '180px', whiteSpace: 'nowrap' }}>
                        {fmt(totalDeposit)} {isSAR ? <span dangerouslySetInnerHTML={{ __html: SAR_SVG }} /> : currencyText}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

              {/* ── Footer ── */}
              <div style={{ marginTop: '28px', textAlign: 'center', paddingTop: '14px', borderTop: '2px solid #e5e7eb' }}>
                <div style={{ fontSize: '13px', color: '#22A03E', fontWeight: 600, marginBottom: '6px' }}>
                  شكراً على تعاملكم معنا وشعارنا دائماً الجودة وإرضاء العميل
                </div>
              </div>

              {/* Bottom colored bar */}
              <div style={{ height: '4px', background: 'linear-gradient(to left, #C41E1E 33%, #22A03E 33%, #22A03E 66%, #1E4BA5 66%)', marginTop: '16px', borderRadius: '2px' }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// FILES PANEL
// ═══════════════════════════════════════

function FilesPanel({
  projectId,
  files,
  onRefetch,
}: {
  projectId: string;
  files: ApprovalFile[];
  onRefetch: () => void;
}) {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const serverUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const uploadFiles = async (fileList: globalThis.File[]) => {
    if (fileList.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (const f of fileList) formData.append('files', f);
      await api.upload(`/api/v1/projects/${projectId}/client-approval/files/upload`, formData);
      onRefetch();
      addToast(`${fileList.length} file${fileList.length > 1 ? 's' : ''} uploaded`, 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) =>
      api.delete(`/api/v1/projects/${projectId}/client-approval/files/${fileId}`),
    onSuccess: () => { onRefetch(); addToast('File removed', 'success'); },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current++; setIsDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragging(false); } };
  const onDragOver = (e: React.DragEvent) => e.preventDefault();
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); dragCounter.current = 0; setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) uploadFiles(dropped);
  };

  return (
    <div className="space-y-4">
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => {
        const selected = Array.from(e.target.files ?? []);
        if (selected.length > 0) uploadFiles(selected);
        e.target.value = '';
      }} />

      <div
        onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}
        className={cn(
          'rounded-xl border-2 border-dashed p-8 text-center transition-all',
          isDragging ? 'border-[#DC2626] bg-red-50/50' : 'border-gray-300 bg-gray-50/30 hover:border-gray-400',
        )}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-[#DC2626]" />
            <p className="text-sm font-medium text-gray-600">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload className="h-10 w-10 text-gray-400" />
            <div>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="text-sm font-semibold text-[#DC2626] hover:underline">
                Upload files
              </button>
              <span className="text-sm text-gray-500"> or drag and drop</span>
            </div>
            <p className="text-xs text-gray-400">PDF, Excel, Word, Images up to 50MB</p>
          </div>
        )}
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file) => {
            const fi = FILE_ICONS[file.fileType] ?? FILE_ICONS.OTHER;
            const Icon = fi.icon;
            const href = `${serverUrl}${file.filePath}`;
            return (
              <div key={file.id} className="group flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-4 py-3 transition-colors hover:bg-gray-50">
                <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', fi.color)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{file.fileName}</p>
                  <p className="text-xs text-gray-400">
                    {file.uploadedBy.name} &middot; {formatDateRelative(file.createdAt)}
                    {file.fileSize && <> &middot; {(file.fileSize / 1024).toFixed(0)} KB</>}
                  </p>
                </div>
                <a href={href} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 rounded p-1.5 text-gray-300 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button type="button" onClick={() => deleteMutation.mutate(file.id)}
                  className="shrink-0 rounded p-1.5 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {files.length === 0 && !uploading && (
        <p className="py-8 text-center text-sm text-gray-400">No quotation files uploaded yet</p>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// STATUS PANEL
// ═══════════════════════════════════════

function StatusPanel({
  projectId,
  status,
  onRefetch,
  onStageRefetch,
}: {
  projectId: string;
  status: ApprovalStatus | null;
  onRefetch: () => void;
  onStageRefetch: () => void;
}) {
  const { addToast } = useToast();
  const currentStatus = status?.status ?? 'DRAFT';

  const updateMutation = useMutation({
    mutationFn: (newStatus: string) =>
      api.patch(`/api/v1/projects/${projectId}/client-approval/status`, { status: newStatus }),
    onSuccess: () => {
      onRefetch();
      onStageRefetch();
      addToast('Status updated', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const currentIdx = STATUS_PIPELINE.findIndex((s) => s.value === currentStatus);

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-4 text-sm font-medium text-gray-700">Status Pipeline</p>
        <div className="space-y-2">
          {STATUS_PIPELINE.map((step, idx) => {
            const isActive = step.value === currentStatus;
            const isPast = idx < currentIdx;
            const Icon = step.icon;
            const style = STATUS_STYLES[step.value];

            return (
              <button
                key={step.value}
                type="button"
                onClick={() => updateMutation.mutate(step.value)}
                disabled={updateMutation.isPending}
                className={cn(
                  'flex w-full items-center gap-4 rounded-xl border-2 px-5 py-4 text-left transition-all',
                  isActive
                    ? `${style.bg} ${style.ring} ring-2`
                    : isPast
                      ? 'border-gray-100 bg-gray-50/50'
                      : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50',
                )}
              >
                <div className={cn(
                  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                  isActive ? style.bg : isPast ? 'bg-green-50' : 'bg-gray-100',
                )}>
                  {isPast ? (
                    <CheckCircle2 className="h-5 w-5 text-green-500" />
                  ) : (
                    <Icon className={cn('h-5 w-5', isActive ? style.text : 'text-gray-400')} />
                  )}
                </div>
                <div className="flex-1">
                  <p className={cn(
                    'text-sm font-semibold',
                    isActive ? style.text : isPast ? 'text-gray-500' : 'text-gray-700',
                  )}>
                    {step.label}
                  </p>
                </div>
                {isActive && (
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', style.bg, style.text)}>
                    Current
                  </span>
                )}
                {!isActive && (
                  <ChevronRight className="h-4 w-4 text-gray-300" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// NOTES PANEL
// ═══════════════════════════════════════

function NotesPanel({
  projectId,
  notes,
  onRefetch,
}: {
  projectId: string;
  notes: ApprovalNote[];
  onRefetch: () => void;
}) {
  const { addToast } = useToast();
  const [content, setContent] = useState('');

  const createMutation = useMutation({
    mutationFn: (body: { content: string }) =>
      api.post(`/api/v1/projects/${projectId}/client-approval/notes`, body),
    onSuccess: () => { onRefetch(); setContent(''); addToast('Note added', 'success'); },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) =>
      api.delete(`/api/v1/projects/${projectId}/client-approval/notes/${noteId}`),
    onSuccess: () => { onRefetch(); addToast('Note removed', 'success'); },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={3}
          placeholder="Add a note about client communication..."
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#DC2626] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20"
        />
        <div className="mt-3 flex justify-end">
          <Button variant="primary" size="sm" disabled={!content.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate({ content: content.trim() })}>
            <Plus className="h-4 w-4" /> Add Note
          </Button>
        </div>
      </div>

      {notes.length > 0 ? (
        <div className="space-y-3">
          {notes.map((note) => (
            <div key={note.id} className="group rounded-lg border border-gray-100 bg-white p-4 transition-colors hover:bg-gray-50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap text-sm text-gray-800">{note.content}</p>
                  <p className="mt-2 text-xs text-gray-400">
                    {note.createdBy.name} &middot; {formatDateRelative(note.createdAt)}
                  </p>
                </div>
                <button type="button" onClick={() => deleteMutation.mutate(note.id)}
                  className="shrink-0 rounded p-1 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="py-8 text-center text-sm text-gray-400">No notes yet</p>
      )}
    </div>
  );
}
