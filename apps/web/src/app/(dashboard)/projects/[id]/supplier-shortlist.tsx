'use client';

import * as React from 'react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Button,
  Input,
  Select,
  SearchInput,
  Modal,
  useToast,
} from '@/components/ui';
import { useSocketEvent } from '@/hooks/use-socket';
import { formatDateRelative, cn } from '@/lib/utils';
import {
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  File,
  FileText,
  Globe,
  Image,
  Loader2,
  Mail,
  MapPin,
  Plus,
  Search,
  Trash2,
  Upload,
  User,
  UserPlus,
  Users,
  X,
} from 'lucide-react';

// ─── Types ───

interface CandidateSupplier {
  id: string;
  projectId: string;
  stageId: string;
  name: string;
  country: string | null;
  capabilities: string[];
  contactPerson: string | null;
  wechatId: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { files: number };
  files?: CandidateFile[];
}

interface CandidateFile {
  id: string;
  title: string;
  filePath: string;
  fileType: string;
  fileSize: number | null;
  uploadedBy: { id: string; name: string };
  createdAt: string;
}

// ─── Constants ───

const STATUSES = ['NEW', 'CONTACTED', 'WAITING_REPLY', 'REJECTED', 'SELECTED'] as const;

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  NEW: { bg: 'bg-gray-100', text: 'text-gray-700' },
  CONTACTED: { bg: 'bg-blue-100', text: 'text-blue-700' },
  WAITING_REPLY: { bg: 'bg-amber-100', text: 'text-amber-700' },
  REJECTED: { bg: 'bg-red-100', text: 'text-red-700' },
  SELECTED: { bg: 'bg-green-100', text: 'text-green-700' },
};

const FILE_TYPE_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  PDF: { icon: FileText, color: 'bg-red-50 text-red-500' },
  IMAGE: { icon: Image, color: 'bg-purple-50 text-purple-500' },
  SPREADSHEET: { icon: FileText, color: 'bg-green-50 text-green-600' },
  DOCUMENT: { icon: FileText, color: 'bg-blue-50 text-blue-500' },
  OTHER: { icon: File, color: 'bg-gray-100 text-gray-500' },
};

// ─── Countries + Dial Codes (same as Vendors) ───

const COUNTRY_DATA: Record<string, string> = {
  'China': '+86', 'Saudi Arabia': '+966', 'Argentina': '+54', 'Australia': '+61',
  'Austria': '+43', 'Bangladesh': '+880', 'Belgium': '+32', 'Brazil': '+55',
  'Cambodia': '+855', 'Canada': '+1', 'Chile': '+56', 'Colombia': '+57',
  'Czech Republic': '+420', 'Denmark': '+45', 'Egypt': '+20', 'Ethiopia': '+251',
  'Finland': '+358', 'France': '+33', 'Germany': '+49', 'Greece': '+30',
  'Hungary': '+36', 'India': '+91', 'Indonesia': '+62', 'Iran': '+98',
  'Iraq': '+964', 'Ireland': '+353', 'Israel': '+972', 'Italy': '+39',
  'Japan': '+81', 'Jordan': '+962', 'Kazakhstan': '+7', 'Kenya': '+254',
  'Kuwait': '+965', 'Lebanon': '+961', 'Malaysia': '+60', 'Mexico': '+52',
  'Morocco': '+212', 'Myanmar': '+95', 'Netherlands': '+31', 'New Zealand': '+64',
  'Nigeria': '+234', 'Norway': '+47', 'Oman': '+968', 'Pakistan': '+92',
  'Peru': '+51', 'Philippines': '+63', 'Poland': '+48', 'Portugal': '+351',
  'Qatar': '+974', 'Romania': '+40', 'Russia': '+7', 'Singapore': '+65',
  'South Africa': '+27', 'South Korea': '+82', 'Spain': '+34', 'Sri Lanka': '+94',
  'Sweden': '+46', 'Switzerland': '+41', 'Taiwan': '+886', 'Thailand': '+66',
  'Turkey': '+90', 'UAE': '+971', 'Ukraine': '+380', 'United Kingdom': '+44',
  'United States': '+1', 'Uzbekistan': '+998', 'Vietnam': '+84',
};

const COUNTRIES = Object.keys(COUNTRY_DATA);

