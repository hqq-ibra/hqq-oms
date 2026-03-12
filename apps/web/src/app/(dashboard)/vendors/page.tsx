'use client';

import { useState, useRef, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Button,
  Input,
  Select,
  SearchInput,
  DataTable,
  Pagination,
  Modal,
  type DataTableColumn,
} from '@/components/ui';
import { useToast } from '@/components/ui';
import { Plus, Check, ChevronDown, X, Trash2, UserPlus, MessageCircle, Mail, Globe, MapPin, ExternalLink, Camera, Building2, FolderOpen, Loader2, Search, ArrowLeft, Users } from 'lucide-react';

// ── Types ──

interface Capability {
  id: string;
  name: string;
}

interface VendorContact {
  id: string;
  name: string;
  role: string;
  wechatId: string;
}

interface FactoryRow {
  id: string;
  name: string;
  country: string;
  capability: Capability;
  capabilityId: string;
  logo: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  location: string | null;
  contacts: VendorContact[];
  notes: string | null;
}

interface FactoriesResponse {
  data: FactoryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const factoryFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  country: z.string().min(1, 'Country is required'),
  capabilityId: z.string().min(1, 'Capability is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  website: z.string().optional(),
  location: z.string().optional(),
  notes: z.string().optional(),
});

type FactoryFormValues = z.infer<typeof factoryFormSchema>;

// ── Countries + Dial Codes ──

const COUNTRY_DATA: Record<string, string> = {
  'China': '+86',
  'Saudi Arabia': '+966',
  'Argentina': '+54',
  'Australia': '+61',
  'Austria': '+43',
  'Bangladesh': '+880',
  'Belgium': '+32',
  'Brazil': '+55',
  'Cambodia': '+855',
  'Canada': '+1',
  'Chile': '+56',
  'Colombia': '+57',
  'Czech Republic': '+420',
  'Denmark': '+45',
  'Egypt': '+20',
  'Ethiopia': '+251',
  'Finland': '+358',
  'France': '+33',
  'Germany': '+49',
  'Greece': '+30',
  'Hungary': '+36',
  'India': '+91',
  'Indonesia': '+62',
  'Iran': '+98',
  'Iraq': '+964',
  'Ireland': '+353',
  'Israel': '+972',
  'Italy': '+39',
  'Japan': '+81',
  'Jordan': '+962',
  'Kazakhstan': '+7',
  'Kenya': '+254',
  'Kuwait': '+965',
  'Lebanon': '+961',
  'Malaysia': '+60',
  'Mexico': '+52',
  'Morocco': '+212',
  'Myanmar': '+95',
  'Netherlands': '+31',
  'New Zealand': '+64',
  'Nigeria': '+234',
  'Norway': '+47',
  'Oman': '+968',
  'Pakistan': '+92',
  'Peru': '+51',
  'Philippines': '+63',
  'Poland': '+48',
  'Portugal': '+351',
  'Qatar': '+974',
  'Romania': '+40',
  'Russia': '+7',
  'Singapore': '+65',
  'South Africa': '+27',
  'South Korea': '+82',
  'Spain': '+34',
  'Sri Lanka': '+94',
  'Sweden': '+46',
  'Switzerland': '+41',
  'Taiwan': '+886',
  'Thailand': '+66',
  'Turkey': '+90',
  'UAE': '+971',
  'Ukraine': '+380',
  'United Kingdom': '+44',
  'United States': '+1',
  'Uzbekistan': '+998',
  'Vietnam': '+84',
};

const COUNTRIES = Object.keys(COUNTRY_DATA);

// ── Capability Dropdown with inline Add ──