const COUNTRY_FLAGS: Record<string, string> = {
  'China': '🇨🇳', 'Saudi Arabia': '🇸🇦', 'Argentina': '🇦🇷', 'Australia': '🇦🇺',
  'Austria': '🇦🇹', 'Bangladesh': '🇧🇩', 'Belgium': '🇧🇪', 'Brazil': '🇧🇷',
  'Cambodia': '🇰🇭', 'Canada': '🇨🇦', 'Chile': '🇨🇱', 'Colombia': '🇨🇴',
  'Czech Republic': '🇨🇿', 'Denmark': '🇩🇰', 'Egypt': '🇪🇬', 'Ethiopia': '🇪🇹',
  'Finland': '🇫🇮', 'France': '🇫🇷', 'Germany': '🇩🇪', 'Greece': '🇬🇷',
  'Hungary': '🇭🇺', 'India': '🇮🇳', 'Indonesia': '🇮🇩', 'Iran': '🇮🇷',
  'Iraq': '🇮🇶', 'Ireland': '🇮🇪', 'Israel': '🇮🇱', 'Italy': '🇮🇹',
  'Japan': '🇯🇵', 'Jordan': '🇯🇴', 'Kazakhstan': '🇰🇿', 'Kenya': '🇰🇪',
  'Kuwait': '🇰🇼', 'Lebanon': '🇱🇧', 'Malaysia': '🇲🇾', 'Mexico': '🇲🇽',
  'Morocco': '🇲🇦', 'Myanmar': '🇲🇲', 'Netherlands': '🇳🇱', 'New Zealand': '🇳🇿',
  'Nigeria': '🇳🇬', 'Norway': '🇳🇴', 'Oman': '🇴🇲', 'Pakistan': '🇵🇰',
  'Peru': '🇵🇪', 'Philippines': '🇵🇭', 'Poland': '🇵🇱', 'Portugal': '🇵🇹',
  'Qatar': '🇶🇦', 'Romania': '🇷🇴', 'Russia': '🇷🇺', 'Singapore': '🇸🇬',
  'South Africa': '🇿🇦', 'South Korea': '🇰🇷', 'Spain': '🇪🇸', 'Sri Lanka': '🇱🇰',
  'Sweden': '🇸🇪', 'Switzerland': '🇨🇭', 'Taiwan': '🇹🇼', 'Thailand': '🇹🇭',
  'Turkey': '🇹🇷', 'UAE': '🇦🇪', 'Ukraine': '🇺🇦', 'United Kingdom': '🇬🇧',
  'United States': '🇺🇸', 'Uzbekistan': '🇺🇿', 'Vietnam': '🇻🇳',
};

// ─── Capability Badge Color (same as Vendors) ───

const BADGE_COLORS = [
  'bg-blue-100 text-blue-800', 'bg-purple-100 text-purple-800',
  'bg-amber-100 text-amber-800', 'bg-green-100 text-green-800',
  'bg-pink-100 text-pink-800', 'bg-cyan-100 text-cyan-800',
  'bg-orange-100 text-orange-800', 'bg-indigo-100 text-indigo-800',
];

function capBadgeColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return BADGE_COLORS[Math.abs(hash) % BADGE_COLORS.length];
}

// ─── Icons (same as Vendors) ───

function WeChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05a6.228 6.228 0 01-.235-1.69c0-3.542 3.282-6.421 7.33-6.421.258 0 .51.015.76.04C16.672 4.857 13.073 2.188 8.69 2.188zm-2.87 4.401a1.008 1.008 0 110 2.017 1.008 1.008 0 010-2.017zm5.567 0a1.009 1.009 0 110 2.017 1.009 1.009 0 010-2.017zm5.204 3.678c-3.573 0-6.47 2.543-6.47 5.676 0 3.13 2.897 5.675 6.47 5.675a7.842 7.842 0 002.2-.314.614.614 0 01.51.07l1.354.795a.252.252 0 00.126.04.182.182 0 00.182-.183c0-.052-.02-.105-.034-.154l-.28-1.06a.449.449 0 01.153-.476c1.399-1.076 2.289-2.681 2.289-4.393 0-3.133-2.897-5.676-6.47-5.676h-.03zm-2.88 3.373a.84.84 0 110 1.68.84.84 0 010-1.68zm5.567 0a.84.84 0 110 1.68.84.84 0 010-1.68z" />
    </svg>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ─── Phone Field (same as Vendors) ───

function PhoneField({
  country,
  value,
  onChange,
  label,
}: {
  country: string;
  value: string;
  onChange: (full: string) => void;
  label: string;
}) {
  const dialCode = country ? COUNTRY_DATA[country] ?? '' : '';
  const flag = country ? COUNTRY_FLAGS[country] ?? '' : '';
  const [localNumber, setLocalNumber] = useState('');

  useEffect(() => {
    if (dialCode && value.startsWith(dialCode)) {
      setLocalNumber(value.slice(dialCode.length).replace(/^\s+/, ''));
    } else if (!dialCode) {
      setLocalNumber(value);
    }
  }, [country, dialCode, value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^\d\s\-]/g, '');
    setLocalNumber(val);
    onChange(dialCode ? `${dialCode}${val}` : val);
  };

  return (
    <div className="w-full">
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      <div className="flex">
        {dialCode ? (
          <div className="flex items-center gap-1.5 rounded-l-lg border border-r-0 border-gray-300 bg-gray-50 px-3 text-sm text-gray-600">
            <span className="text-base leading-none">{flag}</span>
            <span className="font-medium">{dialCode}</span>
          </div>
        ) : null}
        <input
          type="tel"
          value={localNumber}
          onChange={handleChange}
          placeholder={dialCode ? 'Enter number' : 'Select country first'}
          disabled={!dialCode}
          className={`flex h-10 w-full border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#DC2626] focus:ring-offset-1 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400 ${
            dialCode ? 'rounded-r-lg' : 'rounded-lg'
          }`}
        />
      </div>
    </div>
  );
}

// ─── Quick Actions Cell (same as Vendors) ───

function QuickActionsCell({ supplier }: { supplier: CandidateSupplier }) {
  const hasWebsite = !!supplier.website;
  const hasWhatsapp = !!supplier.whatsapp;
  const hasEmail = !!supplier.email;

  if (!hasWebsite && !hasWhatsapp && !hasEmail) {
    return <div className="flex min-h-[5rem] items-center text-left"><span className="text-gray-300">&mdash;</span></div>;
  }

  const phoneDigits = supplier.whatsapp?.replace(/[\s\-\+]/g, '') ?? '';
  const gmailUrl = supplier.email ? `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(supplier.email)}` : '';
  const websiteUrl = supplier.website?.startsWith('http') ? supplier.website : `https://${supplier.website}`;

  return (
    <div className="flex min-h-[5rem] flex-col justify-center gap-2 text-left" onClick={(e) => e.stopPropagation()}>
      {hasWebsite && (
        <a href={websiteUrl} target="_blank" rel="noopener noreferrer" title={supplier.website ?? 'Website'}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-gray-500 transition-all hover:bg-blue-50 hover:text-blue-600 active:scale-95">
          <Globe className="h-5 w-5" /><span className="text-sm">Website</span>
        </a>
      )}
      {hasWhatsapp && (
        <a href={`https://wa.me/${phoneDigits}`} target="_blank" rel="noopener noreferrer" title={`WhatsApp: ${supplier.whatsapp}`}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[#25D366] transition-all hover:bg-green-50 hover:text-[#1DA851] active:scale-95">
          <WhatsAppIcon className="h-5 w-5" /><span className="text-sm">WhatsApp</span>
        </a>
      )}
      {hasEmail && (
        <a href={gmailUrl} target="_blank" rel="noopener noreferrer" title={`Email: ${supplier.email}`}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-gray-500 transition-all hover:bg-red-50 hover:text-red-500 active:scale-95">
          <Mail className="h-5 w-5" /><span className="text-sm">Email</span>
        </a>
      )}
    </div>
  );
}

// ─── WeChat Cell (same as Vendors) ───

function WeChatCell({ supplier }: { supplier: CandidateSupplier }) {
  const { addToast } = useToast();

  if (!supplier.wechatId) {
    return <div className="flex min-h-[5rem] items-center text-left"><span className="text-gray-300">&mdash;</span></div>;
  }

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = `hqqwechat://${supplier.wechatId}`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => document.body.removeChild(link), 100);
    addToast('Opening WeChat...', 'success');
  };

  return (
    <div className="flex min-h-[5rem] items-center gap-4 text-left" onClick={(e) => e.stopPropagation()}>
      <button onClick={handleClick}
        className="group flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all hover:bg-green-50 active:scale-95"
        title={`WeChat: ${supplier.wechatId}`}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#07C160]/10 transition-colors group-hover:bg-[#07C160]/20">
          <WeChatIcon className="h-6 w-6 text-[#07C160]" />
        </div>
        <span className="max-w-[90px] truncate text-sm font-medium leading-tight text-gray-700">
          {supplier.contactPerson ?? supplier.name}
        </span>
        <span className="max-w-[90px] truncate text-xs leading-tight text-gray-400">
          {supplier.wechatId}
        </span>
      </button>
    </div>
  );
}

// ─── Capability Dropdown (shared with Vendors) ───