function CapabilitySelect({
  value,
  onChange,
  error,
}: {
  value: string;
  onChange: (id: string) => void;
  error?: string;
}) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: capabilities = [] } = useQuery({
    queryKey: ['capabilities'],
    queryFn: () => api.get<Capability[]>('/api/v1/capabilities'),
  });

  const createMutation = useMutation({
    mutationFn: (name: string) =>
      api.post<Capability>('/api/v1/capabilities', { name }),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['capabilities'] });
      onChange(created.id);
      setAdding(false);
      setNewName('');
      setOpen(false);
      addToast(`"${created.name}" added`, 'success');
    },
    onError: (err: Error) => {
      addToast(err.message || 'Failed to add', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/capabilities/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['capabilities'] });
      setConfirmDelete(null);
      if (value === confirmDelete) onChange('');
      addToast('Capability deleted', 'success');
    },
    onError: (err: Error) => {
      setConfirmDelete(null);
      addToast(err.message || 'Cannot delete', 'error');
    },
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

  const selected = capabilities.find((c) => c.id === value);

  const handleAdd = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    createMutation.mutate(trimmed);
  };

  return (
    <div ref={ref} className="relative">
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        Capability
      </label>
      <button
        type="button"
        onClick={() => { setOpen(!open); setAdding(false); }}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
          error
            ? 'border-red-300 focus:ring-red-500'
            : 'border-gray-300 focus:ring-[#DC2626]'
        } bg-white focus:outline-none focus:ring-2`}
      >
        <span className={selected ? 'text-gray-900' : 'text-gray-400'}>
          {selected?.name ?? 'Select capability...'}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white shadow-lg">
          <ul className="max-h-48 overflow-y-auto py-1">
            {capabilities.map((cap) => (
              <li key={cap.id}>
                {confirmDelete === cap.id ? (
                  <div className="flex items-center justify-between gap-2 bg-red-50 px-3 py-2">
                    <span className="text-xs text-red-700">Delete &quot;{cap.name}&quot;?</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(cap.id)}
                        disabled={deleteMutation.isPending}
                        className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700"
                      >
                        {deleteMutation.isPending ? '...' : 'Yes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(null)}
                        className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-300"
                      >
                        No
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={`group flex items-center transition-colors hover:bg-red-50 ${
                    cap.id === value ? 'bg-red-50' : ''
                  }`}>
                    <button
                      type="button"
                      onClick={() => { onChange(cap.id); setOpen(false); setConfirmDelete(null); }}
                      className={`flex flex-1 items-center gap-2 px-3 py-2 text-sm ${
                        cap.id === value ? 'font-medium text-[#DC2626]' : 'text-gray-700'
                      }`}
                    >
                      {cap.id === value && <Check className="h-3.5 w-3.5 text-[#DC2626]" />}
                      <span className={cap.id === value ? '' : 'ml-5'}>{cap.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(cap.id); }}
                      className="mr-2 rounded p-1 text-gray-300 opacity-0 transition-all hover:bg-red-100 hover:text-red-500 group-hover:opacity-100"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>

          <div className="border-t border-gray-100">
            {adding ? (
              <div className="flex items-center gap-1.5 px-2 py-2">
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); handleAdd(); }
                    if (e.key === 'Escape') { setAdding(false); setNewName(''); }
                  }}
                  placeholder="New capability..."
                  className="flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
                />
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!newName.trim() || createMutation.isPending}
                  className="rounded-md bg-[#DC2626] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#C41E1E] disabled:opacity-50"
                >
                  {createMutation.isPending ? '...' : 'Add'}
                </button>
                <button
                  type="button"
                  onClick={() => { setAdding(false); setNewName(''); }}
                  className="rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-medium text-[#DC2626] transition-colors hover:bg-red-50"
              >
                <Plus className="h-4 w-4" />
                Add new...
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Country Flags ──

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

// ── Phone Field with flag + fixed dial code ──

function PhoneField({ form }: { form: ReturnType<typeof useForm<FactoryFormValues>> }) {
  const country = form.watch('country');
  const dialCode = country ? COUNTRY_DATA[country] ?? '' : '';
  const flag = country ? COUNTRY_FLAGS[country] ?? '' : '';
  const [localNumber, setLocalNumber] = useState('');

  useEffect(() => {
    const fullPhone = form.getValues('phone') ?? '';
    if (dialCode && fullPhone.startsWith(dialCode)) {
      setLocalNumber(fullPhone.slice(dialCode.length).replace(/^\s+/, ''));
    } else if (!dialCode) {
      setLocalNumber(fullPhone);
    }
  }, [country, dialCode, form]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^\d\s\-]/g, '');
    setLocalNumber(val);
    form.setValue('phone', dialCode ? `${dialCode}${val}` : val);
  };

  return (
    <div className="w-full">
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        Phone Number
      </label>
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

// ── Logo Upload ──

function LogoUpload({ factoryId, currentLogo, onUploaded }: { factoryId: string; currentLogo: string | null; onUploaded?: (logo: string) => void }) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const logoSrc = previewUrl || (currentLogo ? `${apiBase}${currentLogo}` : null);

  const processFile = async (file: File) => {
    if (!file.type.match(/^image\/(jpeg|png|gif|webp|svg\+xml)$/)) {
      addToast('Only image files are allowed', 'error');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      addToast('File must be under 2MB', 'error');
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('logo', file);
      const updated = await api.upload<FactoryRow>(`/api/v1/factories/${factoryId}/logo`, formData);
      queryClient.invalidateQueries({ queryKey: ['factories'] });
      onUploaded?.(updated.logo!);
      addToast('Logo uploaded', 'success');
    } catch (err: any) {
      setPreviewUrl(null);
      addToast(err.message || 'Upload failed', 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
  };

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) processFile(file);
          return;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  });

  return (
    <div className="flex flex-col items-center gap-2">
      <label className="text-sm font-medium text-gray-700">Company Logo</label>
      <div
        ref={dropRef}
        onClick={() => fileRef.current?.click()}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`group relative flex h-24 w-24 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed transition-all ${
          dragging
            ? 'border-[#DC2626] bg-red-50/50 scale-105'
            : 'border-gray-200 bg-gray-50 hover:border-[#DC2626]/40 hover:bg-red-50/30'
        } ${uploading ? 'pointer-events-none opacity-50' : ''}`}
      >
        {logoSrc ? (
          <>
            <img src={logoSrc} alt="Logo" className="h-full w-full object-contain p-1" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-5 w-5 text-white" />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-1 text-gray-400 transition-colors group-hover:text-[#DC2626]">
            {uploading ? (
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-gray-300 border-t-[#DC2626]" />
            ) : dragging ? (
              <Building2 className="h-6 w-6 text-[#DC2626]" />
            ) : (
              <>
                <Building2 className="h-6 w-6" />
                <span className="text-[10px] font-medium leading-tight text-center">Drop, paste<br/>or click</span>
              </>
            )}
          </div>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={handleFileInput}
      />
    </div>
  );
}

// ── WeChat Icon SVG ──

function WeChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05a6.228 6.228 0 01-.235-1.69c0-3.542 3.282-6.421 7.33-6.421.258 0 .51.015.76.04C16.672 4.857 13.073 2.188 8.69 2.188zm-2.87 4.401a1.008 1.008 0 110 2.017 1.008 1.008 0 010-2.017zm5.567 0a1.009 1.009 0 110 2.017 1.009 1.009 0 010-2.017zm5.204 3.678c-3.573 0-6.47 2.543-6.47 5.676 0 3.13 2.897 5.675 6.47 5.675a7.842 7.842 0 002.2-.314.614.614 0 01.51.07l1.354.795a.252.252 0 00.126.04.182.182 0 00.182-.183c0-.052-.02-.105-.034-.154l-.28-1.06a.449.449 0 01.153-.476c1.399-1.076 2.289-2.681 2.289-4.393 0-3.133-2.897-5.676-6.47-5.676h-.03zm-2.88 3.373a.84.84 0 110 1.68.84.84 0 010-1.68zm5.567 0a.84.84 0 110 1.68.84.84 0 010-1.68z" />
    </svg>
  );
}

// ── Contacts Manager (inside edit modal) ──

function ContactsManager({ factoryId }: { factoryId: string }) {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [adding, setAdding] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', role: '', wechatId: '' });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: factory } = useQuery({
    queryKey: ['factories', factoryId],
    queryFn: () => api.get<FactoryRow>(`/api/v1/factories/${factoryId}`),
    enabled: !!factoryId,
  });

  const contacts = factory?.contacts ?? [];

  const addMutation = useMutation({
    mutationFn: (data: { name: string; role: string; wechatId: string }) =>
      api.post(`/api/v1/factories/${factoryId}/contacts`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factories'] });
      setAdding(false);
      setNewContact({ name: '', role: '', wechatId: '' });
      addToast('Contact added', 'success');
    },
    onError: (err: Error) => addToast(err.message || 'Failed', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/factories/contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factories'] });
      setConfirmDelete(null);
      addToast('Contact removed', 'success');
    },
    onError: (err: Error) => { setConfirmDelete(null); addToast(err.message || 'Failed', 'error'); },
  });

  const handleOpenWeChat = (wechatId: string) => {
    const link = document.createElement('a');
    link.href = `hqqwechat://${wechatId}`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => document.body.removeChild(link), 100);
    addToast('Opening WeChat...', 'success');
  };

  const handleAdd = () => {
    if (!newContact.name.trim() || !newContact.role.trim() || !newContact.wechatId.trim()) return;
    addMutation.mutate(newContact);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-700">WeChat Contacts</label>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#DC2626] transition-colors hover:bg-red-50"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add Contact
          </button>
        )}
      </div>

      {contacts.length === 0 && !adding && (
        <p className="rounded-lg border border-dashed border-gray-200 py-4 text-center text-xs text-gray-400">
          No contacts yet
        </p>
      )}

      <div className="space-y-2">
        {contacts.map((c) => (
          <div
            key={c.id}
            className="group flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 transition-colors hover:border-gray-200"
          >
            <button
              type="button"
              onClick={() => handleOpenWeChat(c.wechatId)}
              className="flex-shrink-0 rounded-full bg-[#07C160] p-1.5 text-white transition-transform hover:scale-110 active:scale-95"
              title={`Open WeChat: ${c.wechatId}`}
            >
              <WeChatIcon className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{c.name}</p>
              <p className="truncate text-xs text-gray-500">{c.role}</p>
            </div>

            <span className="hidden text-xs text-gray-400 group-hover:inline" title="WeChat ID">
              {c.wechatId}
            </span>

            {confirmDelete === c.id ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(c.id)}
                  disabled={deleteMutation.isPending}
                  className="rounded bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700"
                >
                  {deleteMutation.isPending ? '...' : 'Yes'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(null)}
                  className="rounded bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-300"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(c.id)}
                className="rounded p-1 text-gray-300 opacity-0 transition-all hover:bg-red-100 hover:text-red-500 group-hover:opacity-100"
                title="Remove contact"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>

      {adding && (
        <div className="space-y-2 rounded-lg border border-[#DC2626]/20 bg-red-50/30 p-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              value={newContact.name}
              onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
              placeholder="Name"
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
            />
            <input
              value={newContact.role}
              onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
              placeholder="Role (e.g. Sales Manager)"
              className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
            />
          </div>
          <input
            value={newContact.wechatId}
            onChange={(e) => setNewContact({ ...newContact, wechatId: e.target.value })}
            placeholder="WeChat ID"
            className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          />
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => { setAdding(false); setNewContact({ name: '', role: '', wechatId: '' }); }}
              className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAdd}
              disabled={!newContact.name.trim() || !newContact.role.trim() || !newContact.wechatId.trim() || addMutation.isPending}
              className="rounded-md bg-[#DC2626] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#C41E1E] disabled:opacity-50"
            >
              {addMutation.isPending ? 'Adding...' : 'Add'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── WhatsApp Icon SVG ──

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

// ── Quick Actions Cell (Website, WhatsApp, Email, Location) ──

function QuickActionsCell({ factory }: { factory: FactoryRow }) {
  const hasWebsite = !!factory.website;
  const hasPhone = !!factory.phone;
  const hasEmail = !!factory.email;
  const hasLocation = !!factory.location;

  if (!hasWebsite && !hasPhone && !hasEmail && !hasLocation) {
    return (
      <div className="flex min-h-[8rem] items-center text-left">
        <span className="text-gray-300">—</span>
      </div>
    );
  }

  const phoneDigits = factory.phone?.replace(/[\s\-\+]/g, '') ?? '';
  const gmailUrl = factory.email
    ? `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(factory.email)}`
    : '';
  const mapsUrl = factory.location
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(factory.location)}`
    : '';
  const websiteUrl = factory.website?.startsWith('http') ? factory.website : `https://${factory.website}`;

  return (
    <div className="flex min-h-[8rem] flex-col justify-center gap-2 text-left" onClick={(e) => e.stopPropagation()}>
      {hasWebsite && (
        <a
          href={websiteUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={factory.website ?? 'Website'}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-gray-500 transition-all hover:bg-blue-50 hover:text-blue-600 active:scale-95"
        >
          <Globe className="h-5 w-5" />
          <span className="text-sm">Website</span>
        </a>
      )}
      {hasPhone && (
        <a
          href={`https://wa.me/${phoneDigits}`}
          target="_blank"
          rel="noopener noreferrer"
          title={`WhatsApp: ${factory.phone}`}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[#25D366] transition-all hover:bg-green-50 hover:text-[#1DA851] active:scale-95"
        >
          <WhatsAppIcon className="h-5 w-5" />
          <span className="text-sm">WhatsApp</span>
        </a>
      )}
      {hasEmail && (
        <a
          href={gmailUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={`Email: ${factory.email}`}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-gray-500 transition-all hover:bg-red-50 hover:text-red-500 active:scale-95"
        >
          <Mail className="h-5 w-5" />
          <span className="text-sm">Email</span>
        </a>
      )}
      {hasLocation && (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          title={factory.location ?? 'Location'}
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-gray-500 transition-all hover:bg-orange-50 hover:text-orange-500 active:scale-95"
        >
          <MapPin className="h-5 w-5" />
          <span className="text-sm">Location</span>
        </a>
      )}
    </div>
  );
}

// ── WeChat Cell (for table) — with names & roles ──

function WeChatCell({ factory }: { factory: FactoryRow }) {
  const { addToast } = useToast();
  const contacts = factory.contacts ?? [];

  if (contacts.length === 0) {
    return (
      <div className="flex min-h-[8rem] items-center text-left">
        <span className="text-gray-300">—</span>
      </div>
    );
  }

  const handleClick = (e: React.MouseEvent, wechatId: string) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.href = `hqqwechat://${wechatId}`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    setTimeout(() => document.body.removeChild(link), 100);
    addToast('Opening WeChat...', 'success');
  };

  return (
    <div className="flex min-h-[8rem] items-center gap-4 text-left" onClick={(e) => e.stopPropagation()}>
      {contacts.map((c) => (
        <button
          key={c.id}
          onClick={(e) => handleClick(e, c.wechatId)}
          className="group flex flex-col items-center gap-1 rounded-xl px-3 py-2 transition-all hover:bg-green-50 active:scale-95"
          title={`WeChat: ${c.wechatId}`}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#07C160]/10 transition-colors group-hover:bg-[#07C160]/20">
            <WeChatIcon className="h-6 w-6 text-[#07C160]" />
          </div>
          <span className="max-w-[90px] truncate text-sm font-medium leading-tight text-gray-700">
            {c.name}
          </span>
          <span className="max-w-[90px] truncate text-xs leading-tight text-gray-400">
            {c.role}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Capability Badge (for table) ──

const BADGE_COLORS = [
  'bg-blue-100 text-blue-800',
  'bg-purple-100 text-purple-800',
  'bg-amber-100 text-amber-800',
  'bg-green-100 text-green-800',
  'bg-pink-100 text-pink-800',
  'bg-cyan-100 text-cyan-800',
  'bg-orange-100 text-orange-800',
  'bg-indigo-100 text-indigo-800',
];

function capBadgeColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return BADGE_COLORS[Math.abs(hash) % BADGE_COLORS.length];
}

// ── Main Page ──

export default function FactoriesPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingFactory, setEditingFactory] = useState<FactoryRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['factories', search, page],
    queryFn: () =>
      api.get<FactoriesResponse>('/api/v1/factories', {
        search,
        page: String(page),
        pageSize: '10',
      }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: FactoryFormValues) =>
      api.post<FactoryRow>('/api/v1/factories', payload),
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ['factories'] });
      addToast('Vendor created — now add WeChat contacts', 'success');
      setEditingFactory(created);
      form.reset({
        name: created.name,
        country: created.country,
        capabilityId: created.capabilityId,
        phone: created.phone ?? '',
        email: created.email ?? '',
        website: created.website ?? '',
        location: created.location ?? '',
        notes: created.notes ?? '',
      });
    },
    onError: (err: Error) => {
      addToast(err.message || 'Failed to create vendor', 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Partial<FactoryFormValues> }) =>
      api.patch(`/api/v1/factories/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factories'] });
      addToast('Vendor updated successfully', 'success');
      closeModal();
    },
    onError: (err: Error) => {
      addToast(err.message || 'Failed to update vendor', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/factories/${id}`),
    onSuccess: (_data, deletedId) => {
      queryClient.setQueryData<FactoriesResponse>(['factories', search, page], (old) => {
        if (!old) return old;
        return { ...old, data: old.data.filter((f: FactoryRow) => f.id !== deletedId), total: old.total - 1 };
      });
      queryClient.invalidateQueries({ queryKey: ['factories'] });
      addToast('Vendor deleted', 'success');
      closeModal();
    },
    onError: (err: Error) => {
      addToast(err.message || 'Failed to delete vendor', 'error');
    },
  });

  const [confirmDeleteVendor, setConfirmDeleteVendor] = useState(false);

  const form = useForm<FactoryFormValues>({
    resolver: zodResolver(factoryFormSchema),
    defaultValues: { name: '', country: '', capabilityId: '', phone: '', email: '', website: '', location: '', notes: '' },
  });

  const factories = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  const closeModal = () => {
    setModalOpen(false);
    setEditingFactory(null);
    setConfirmDeleteVendor(false);
    form.reset();
  };

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const columns: DataTableColumn<FactoryRow>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (r) => (
        <div className="flex min-h-[8rem] items-center gap-3 text-left">
          <div className="flex h-32 w-32 flex-shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
            {r.logo ? (
              <img src={`${apiBase}${r.logo}`} alt={r.name} className="h-full w-full object-contain p-2" />
            ) : (
              <Building2 className="h-10 w-10 text-gray-300" />
            )}
          </div>
          <span className="font-medium text-gray-900">{r.name}</span>
        </div>
      ),
    },
    {
      key: 'country',
      header: 'Country',
      render: (r) => (
        <div className="flex min-h-[8rem] items-center text-left">
          <span>{r.country}</span>
        </div>
      ),
    },
    {
      key: 'capability',
      header: 'Capability',
      render: (r) => (
        <div className="flex min-h-[8rem] items-center justify-start text-left">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${capBadgeColor(r.capability.name)}`}>
            {r.capability.name}
          </span>
        </div>
      ),
    },
    {
      key: 'actions',
      header: 'Quick Actions',
      render: (r) => <QuickActionsCell factory={r} />,
    },
    {
      key: 'contacts',
      header: 'WeChat',
      render: (r) => <WeChatCell factory={r} />,
    },
  ];

  const handleRowClick = (row: FactoryRow) => {
    setEditingFactory(row);
    form.reset({
      name: row.name,
      country: row.country,
      capabilityId: row.capabilityId,
      phone: row.phone ?? '',
      email: row.email ?? '',
      website: row.website ?? '',
      location: row.location ?? '',
      notes: row.notes ?? '',
    });
    setModalOpen(true);
  };

  const handleAddClick = () => {
    setEditingFactory(null);
    form.reset({ name: '', country: '', capabilityId: '', phone: '', email: '', website: '', location: '', notes: '' });
    setModalOpen(true);
  };

  const onSubmit = (values: FactoryFormValues) => {
    if (editingFactory) {
      updateMutation.mutate({ id: editingFactory.id, payload: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Vendors</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="md" onClick={() => setImportOpen(true)}>
            <FolderOpen className="h-4 w-4" />
            Import from Projects
          </Button>
          <Button variant="primary" size="md" onClick={handleAddClick}>
            <Plus className="h-4 w-4" />
            Add Vendor
          </Button>
        </div>
      </div>

      <SearchInput
        value={search}
        onChange={(v) => { setSearch(v); setPage(1); }}
        placeholder="Search vendors..."
      />

      <DataTable
        columns={columns}
        data={factories}
        loading={isLoading}
        emptyMessage="No vendors found"
        onRowClick={handleRowClick}
      />

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      <Modal isOpen={modalOpen} onClose={closeModal} title={editingFactory ? 'Edit Vendor' : 'Add Vendor'}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {editingFactory && (
            <LogoUpload
              factoryId={editingFactory.id}
              currentLogo={editingFactory.logo}
              onUploaded={(logo) => setEditingFactory({ ...editingFactory, logo })}
            />
          )}
          <Input label="Name" error={form.formState.errors.name?.message} {...form.register('name')} />
          <Select
            label="Country"
            options={COUNTRIES.map(c => ({ value: c, label: c }))}
            error={form.formState.errors.country?.message}
            {...form.register('country')}
          />
          <Controller
            name="capabilityId"
            control={form.control}
            render={({ field, fieldState }) => (
              <CapabilitySelect
                value={field.value}
                onChange={field.onChange}
                error={fieldState.error?.message}
              />
            )}
          />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <PhoneField form={form} />
            </div>
            {form.watch('phone') && (
              <a
                href={`https://wa.me/${form.watch('phone')?.replace(/[\s\-\+]/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-[1px] flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[#25D366] text-white transition-colors hover:bg-[#1DA851]"
                title="Open WhatsApp"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                </svg>
              </a>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-gray-400" /> Email</span>
            </label>
            <input
              {...form.register('email')}
              type="email"
              placeholder="vendor@example.com"
              className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#DC2626] focus:ring-offset-1"
            />
            {form.formState.errors.email && (
              <p className="mt-1 text-xs text-red-500">{form.formState.errors.email.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              <span className="flex items-center gap-1.5"><Globe className="h-3.5 w-3.5 text-gray-400" /> Website</span>
            </label>
            <input
              {...form.register('website')}
              type="url"
              placeholder="https://www.example.com"
              className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#DC2626] focus:ring-offset-1"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              <span className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-gray-400" /> Location</span>
            </label>
            <input
              {...form.register('location')}
              placeholder="City, Province"
              className="flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 transition-colors hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-[#DC2626] focus:ring-offset-1"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Notes</label>
            <textarea
              {...form.register('notes')}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
            />
          </div>

          {editingFactory && (
            <div className="border-t border-gray-100 pt-4">
              <ContactsManager factoryId={editingFactory.id} />
            </div>
          )}

          <div className="flex items-center justify-between">
            {editingFactory ? (
              <div>
                {confirmDeleteVendor ? (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-red-600">Delete this vendor?</span>
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(editingFactory.id)}
                      disabled={deleteMutation.isPending}
                      className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                    >
                      {deleteMutation.isPending ? 'Deleting...' : 'Yes, Delete'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteVendor(false)}
                      className="rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-200"
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteVendor(true)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete Vendor
                  </button>
                )}
              </div>
            ) : <div />}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={closeModal}>Cancel</Button>
              <Button type="submit" variant="primary" loading={isPending}>
                {editingFactory ? 'Save' : 'Create Vendor'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <ImportFromProjectsModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onDone={() => {
          setImportOpen(false);
          queryClient.invalidateQueries({ queryKey: ['factories'] });
        }}
      />
    </div>
  );
}

// ── Import from Projects Modal ──

interface ProjectWithCandidates {
  id: string;
  code: string;
  name: string;
  status: string;
  _count: { candidateSuppliers: number };
}

interface CandidateRow {
  id: string;
  name: string;
  country: string | null;
  capability: string | null;
  contactPerson: string | null;
  wechatId: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  status: string;
  notes: string | null;
  existsInVendors: boolean;
}

const CANDIDATE_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  NEW: { bg: 'bg-gray-100', text: 'text-gray-700' },
  CONTACTED: { bg: 'bg-blue-100', text: 'text-blue-700' },
  WAITING_REPLY: { bg: 'bg-amber-100', text: 'text-amber-700' },
  REJECTED: { bg: 'bg-red-100', text: 'text-red-700' },
  SELECTED: { bg: 'bg-green-100', text: 'text-green-700' },
};

function ImportFromProjectsModal({
  isOpen,
  onClose,
  onDone,
}: {
  isOpen: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const { addToast } = useToast();
  const [selectedProject, setSelectedProject] = useState<ProjectWithCandidates | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: projects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects-with-candidates'],
    queryFn: () => api.get<ProjectWithCandidates[]>('/api/v1/factories/import/projects'),
    enabled: isOpen,
  });

  const { data: candidates = [], isLoading: loadingCandidates } = useQuery({
    queryKey: ['project-candidates', selectedProject?.id],
    queryFn: () =>
      api.get<CandidateRow[]>(`/api/v1/factories/import/projects/${selectedProject!.id}/candidates`),
    enabled: !!selectedProject,
  });

  const importMutation = useMutation({
    mutationFn: (supplierIds: string[]) =>
      api.post<{ supplierId: string; factoryId: string; name: string }[]>(
        '/api/v1/factories/import/from-candidates',
        { supplierIds },
      ),
    onSuccess: (result) => {
      addToast(`${result.length} supplier${result.length !== 1 ? 's' : ''} imported as vendors`, 'success');
      handleClose();
      onDone();
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const selectAll = () => {
    const importable = candidates.filter((c) => !c.existsInVendors);
    if (selected.size === importable.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(importable.map((c) => c.id)));
    }
  };

  const handleClose = () => {
    setSelectedProject(null);
    setSelected(new Set());
    onClose();
  };

  const handleBack = () => {
    setSelectedProject(null);
    setSelected(new Set());
  };

  const PROJECT_STATUS_COLORS: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    ACTIVE: 'bg-blue-100 text-blue-700',
    ON_HOLD: 'bg-amber-100 text-amber-700',
    DONE: 'bg-green-100 text-green-700',
    CANCELLED: 'bg-red-100 text-red-600',
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import from Projects">
      <div className="space-y-4">
        {!selectedProject ? (
          <>
            <p className="text-sm text-gray-600">
              Select a project to import its candidate suppliers as vendors.
            </p>

            {loadingProjects ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10">
                <FolderOpen className="h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-500">No projects with candidate suppliers found</p>
              </div>
            ) : (
              <div className="max-h-80 space-y-1 overflow-y-auto">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedProject(p)}
                    className="flex w-full items-center gap-3 rounded-lg border border-gray-100 px-4 py-3 text-left transition-colors hover:border-gray-200 hover:bg-gray-50"
                  >
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-gray-100">
                      <FolderOpen className="h-5 w-5 text-gray-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{p.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${PROJECT_STATUS_COLORS[p.status] ?? 'bg-gray-100 text-gray-600'}`}>
                          {p.status}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">{p.code}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Users className="h-3.5 w-3.5" />
                      {p._count.candidateSuppliers}
                    </div>
                    <ChevronDown className="h-4 w-4 -rotate-90 text-gray-400" />
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBack}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </button>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-gray-900">{selectedProject.name}</span>
                <span className="ml-2 text-xs text-gray-400">{selectedProject.code}</span>
              </div>
              <button
                type="button"
                onClick={selectAll}
                className="text-xs font-medium text-[#DC2626] hover:underline"
              >
                {selected.size === candidates.filter((c) => !c.existsInVendors).length
                  ? 'Deselect all'
                  : 'Select all'}
              </button>
            </div>

            {loadingCandidates ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : candidates.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No candidates in this project</p>
            ) : (
              <div className="max-h-72 space-y-1 overflow-y-auto">
                {candidates.map((c) => {
                  const alreadyExists = c.existsInVendors;
                  const sc = CANDIDATE_STATUS_COLORS[c.status] ?? CANDIDATE_STATUS_COLORS.NEW;
                  return (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${
                        alreadyExists
                          ? 'border-green-100 bg-green-50/50 cursor-default'
                          : selected.has(c.id)
                          ? 'border-[#DC2626]/20 bg-red-50/30'
                          : 'border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        disabled={alreadyExists}
                        className="h-4 w-4 rounded border-gray-300 text-[#DC2626] focus:ring-[#DC2626] disabled:opacity-50"
                      />
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-gray-50">
                        <Building2 className="h-4.5 w-4.5 text-gray-300" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{c.name}</span>
                          {alreadyExists && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                              Already exists
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          {c.country && <span>{c.country}</span>}
                          {c.capability && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${capBadgeColor(c.capability)}`}>
                              {c.capability}
                            </span>
                          )}
                          {c.contactPerson && <span>· {c.contactPerson}</span>}
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${sc.bg} ${sc.text}`}>
                        {c.status.replace(/_/g, ' ')}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}

            <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
              <Button variant="secondary" onClick={handleClose}>Cancel</Button>
              <Button
                variant="primary"
                disabled={selected.size === 0 || importMutation.isPending}
                onClick={() => importMutation.mutate(Array.from(selected))}
              >
                {importMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Import {selected.size} as Vendor{selected.size !== 1 ? 's' : ''}
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