interface CapabilityItem {
  id: string;
  name: string;
}

function CapabilityMultiSelect({
  value,
  onChange,
}: {
  value: string[];
  onChange: (names: string[]) => void;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: capabilities = [] } = useQuery({
    queryKey: ['capabilities'],
    queryFn: () => api.get<CapabilityItem[]>('/api/v1/capabilities'),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      api.post<CapabilityItem>('/api/v1/capabilities', { name }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['capabilities'] });
      onChange([...value, created.name]);
      setAdding(false);
      setNewName('');
      addToast(`"${created.name}" added`, 'success');
    },
    onError: (err: Error) => addToast(err.message || 'Failed to add', 'error'),
  });

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setAdding(false);
        setNewName('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (adding) inputRef.current?.focus();
  }, [adding]);

  const toggleCapability = (name: string) => {
    if (value.includes(name)) {
      onChange(value.filter((v) => v !== name));
    } else {
      onChange([...value, name]);
    }
  };

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createMutation.mutate(trimmed);
  };

  return (
    <div ref={ref} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        Capabilities
      </label>
      <button
        type="button"
        onClick={() => { setOpen(!open); setAdding(false); }}
        className="flex w-full min-h-[38px] items-center justify-between rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
      >
        <div className="flex flex-wrap gap-1 flex-1">
          {value.length > 0 ? value.map((v) => (
            <span key={v} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
              {v}
              <button type="button" onClick={(e) => { e.stopPropagation(); onChange(value.filter((n) => n !== v)); }}
                className="ml-0.5 rounded-full p-0.5 hover:bg-red-100">
                <X className="h-3 w-3" />
              </button>
            </span>
          )) : (
            <span className="text-gray-400">Select capabilities...</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <ul className="max-h-48 overflow-y-auto py-1">
            {capabilities.map((cap) => {
              const isSelected = value.includes(cap.name);
              return (
                <li key={cap.id}>
                  <button type="button"
                    onClick={() => toggleCapability(cap.name)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-red-50',
                      isSelected ? 'font-medium text-[#DC2626] bg-red-50/50' : 'text-gray-700',
                    )}>
                    <div className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      isSelected ? 'border-[#DC2626] bg-[#DC2626]' : 'border-gray-300',
                    )}>
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                    {cap.name}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-gray-100">
            {adding ? (
              <div className="flex items-center gap-1.5 px-2 py-2">
                <input ref={inputRef} value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
                    if (e.key === 'Escape') { setAdding(false); setNewName(''); }
                  }}
                  placeholder="New capability..."
                  className="flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]" />
                <button type="button" onClick={handleAdd}
                  disabled={!newName.trim() || createMutation.isPending}
                  className="rounded-md bg-[#DC2626] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#C41E1E] disabled:opacity-50">
                  {createMutation.isPending ? '...' : 'Add'}
                </button>
                <button type="button" onClick={() => { setAdding(false); setNewName(''); }}
                  className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <button type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm text-[#DC2626] transition-colors hover:bg-red-50">
                <Plus className="h-4 w-4" /> Add new capability
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Form Schema ───

const supplierFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  country: z.string().optional(),
  capabilities: z.array(z.string()).optional().default([]),
  contactPerson: z.string().optional(),
  wechatId: z.string().optional(),
  whatsapp: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  website: z.string().optional(),
  notes: z.string().optional(),
});

type SupplierFormValues = z.infer<typeof supplierFormSchema>;

// ─── Files Manager (inside edit modal) ───

function FilesManager({ supplierId, files, apiBase, onRefetch }: {
  supplierId: string;
  files: CandidateFile[];
  apiBase: string;
  onRefetch: () => void;
}) {
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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
      await api.upload(`${apiBase}/files/upload`, formData);
      onRefetch();
      addToast(`${fileList.length} file${fileList.length > 1 ? 's' : ''} uploaded`, 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">Files ({files.length})</label>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#DC2626] transition-colors hover:bg-red-50">
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Upload Files
        </button>
      </div>
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => {
        const selected = Array.from(e.target.files ?? []);
        if (selected.length > 0) uploadFiles(selected);
        e.target.value = '';
      }} />

      {files.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-xs text-gray-400">
          No files yet — upload quotations, catalogs, etc.
        </p>
      ) : (
        <div className="space-y-2">
          {files.map((file) => {
            const ft = FILE_TYPE_ICONS[file.fileType] ?? FILE_TYPE_ICONS.OTHER;
            const Icon = ft.icon;
            const href = `${apiUrl}${file.filePath}`;
            const isImage = file.fileType === 'IMAGE';
            return (
              <div key={file.id} className="group flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 transition-colors hover:border-gray-200">
                {isImage ? (
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-gray-200">
                    <img src={href} alt={file.title} className="h-full w-full object-cover" />
                  </div>
                ) : (
                  <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', ft.color)}>
                    <Icon className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-gray-900 hover:text-[#DC2626] hover:underline">
                    {file.title}
                  </a>
                  <p className="text-xs text-gray-400">{file.uploadedBy.name} · {formatDateRelative(file.createdAt)}</p>
                </div>
                <button type="button" onClick={() => deleteMutation.mutate(file.id)}
                  className="rounded p-1 text-gray-300 opacity-0 transition-all hover:bg-red-100 hover:text-red-500 group-hover:opacity-100" title="Remove file">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───

export default function SupplierShortlist({
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
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<CandidateSupplier | null>(null);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const apiBase = `/api/v1/projects/${projectId}/stages/${stageId}/candidates`;

  const { data: suppliers = [], isLoading } = useQuery({
    queryKey: ['candidate-suppliers', projectId, stageId],
    queryFn: () => api.get<CandidateSupplier[]>(apiBase),
  });

  const { data: editDetail } = useQuery({
    queryKey: ['candidate-detail', editingSupplier?.id],
    queryFn: () => api.get<CandidateSupplier>(`${apiBase}/${editingSupplier!.id}`),
    enabled: !!editingSupplier,
  });

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['candidate-suppliers', projectId, stageId] });
    if (editingSupplier) queryClient.invalidateQueries({ queryKey: ['candidate-detail', editingSupplier.id] });
    onRefetch();
  }, [queryClient, projectId, stageId, onRefetch, editingSupplier]);

  useSocketEvent('project.stage.updated', refetch, [refetch]);

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: { name: '', country: '', capabilities: [], contactPerson: '', wechatId: '', whatsapp: '', email: '', website: '', notes: '' },
  });

  const createMutation = useMutation({
    mutationFn: (payload: SupplierFormValues) => api.post<CandidateSupplier>(apiBase, payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['candidate-suppliers'] });
      addToast('Supplier added', 'success');
      setEditingSupplier(created);
      form.reset({
        name: created.name, country: created.country ?? '', capabilities: created.capabilities ?? [],
        contactPerson: created.contactPerson ?? '', wechatId: created.wechatId ?? '',
        whatsapp: created.whatsapp ?? '', email: created.email ?? '',
        website: created.website ?? '', notes: created.notes ?? '',
      });
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<SupplierFormValues> }) =>
      api.patch(`${apiBase}/${id}`, payload),
    onSuccess: () => {
      refetch();
      addToast('Supplier updated', 'success');
      closeModal();
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${apiBase}/${id}`),
    onSuccess: () => {
      refetch();
      addToast('Supplier removed', 'success');
      closeModal();
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`${apiBase}/${id}`, { status }),
    onSuccess: () => refetch(),
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const closeModal = () => {
    setModalOpen(false);
    setEditingSupplier(null);
    setConfirmDelete(false);
    form.reset();
  };

  const handleRowClick = (supplier: CandidateSupplier) => {
    setEditingSupplier(supplier);
    form.reset({
      name: supplier.name, country: supplier.country ?? '', capabilities: supplier.capabilities ?? [],
      contactPerson: supplier.contactPerson ?? '', wechatId: supplier.wechatId ?? '',
      whatsapp: supplier.whatsapp ?? '', email: supplier.email ?? '',
      website: supplier.website ?? '', notes: supplier.notes ?? '',
    });
    setModalOpen(true);
  };

  const handleAddClick = () => {
    setEditingSupplier(null);
    form.reset({ name: '', country: '', capabilities: [], contactPerson: '', wechatId: '', whatsapp: '', email: '', website: '', notes: '' });
    setModalOpen(true);
  };

  const onSubmit = (values: SupplierFormValues) => {
    if (editingSupplier) {
      updateMutation.mutate({ id: editingSupplier.id, payload: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleMarkDone = () => {
    const selected = suppliers.filter((s) => s.status === 'SELECTED');
    if (selected.length > 0) {
      setPromoteOpen(true);
    } else {
      onStatusChange('DONE');
    }
  };

  const filtered = suppliers.filter((s) => {
    if (filterStatus !== 'ALL' && s.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      return s.name.toLowerCase().includes(q) || (s.country?.toLowerCase().includes(q)) ||
        (s.capabilities?.some((c) => c.toLowerCase().includes(q))) || (s.contactPerson?.toLowerCase().includes(q));
    }
    return true;
  });

  const statusCounts = STATUSES.reduce((acc, s) => {
    acc[s] = suppliers.filter((sup) => sup.status === s).length;
    return acc;
  }, {} as Record<string, number>);

  const isPending = createMutation.isPending || updateMutation.isPending;
  const supplierFiles = editDetail?.files ?? editingSupplier?.files ?? [];

  return (
    <div className="space-y-6">
      {/* Header — same layout as Vendors page */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{stageName}</h1>
          <p className="text-sm text-gray-500">{suppliers.length} candidate supplier{suppliers.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {stageStatus !== 'DONE' && (
            <Button variant="secondary" size="md" onClick={handleMarkDone}>
              <CheckCircle2 className="h-4 w-4" /> Mark Stage Done
            </Button>
          )}
          <Button variant="secondary" size="md" onClick={() => setImportOpen(true)}>
            <Building2 className="h-4 w-4" /> Import from Vendors
          </Button>
          <Button variant="primary" size="md" onClick={handleAddClick}>
            <Plus className="h-4 w-4" /> Add Supplier
          </Button>
        </div>
      </div>

      {/* Search + Status Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1" style={{ minWidth: 200 }}>
          <SearchInput value={search} onChange={(v) => setSearch(v)} placeholder="Search suppliers..." />
        </div>
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => setFilterStatus('ALL')}
            className={cn('rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
              filterStatus === 'ALL' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
            All ({suppliers.length})
          </button>
          {STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => setFilterStatus(s)}
              className={cn('rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                filterStatus === s
                  ? `${STATUS_COLORS[s].bg} ${STATUS_COLORS[s].text} ring-1 ring-offset-1 ring-gray-300`
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200')}>
              {s.replace(/_/g, ' ')} ({statusCounts[s] || 0})
            </button>
          ))}
        </div>
      </div>

      {/* Table — same structure as Vendors DataTable */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-[#DC2626]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-gray-200 bg-white py-16">
          <Users className="h-12 w-12 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">
            {suppliers.length === 0 ? 'No suppliers yet' : 'No matching suppliers'}
          </p>
          {suppliers.length === 0 && (
            <Button variant="primary" size="sm" onClick={handleAddClick}>
              <Plus className="h-4 w-4" /> Add First Supplier
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Country</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Capability</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Quick Actions</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">WeChat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((supplier) => {
                const sc = STATUS_COLORS[supplier.status] ?? STATUS_COLORS.NEW;
                return (
                  <tr key={supplier.id} onClick={() => handleRowClick(supplier)}
                    className="cursor-pointer transition-colors hover:bg-gray-50/80">
                    <td className="px-4 py-3">
                      <div className="flex min-h-[5rem] items-center gap-3 text-left">
                        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-gray-50">
                          <Building2 className="h-7 w-7 text-gray-300" />
                        </div>
                        <div>
                          <span className="font-medium text-gray-900">{supplier.name}</span>
                          {supplier.contactPerson && (
                            <p className="text-xs text-gray-500">{supplier.contactPerson}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-h-[5rem] items-center text-left">
                        <span className="text-sm text-gray-700">
                          {supplier.country ? `${COUNTRY_FLAGS[supplier.country] ?? ''} ${supplier.country}` : <span className="text-gray-300">&mdash;</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-h-[5rem] flex-wrap items-center gap-1 text-left">
                        {supplier.capabilities && supplier.capabilities.length > 0 ? (
                          supplier.capabilities.map((cap) => (
                            <span key={cap} className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${capBadgeColor(cap)}`}>
                              {cap}
                            </span>
                          ))
                        ) : <span className="text-gray-300">&mdash;</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex min-h-[5rem] items-center text-left" onClick={(e) => e.stopPropagation()}>
                        <select
                          value={supplier.status}
                          onChange={(e) => statusMutation.mutate({ id: supplier.id, status: e.target.value })}
                          className={cn('rounded-full border-0 px-2.5 py-1 text-xs font-semibold cursor-pointer focus:ring-2 focus:ring-[#DC2626]', sc.bg, sc.text)}
                        >
                          {STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                        </select>
                      </div>
                    </td>
                    <td className="px-4 py-3"><QuickActionsCell supplier={supplier} /></td>
                    <td className="px-4 py-3"><WeChatCell supplier={supplier} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal — same structure as Vendors */}
      <Modal isOpen={modalOpen} onClose={closeModal} title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <Input label="Name" error={form.formState.errors.name?.message} {...form.register('name')} />
          <Select
            label="Country"
            options={COUNTRIES.map(c => ({ value: c, label: c }))}
            {...form.register('country')}
          />
          <CapabilityMultiSelect
            value={form.watch('capabilities') ?? []}
            onChange={(names) => form.setValue('capabilities', names, { shouldDirty: true })}
          />
          <Input label="Contact Person" {...form.register('contactPerson')} />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <PhoneField
                country={form.watch('country') ?? ''}
                value={form.watch('whatsapp') ?? ''}
                onChange={(val) => form.setValue('whatsapp', val)}
                label="WhatsApp Number"
              />
            </div>
            {form.watch('whatsapp') && (
              <a
                href={`https://wa.me/${form.watch('whatsapp')?.replace(/[\s\-\+]/g, '')}`}
                target="_blank" rel="noopener noreferrer"
                className="mb-[1px] flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#25D366] text-white transition-colors hover:bg-[#1DA851]"
                title="Open WhatsApp"
              >
                <WhatsAppIcon className="h-5 w-5" />
              </a>
            )}
          </div>
          <Input label="WeChat ID" {...form.register('wechatId')} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-gray-400" /> Email</span>
            </label>
            <input {...form.register('email')} type="email" placeholder="vendor@example.com"
              className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#DC2626] focus:ring-offset-1" />
            {form.formState.errors.email && <p className="mt-1 text-xs text-red-500">{form.formState.errors.email.message}</p>}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-gray-400" /> Website</span>
            </label>
            <input {...form.register('website')} type="url" placeholder="https://www.example.com"
              className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#DC2626] focus:ring-offset-1" />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Notes</label>
            <textarea {...form.register('notes')} rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              placeholder="First impressions, how you found them..." />
          </div>

          {/* Files section — only when editing */}
          {editingSupplier && (
            <div className="border-t border-gray-100 pt-4">
              <FilesManager
                supplierId={editingSupplier.id}
                files={supplierFiles}
                apiBase={`${apiBase}/${editingSupplier.id}`}
                onRefetch={refetch}
              />
            </div>
          )}

          {/* Status — only when editing */}
          {editingSupplier && (
            <div className="border-t border-gray-100 pt-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Status</label>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map((s) => {
                  const active = editingSupplier.status === s;
                  return (
                    <button key={s} type="button"
                      onClick={() => statusMutation.mutate({ id: editingSupplier.id, status: s })}
                      className={cn('rounded-full px-3 py-1 text-xs font-medium transition-all',
                        active ? `${STATUS_COLORS[s].bg} ${STATUS_COLORS[s].text} ring-2 ring-offset-1 ring-gray-300` : 'bg-gray-50 text-gray-400 hover:bg-gray-100')}>
                      {s.replace(/_/g, ' ')}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            {editingSupplier ? (
              <div>
                {confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-red-600">Delete this supplier?</span>
                    <button type="button" onClick={() => deleteMutation.mutate(editingSupplier.id)} disabled={deleteMutation.isPending}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50">
                      {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(false)}
                      className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200">
                      No
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmDelete(true)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" /> Delete Supplier
                  </button>
                )}
              </div>
            ) : <div />}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
              <Button type="submit" variant="primary" loading={isPending}>
                {editingSupplier ? 'Save' : 'Add Supplier'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Promote Modal */}
      <PromoteModal
        isOpen={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        suppliers={suppliers}
        projectId={projectId}
        stageId={stageId}
        onDone={() => { setPromoteOpen(false); onStatusChange('DONE'); refetch(); }}
      />

      {/* Import from Vendors Modal */}
      <ImportVendorsModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        projectId={projectId}
        stageId={stageId}
        existingNames={suppliers.map((s) => s.name)}
        onDone={() => { setImportOpen(false); refetch(); }}
      />
    </div>
  );
}

// ─── Promote Modal ───

function PromoteModal({ isOpen, onClose, suppliers, projectId, stageId, onDone }: {
  isOpen: boolean; onClose: () => void; suppliers: CandidateSupplier[];
  projectId: string; stageId: string; onDone: () => void;
}) {
  const { addToast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(
    new Set(suppliers.filter((s) => s.status === 'SELECTED').map((s) => s.id)),
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const promoteMutation = useMutation({
    mutationFn: (supplierIds: string[]) =>
      api.post(`/api/v1/projects/${projectId}/stages/${stageId}/candidates/promote`, { supplierIds }),
    onSuccess: () => { addToast('Suppliers added to global list', 'success'); onDone(); },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Add suppliers to your global supplier list?">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">Select which suppliers to promote to your global Vendors list.</p>
        <div className="max-h-60 space-y-1 overflow-y-auto">
          {suppliers.map((s) => {
            const sc = STATUS_COLORS[s.status] ?? STATUS_COLORS.NEW;
            return (
              <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5 hover:bg-gray-50">
                <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)}
                  className="h-4 w-4 rounded border-gray-300 text-[#DC2626] focus:ring-[#DC2626]" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-900">{s.name}</span>
                  {s.country && <span className="ml-2 text-xs text-gray-500">{s.country}</span>}
                </div>
                <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', sc.bg, sc.text)}>
                  {s.status.replace(/_/g, ' ')}
                </span>
              </label>
            );
          })}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <Button variant="secondary" onClick={onDone}>Skip</Button>
          <Button variant="primary" disabled={selected.size === 0 || promoteMutation.isPending}
            onClick={() => promoteMutation.mutate(Array.from(selected))}>
            {promoteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            Add {selected.size} to Global Vendors
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Import from Vendors Modal ───

interface FactoryRow {
  id: string;
  name: string;
  country: string;
  capability: { id: string; name: string };
  logo: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  contacts: { id: string; name: string; role: string; wechatId: string }[];
}

interface FactoriesResponse {
  data: FactoryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function ImportVendorsModal({ isOpen, onClose, projectId, stageId, existingNames, onDone }: {
  isOpen: boolean; onClose: () => void; projectId: string; stageId: string;
  existingNames: string[]; onDone: () => void;
}) {
  const { addToast } = useToast();
  const [vendorSearch, setVendorSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: vendorsData, isLoading } = useQuery({
    queryKey: ['factories-for-import', vendorSearch],
    queryFn: () => api.get<FactoriesResponse>('/api/v1/factories', { search: vendorSearch, page: '1', pageSize: '50' }),
    enabled: isOpen,
  });

  const vendors = vendorsData?.data ?? [];
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const importMutation = useMutation({
    mutationFn: (factoryIds: string[]) =>
      api.post<{ factoryId: string; supplierId: string; name: string }[]>(
        `/api/v1/projects/${projectId}/stages/${stageId}/candidates/import-vendors`,
        { factoryIds },
      ),
    onSuccess: (result: { factoryId: string; supplierId: string; name: string }[]) => {
      addToast(`${result.length} vendor${result.length !== 1 ? 's' : ''} imported`, 'success');
      setSelected(new Set());
      onDone();
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import from Vendors">
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Select existing vendors to add as candidate suppliers for comparison.
        </p>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={vendorSearch}
            onChange={(e) => setVendorSearch(e.target.value)}
            placeholder="Search vendors..."
            className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[#DC2626] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20"
          />
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
            </div>
          ) : vendors.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">No vendors found</p>
          ) : (
            vendors.map((v) => {
              const alreadyImported = existingNames.includes(v.name);
              return (
                <label
                  key={v.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                    alreadyImported
                      ? 'border-green-100 bg-green-50/50 cursor-default'
                      : selected.has(v.id)
                      ? 'border-[#DC2626]/20 bg-red-50/30'
                      : 'border-gray-100 hover:bg-gray-50',
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(v.id)}
                    onChange={() => toggle(v.id)}
                    disabled={alreadyImported}
                    className="h-4 w-4 rounded border-gray-300 text-[#DC2626] focus:ring-[#DC2626] disabled:opacity-50"
                  />
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-100 bg-gray-50">
                    {v.logo ? (
                      <img src={`${apiBase}${v.logo}`} alt={v.name} className="h-full w-full object-contain p-1" />
                    ) : (
                      <Building2 className="h-5 w-5 text-gray-300" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{v.name}</span>
                      {alreadyImported && (
                        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                          Already added
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      {v.country && <span>{COUNTRY_FLAGS[v.country] ?? ''} {v.country}</span>}
                      {v.capability && (
                        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-medium', capBadgeColor(v.capability.name))}>
                          {v.capability.name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {v.contacts?.length > 0 && <WeChatIcon className="h-4 w-4 text-[#07C160]" />}
                    {v.phone && <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />}
                    {v.email && <Mail className="h-4 w-4 text-gray-400" />}
                    {v.website && <Globe className="h-4 w-4 text-gray-400" />}
                  </div>
                </label>
              );
            })
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={selected.size === 0 || importMutation.isPending}
            onClick={() => importMutation.mutate(Array.from(selected))}
          >
            {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
            Import {selected.size} Vendor{selected.size !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
