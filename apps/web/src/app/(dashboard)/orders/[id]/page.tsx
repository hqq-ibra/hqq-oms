'use client';

import * as React from 'react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import {
  Button,
  Badge,
  Card,
  Modal,
  Input,
  Select,
  useToast,
  type OrderStatusKey,
  type SelectOption,
} from '@/components/ui';
import { usePermissions } from '@/hooks/use-permissions';
import { Permission, OrderStatus, CostType, Currency, ORDER_FLOWS, EntityType, FileType } from '@/lib/types';
import { format } from 'date-fns';
import {
  ArrowLeft,
  ExternalLink,
  Copy,
  FileText,
  Image,
  File,
  Link as LinkIcon,
  Trash2,
  Pencil,
  Plus,
  X,
  Search,
} from 'lucide-react';

const statusChangeSchema = z.object({
  note: z.string().optional(),
});

const costSchema = z.object({
  costType: z.enum(Object.values(CostType) as [string, ...string[]]),
  amount: z.coerce.number().min(0),
  currency: z.enum(Object.values(Currency) as [string, ...string[]]),
});

const fileLinkSchema = z.object({
  fileType: z.enum(Object.values(FileType) as [string, ...string[]]),
  fileName: z.string().min(1),
  fileUrl: z.string().url(),
});

type StatusChangeForm = z.infer<typeof statusChangeSchema>;
type CostForm = z.infer<typeof costSchema>;
type FileLinkForm = z.infer<typeof fileLinkSchema>;

interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  product: {
    nameEn: string;
    nameAr: string | null;
    sku: string;
    factory?: { id: string; name: string; country: string; wechatId: string | null } | null;
  };
}

interface OrderDetail {
  id: string;
  orderNumber: string | null;
  factoryOrderNumber: string | null;
  quoteNumber: string | null;
  orderType: string;
  status: string;
  expectedDeliveryDate: string | null;
  shippingCompany: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  internalNotes: string | null;
  customer: { name: string; city: string | null; type: string };
  product: { nameEn: string; nameAr: string | null; sku: string; type: string } | null;
  factory: { name: string; country: string; wechatId: string | null } | null;
  assignedUser: { name: string } | null;
  items: OrderItem[];
  costs: Array<{
    id: string;
    costType: string;
    amount: number;
    currency: string;
  }>;
  statusHistory: Array<{
    id: string;
    oldStatus: string;
    newStatus: string;
    changedAt: string;
    note: string | null;
    changer: { name: string };
  }>;
  files: Array<{
    id: string;
    fileType: string;
    fileName: string;
    fileUrl: string;
  }>;
}

const FILE_TYPE_ICONS: Record<string, React.ElementType> = {
  IMAGE: Image,
  CAD: FileText,
  PDF: File,
  LINK: LinkIcon,
  RECEIPT: Image,
};

const WECHAT_URL = 'https://weixin.qq.com/';

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const { hasPermission } = usePermissions();
  const id = params.id as string;

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [costModalOpen, setCostModalOpen] = useState(false);
  const [fileModalOpen, setFileModalOpen] = useState(false);
  const [editingCostId, setEditingCostId] = useState<string | null>(null);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addItemSearch, setAddItemSearch] = useState('');
  const [editingQty, setEditingQty] = useState<Record<string, string>>({});
  const receiptUploadRef = useRef<HTMLInputElement>(null);
  const [isDraggingReceipt, setIsDraggingReceipt] = useState(false);
  const [removingReceiptId, setRemovingReceiptId] = useState<string | null>(null);
  const [selectedStatusForChange, setSelectedStatusForChange] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<OrderDetail>(`/api/v1/orders/${id}`),
    enabled: !!id,
  });

  const { data: costs } = useQuery({
    queryKey: ['order-costs', id],
    queryFn: () => api.get<OrderDetail['costs']>(`/api/v1/orders/${id}/costs`),
    enabled: !!id && hasPermission(Permission.VIEW_COSTS),
  });

  const { data: searchProducts } = useQuery({
    queryKey: ['products', 'order-item-search', addItemSearch],
    queryFn: () =>
      api.get<{ data: Array<{ id: string; sku: string; nameEn: string }> }>('/api/v1/products', {
        search: addItemSearch,
        pageSize: '20',
      }),
    enabled: addItemOpen,
  });

  const addItemMutation = useMutation({
    mutationFn: (dto: { productId: string; quantity: number }) =>
      api.post(`/api/v1/orders/${id}/items`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      addToast('Item added', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      api.patch(`/api/v1/orders/${id}/items/${itemId}`, { quantity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const removeItemMutation = useMutation({
    mutationFn: (itemId: string) =>
      api.delete(`/api/v1/orders/${id}/items/${itemId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      addToast('Item removed', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const uploadReceiptMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      // Use same-origin URL so the request goes through Next.js proxy (fixes paste/upload when API is on different host)
      const base =
        typeof window !== 'undefined'
          ? window.location.origin
          : process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const url = `${base}/api/v1/orders/${id}/files`;
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('HQQ_ACCESS_TOKEN')
          : null;
      const headers: HeadersInit = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(url, { method: 'POST', headers, body: formData });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message || `Upload failed: ${res.status}`);
      }
      const text = await res.text();
      return (text ? JSON.parse(text) : undefined) as {
        id: string;
        fileName: string;
        fileUrl: string;
        fileType: string;
      };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      addToast('Receipt uploaded', 'success');
      receiptUploadRef.current && (receiptUploadRef.current.value = '');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const removeReceiptMutation = useMutation({
    mutationFn: (fileId: string) => api.delete(`/api/v1/files/${fileId}`),
    onMutate: (fileId: string) => {
      setRemovingReceiptId(fileId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      addToast('Receipt removed', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
    onSettled: () => {
      setRemovingReceiptId(null);
    },
  });

  const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  const handleReceiptFile = useCallback(
    (file: File) => {
      if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
        addToast('Only images (JPG, PNG, GIF, WebP) are allowed', 'error');
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      uploadReceiptMutation.mutate(formData);
    },
    [uploadReceiptMutation, addToast],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = e.clipboardData?.items?.[0];
      if (!item || item.kind !== 'file' || !item.type.startsWith('image/')) return;
      e.preventDefault();
      e.stopPropagation();
      const file = item.getAsFile();
      if (!file) return;
      handleReceiptFile(file);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [handleReceiptFile]);

  const statusChangeForm = useForm<StatusChangeForm>({
    resolver: zodResolver(statusChangeSchema),
    defaultValues: { note: '' },
  });

  const costForm = useForm<CostForm>({
    resolver: zodResolver(costSchema),
    defaultValues: {
      costType: CostType.FACTORY,
      amount: 0,
      currency: Currency.SAR,
    },
  });

  const fileForm = useForm<FileLinkForm>({
    resolver: zodResolver(fileLinkSchema),
    defaultValues: {
      fileType: FileType.LINK,
      fileName: '',
      fileUrl: '',
    },
  });

  const statusMutation = useMutation({
    mutationFn: (body: { newStatus: string; note?: string }) =>
      api.post(`/api/v1/orders/${id}/status`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      setStatusModalOpen(false);
      setSelectedStatusForChange(null);
      statusChangeForm.reset();
      addToast('Status updated successfully', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const addCostMutation = useMutation({
    mutationFn: (body: { costType: string; amount: number; currency?: string }) =>
      api.post(`/api/v1/orders/${id}/costs`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-costs', id] });
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      setCostModalOpen(false);
      costForm.reset();
      addToast('Cost added successfully', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const updateCostMutation = useMutation({
    mutationFn: ({
      costId,
      body,
    }: {
      costId: string;
      body: { costType?: string; amount?: number; currency?: string };
    }) => api.patch(`/api/v1/orders/costs/${costId}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-costs', id] });
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      setCostModalOpen(false);
      setEditingCostId(null);
      addToast('Cost updated successfully', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const deleteCostMutation = useMutation({
    mutationFn: (costId: string) =>
      api.delete(`/api/v1/orders/costs/${costId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order-costs', id] });
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      addToast('Cost deleted successfully', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const notesMutation = useMutation({
    mutationFn: (internalNotes: string) =>
      api.patch(`/api/v1/orders/${id}`, { internalNotes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      addToast('Notes saved', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const shippingMutation = useMutation({
    mutationFn: (dto: {
      shippingCompany?: string | null;
      trackingNumber?: string | null;
      trackingUrl?: string | null;
    }) => api.patch(`/api/v1/orders/${id}`, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      addToast('Shipping info updated', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const addFileMutation = useMutation({
    mutationFn: (body: {
      entityType: string;
      entityId: string;
      fileType: string;
      fileName: string;
      fileUrl: string;
    }) => api.post('/api/v1/files', body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] });
      setFileModalOpen(false);
      fileForm.reset();
      addToast('File link added', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const onStatusSubmit = statusChangeForm.handleSubmit((data: StatusChangeForm) => {
    const statusToApply = selectedStatusForChange ?? getNextStatus();
    if (statusToApply) statusMutation.mutate({ newStatus: statusToApply, note: data.note });
  });

  const onCostSubmit = costForm.handleSubmit((data: CostForm) => {
    if (editingCostId) {
      updateCostMutation.mutate({
        costId: editingCostId,
        body: { costType: data.costType, amount: data.amount, currency: data.currency },
      });
    } else {
      addCostMutation.mutate(data);
    }
  });

  const onFileSubmit = fileForm.handleSubmit((data: FileLinkForm) => {
    addFileMutation.mutate({
      entityType: EntityType.ORDER,
      entityId: id,
      fileType: data.fileType,
      fileName: data.fileName,
      fileUrl: data.fileUrl,
    });
  });

  const copyWechat = () => {
    if (order?.factory?.wechatId) {
      navigator.clipboard.writeText(order.factory.wechatId);
      addToast('WeChat ID copied', 'success');
    }
  };

  const getNextStatus = (): string | null => {
    if (!order) return null;
    const flow = ORDER_FLOWS[order.orderType];
    if (!flow) return null;
    const idx = flow.indexOf(order.status);
    if (idx === -1 || idx >= flow.length - 1) return null;
    return flow[idx + 1];
  };

  const getNextStatuses = (): string[] => {
    if (!order) return [];
    const flow = ORDER_FLOWS[order.orderType];
    if (!flow) return [];
    const idx = flow.indexOf(order.status);
    if (idx === -1 || idx >= flow.length - 1) return [];
    return flow.slice(idx + 1) as string[];
  };

  const nextStatus = getNextStatus();
  const nextStatuses = getNextStatuses();
  const canChangeStatus = hasPermission(Permission.CHANGE_STATUS) && nextStatuses.length > 0;

  // Lines are only editable while the order is still a quotation. Revenue (the
  // SELLING_PRICE cost row that Reports and Analytics read) and the stock
  // decrement are both derived exactly once, at the confirmation instant, from
  // the lines as they stand then — so bumping a quantity afterwards would
  // leave the books recording a price and an inventory movement for
  // quantities the order no longer has. The API rejects these edits with a
  // 409 (orders.service.ts assertItemsEditable); this hides the controls so
  // the rejection is never reached by accident.
  const itemsEditable = order?.status === OrderStatus.QUOTATION;

  if (isLoading || !order) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#DC2626] border-t-transparent" />
      </div>
    );
  }

  const costList = costs ?? order.costs ?? [];
  const sellingPrice = costList.find((c: { costType: string; amount: number }) => c.costType === CostType.SELLING_PRICE)?.amount ?? 0;
  const factoryCost = costList.find((c: { costType: string; amount: number }) => c.costType === CostType.FACTORY)?.amount ?? 0;
  const shippingCost = costList.find((c: { costType: string; amount: number }) => c.costType === CostType.SHIPPING)?.amount ?? 0;
  const extraCost = costList.find((c: { costType: string; amount: number }) => c.costType === CostType.EXTRA)?.amount ?? 0;
  const moldCost = costList.find((c: { costType: string; amount: number }) => c.costType === CostType.MOLD_COST)?.amount ?? 0;
  const totalCost = factoryCost + shippingCost + extraCost + moldCost;
  const profit = sellingPrice - totalCost;

  const costTypeOptions: SelectOption[] = Object.values(CostType).map((t) => ({
    value: t,
    label: t.replace(/_/g, ' '),
  }));
  const currencyOptions: SelectOption[] = Object.values(Currency).map((c) => ({
    value: c,
    label: c,
  }));
  const fileTypeOptions: SelectOption[] = Object.values(FileType).map((t) => ({
    value: t,
    label: t,
  }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="-ml-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {order.orderNumber ?? order.quoteNumber ?? '—'}
            </h1>
            <p className="text-sm text-gray-500">
              {order.factoryOrderNumber
                ? `Factory: ${order.factoryOrderNumber}`
                : 'Not confirmed yet — no factory order number'}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Badge
            variant={order.status as OrderStatusKey}
            className="text-sm px-3 py-1"
          >
            {order.status.replace(/_/g, ' ')}
          </Badge>
          <Button
            variant="secondary"
            size="md"
            onClick={() => router.push(`/orders/${id}/quotation`)}
          >
            <FileText className="h-4 w-4" />
            Quotation
          </Button>
          {order.status === 'QUOTATION' && hasPermission(Permission.CHANGE_STATUS) && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setSelectedStatusForChange('REJECTED');
                setStatusModalOpen(true);
              }}
            >
              Mark rejected
            </Button>
          )}
          {canChangeStatus && (
            <Select
              options={[
                { value: '', label: 'Change status' },
                ...nextStatuses.map((status) => ({
                  value: status,
                  label: status.replace(/_/g, ' '),
                })),
              ]}
              value={selectedStatusForChange ?? ''}
              onChange={(e) => {
                const v = e.target.value;
                if (v) {
                  setSelectedStatusForChange(v);
                  setStatusModalOpen(true);
                }
              }}
              className="min-w-[180px]"
            />
          )}
        </div>
      </div>

      {/* Info cards grid + Transfer Receipts in one row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Customer">
          <p className="font-medium text-gray-900">{order.customer.name}</p>
          <p className="text-sm text-gray-500">{order.customer.city ?? '—'}</p>
          <p className="text-sm text-gray-500">{order.customer.type}</p>
        </Card>
        <Card title="Factory">
          {order.factory ? (
            <>
              <p className="font-medium text-gray-900">{order.factory.name}</p>
              <p className="text-sm text-gray-500">{order.factory.country}</p>
              <div className="mt-2 flex gap-2">
                <a
                  href={WECHAT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex"
                >
                  <Button variant="secondary" size="sm">
                    WeChat
                  </Button>
                </a>
                {order.factory.wechatId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={copyWechat}
                    title="Copy WeChat ID"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-500">Multiple factories (see items)</p>
          )}
        </Card>
        <Card title="Shipping">
          <ShippingForm
            shippingCompany={order.shippingCompany}
            trackingNumber={order.trackingNumber}
            trackingUrl={order.trackingUrl}
            onSave={shippingMutation.mutate}
            isPending={shippingMutation.isPending}
          />
        </Card>
        <Card
          title="Transfer Receipts"
          footer={
            hasPermission(Permission.UPLOAD_FILES) ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => receiptUploadRef.current?.click()}
                  disabled={uploadReceiptMutation.isPending}
                >
                  <Image className="mr-1 h-4 w-4" />
                  Add receipt
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFileModalOpen(true)}
                >
                  Add file link
                </Button>
              </div>
            ) : undefined
          }
        >
          {hasPermission(Permission.UPLOAD_FILES) && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if (e.dataTransfer.types.includes('Files')) setIsDraggingReceipt(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingReceipt(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsDraggingReceipt(false);
                const files = e.dataTransfer.files;
                if (files?.length) {
                  const imageFiles = Array.from(files).filter((f) =>
                    ACCEPTED_IMAGE_TYPES.includes(f.type),
                  );
                  imageFiles.forEach((file) => handleReceiptFile(file));
                }
              }}
              className={`mb-4 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors ${
                isDraggingReceipt ? 'border-[#DC2626] bg-red-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300 hover:bg-gray-100'
              }`}
            >
              <input
                ref={receiptUploadRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files?.length) {
                    Array.from(files).forEach((file) => handleReceiptFile(file));
                    e.target.value = '';
                  }
                }}
              />
              <p className="text-sm font-medium text-gray-700">
                {isDraggingReceipt ? 'Drop images here' : 'Drag & drop receipt images here, or paste (Ctrl+V), or'}
              </p>
              <button
                type="button"
                onClick={() => receiptUploadRef.current?.click()}
                disabled={uploadReceiptMutation.isPending}
                className="mt-1 text-sm text-[#DC2626] hover:underline disabled:opacity-50"
              >
                browse to choose files
              </button>
            </div>
          )}
          {order.files.length === 0 ? (
            <p className="text-sm text-gray-500">No receipts attached</p>
          ) : (
            <ul className="space-y-2">
              {order.files.map((file) => {
                const Icon = FILE_TYPE_ICONS[file.fileType] ?? File;
                const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
                const href = file.fileUrl.startsWith('http') ? file.fileUrl : `${apiBase}${file.fileUrl}`;
                const label = file.fileType === 'RECEIPT' ? 'Receipt' : file.fileType.replace(/_/g, ' ');
                return (
                  <li key={file.id} className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-gray-400" />
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#DC2626] hover:underline"
                    >
                      {file.fileType === 'RECEIPT' ? `${file.fileName} (receipt)` : file.fileName}
                    </a>
                    <span className="text-xs text-gray-400">— {label}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 shrink-0 p-0"
                      onClick={() => window.open(href, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    {hasPermission(Permission.UPLOAD_FILES) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 shrink-0 p-0 text-red-600 hover:bg-red-50"
                        disabled={removeReceiptMutation.isPending && removingReceiptId === file.id}
                        onClick={() => {
                          if (confirm(`Delete "${file.fileName}"?`)) {
                            removeReceiptMutation.mutate(file.id);
                          }
                        }}
                        title="Delete file"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Order Items */}
      <Card
        title={`Items (${order.items?.length ?? 0})`}
        footer={
          itemsEditable ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => { setAddItemOpen(true); setAddItemSearch(''); }}
            >
              <Plus className="h-4 w-4" />
              Add item
            </Button>
          ) : undefined
        }
      >
        {order.items && order.items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="pb-2 font-medium">Product</th>
                  <th className="pb-2 font-medium">SKU</th>
                  <th className="pb-2 font-medium">Factory</th>
                  <th className="pb-2 font-medium w-20">Qty</th>
                  {itemsEditable && <th className="pb-2 font-medium w-10"></th>}
                </tr>
              </thead>
              <tbody>
                {order.items.map((item) => (
                  <tr key={item.id} className="border-b border-gray-100">
                    <td className="py-2 font-medium text-gray-900">{item.product.nameEn}</td>
                    <td className="py-2 text-gray-600">{item.product.sku}</td>
                    <td className="py-2 text-gray-600">
                      {item.product.factory?.name ?? '—'}
                    </td>
                    <td className="py-2">
                      {itemsEditable ? (
                        <input
                          type="number"
                          min={1}
                          value={editingQty[item.id] ?? item.quantity}
                          onChange={(e) => setEditingQty((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          onBlur={() => {
                            const raw = editingQty[item.id];
                            setEditingQty((prev) => {
                              const next = { ...prev };
                              delete next[item.id];
                              return next;
                            });
                            const v = parseInt(String(raw ?? item.quantity), 10);
                            const final = Number.isNaN(v) || v < 1 ? 1 : v;
                            if (final !== item.quantity) {
                              updateItemMutation.mutate({ itemId: item.id, quantity: final });
                            }
                          }}
                          className="h-8 w-14 rounded border border-gray-300 px-2 text-center text-sm font-semibold text-[#DC2626] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
                        />
                      ) : (
                        <span className="font-semibold text-gray-900">{item.quantity}</span>
                      )}
                    </td>
                    {itemsEditable && (
                      <td className="py-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                          onClick={() => {
                            if (confirm('Remove this item from the order?')) {
                              removeItemMutation.mutate(item.id);
                            }
                          }}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-500">No items</p>
        )}
      </Card>

      {/* Costs panel */}
      {hasPermission(Permission.VIEW_COSTS) && (
        <Card
          title="Costs"
          footer={
            hasPermission(Permission.EDIT_COSTS) ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditingCostId(null);
                  costForm.reset({
                    costType: CostType.FACTORY,
                    amount: 0,
                    currency: Currency.SAR,
                  });
                  setCostModalOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Add cost
              </Button>
            ) : undefined
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="pb-2 font-medium">Type</th>
                  <th className="pb-2 font-medium">Amount</th>
                  <th className="pb-2 font-medium">Currency</th>
                  {hasPermission(Permission.EDIT_COSTS) && (
                    <th className="pb-2 font-medium"></th>
                  )}
                </tr>
              </thead>
              <tbody>
                {costList.map((cost) => (
                  <tr key={cost.id} className="border-b border-gray-100">
                    <td className="py-2">{cost.costType.replace(/_/g, ' ')}</td>
                    <td className="py-2">{cost.amount.toFixed(2)}</td>
                    <td className="py-2">{cost.currency}</td>
                    {hasPermission(Permission.EDIT_COSTS) && (
                      <td className="py-2">
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setEditingCostId(cost.id);
                              costForm.reset({
                                costType: cost.costType as CostType,
                                amount: cost.amount,
                                currency: cost.currency as Currency,
                              });
                              setCostModalOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600"
                            onClick={() => deleteCostMutation.mutate(cost.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td className="py-2">Total</td>
                  <td className="py-2">{totalCost.toFixed(2)}</td>
                  <td className="py-2">—</td>
                  {hasPermission(Permission.EDIT_COSTS) && <td></td>}
                </tr>
                {sellingPrice > 0 && (
                  <tr className="font-medium">
                    <td className="py-2">Profit</td>
                    <td className="py-2">{profit.toFixed(2)}</td>
                    <td className="py-2">—</td>
                    {hasPermission(Permission.EDIT_COSTS) && <td></td>}
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* Status history */}
      <Card title="Status history">
        {order.statusHistory.length === 0 ? (
          <p className="text-sm text-gray-500">No status changes yet</p>
        ) : (
          <ul className="space-y-3">
            {order.statusHistory.map((h) => (
              <li
                key={h.id}
                className="border-b border-gray-100 pb-3 last:border-0 last:pb-0"
              >
                <p className="text-sm font-medium text-gray-900">
                  {h.oldStatus.replace(/_/g, ' ')} → {h.newStatus.replace(/_/g, ' ')}
                </p>
                <p className="text-xs text-gray-500">
                  {format(new Date(h.changedAt), 'MMM d, yyyy HH:mm')} by{' '}
                  {h.changer.name}
                </p>
                {h.note && (
                  <p className="mt-1 text-sm text-gray-600">{h.note}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Internal notes - last section */}
      <Card title="Internal notes">
        <NotesForm
          internalNotes={order.internalNotes}
          onSave={notesMutation.mutate}
          isPending={notesMutation.isPending}
        />
      </Card>

      {/* Factory sheet button */}
      <Link href={`/orders/${id}/factory-sheet`}>
        <Button variant="secondary" size="md">
          View Factory Sheet
        </Button>
      </Link>

      {/* Status change modal */}
      <Modal
        isOpen={statusModalOpen}
        onClose={() => {
          setStatusModalOpen(false);
          setSelectedStatusForChange(null);
        }}
        title="Confirm status change"
      >
        <form onSubmit={onStatusSubmit} className="space-y-4">
          <p className="text-sm text-gray-600">
            Change status to{' '}
            <strong>{(selectedStatusForChange ?? nextStatus)?.replace(/_/g, ' ')}</strong>?
          </p>
          <Input
            label="Note (optional)"
            {...statusChangeForm.register('note')}
            error={statusChangeForm.formState.errors.note?.message}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setStatusModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={statusMutation.isPending}
            >
              Confirm
            </Button>
          </div>
        </form>
      </Modal>

      {/* Cost modal */}
      <Modal
        isOpen={costModalOpen}
        onClose={() => {
          setCostModalOpen(false);
          setEditingCostId(null);
        }}
        title={editingCostId ? 'Edit cost' : 'Add cost'}
      >
        <form onSubmit={onCostSubmit} className="space-y-4">
          <Select
            label="Cost type"
            options={costTypeOptions}
            {...costForm.register('costType')}
          />
          <Input
            label="Amount"
            type="number"
            step="0.01"
            {...costForm.register('amount')}
            error={costForm.formState.errors.amount?.message}
          />
          <Select
            label="Currency"
            options={currencyOptions}
            {...costForm.register('currency')}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCostModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={addCostMutation.isPending || updateCostMutation.isPending}
            >
              {editingCostId ? 'Edit' : 'Add'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* File link modal */}
      <Modal
        isOpen={fileModalOpen}
        onClose={() => setFileModalOpen(false)}
        title="Add file link"
      >
        <form onSubmit={onFileSubmit} className="space-y-4">
          <Select
            label="File type"
            options={fileTypeOptions}
            {...fileForm.register('fileType')}
          />
          <Input
            label="File name"
            {...fileForm.register('fileName')}
            error={fileForm.formState.errors.fileName?.message}
          />
          <Input
            label="File URL"
            {...fileForm.register('fileUrl')}
            error={fileForm.formState.errors.fileUrl?.message}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setFileModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={addFileMutation.isPending}
            >
              Add
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add item modal */}
      <Modal
        isOpen={addItemOpen}
        onClose={() => setAddItemOpen(false)}
        title="Add product to order"
      >
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search products by name or SKU..."
              value={addItemSearch}
              onChange={(e) => setAddItemSearch(e.target.value)}
              className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
              autoFocus
            />
          </div>
          <div className="max-h-[300px] space-y-1 overflow-y-auto">
            {(searchProducts?.data ?? []).map((p) => {
              const alreadyInOrder = order?.items?.some((i) => i.productId === p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    addItemMutation.mutate({ productId: p.id, quantity: 1 });
                    setAddItemOpen(false);
                  }}
                  disabled={addItemMutation.isPending}
                  className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{p.nameEn}</p>
                    <p className="text-xs text-gray-500">{p.sku}</p>
                  </div>
                  {alreadyInOrder && (
                    <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      In order
                    </span>
                  )}
                </button>
              );
            })}
            {addItemSearch && (searchProducts?.data ?? []).length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400">No products found</p>
            )}
          </div>
        </div>
      </Modal>
    </div>
  );
}

function ShippingForm({
  shippingCompany,
  trackingNumber,
  trackingUrl,
  onSave,
  isPending,
}: {
  shippingCompany: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  onSave: (dto: {
    shippingCompany?: string | null;
    trackingNumber?: string | null;
    trackingUrl?: string | null;
  }) => void;
  isPending: boolean;
}) {
  const [company, setCompany] = useState(shippingCompany ?? '');
  const [tracking, setTracking] = useState(trackingNumber ?? '');
  const [url, setUrl] = useState(trackingUrl ?? '');
  const [editing, setEditing] = useState(false);

  // Only a field the user actually changed goes in the payload, and a field
  // they emptied is sent as an explicit `null` (not omitted) so it actually
  // clears server-side instead of leaving the old value in place. If nothing
  // changed, the payload is empty and the mutation never fires — the server
  // now rejects an empty update, and firing it anyway just produced a
  // misleading error toast for a no-op save.
  const diff = (current: string, original: string | null): string | null | undefined => {
    const trimmed = current.trim();
    if (trimmed === (original ?? '')) return undefined;
    return trimmed === '' ? null : trimmed;
  };

  const handleSave = () => {
    const dto: {
      shippingCompany?: string | null;
      trackingNumber?: string | null;
      trackingUrl?: string | null;
    } = {};
    const companyDiff = diff(company, shippingCompany);
    const trackingDiff = diff(tracking, trackingNumber);
    const urlDiff = diff(url, trackingUrl);
    if (companyDiff !== undefined) dto.shippingCompany = companyDiff;
    if (trackingDiff !== undefined) dto.trackingNumber = trackingDiff;
    if (urlDiff !== undefined) dto.trackingUrl = urlDiff;

    setEditing(false);
    if (Object.keys(dto).length === 0) return;
    onSave(dto);
  };

  return (
    <div className="space-y-2">
      {!editing ? (
        <>
          <p className="text-sm text-gray-900">{company || '—'}</p>
          <p className="text-sm text-gray-500">{tracking || '—'}</p>
          {trackingUrl && (
            <a
              href={trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-[#DC2626] hover:underline"
            >
              Track
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
            className="mt-2"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </>
      ) : (
        <>
          <Input
            label="Company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
          <Input
            label="Tracking number"
            value={tracking}
            onChange={(e) => setTracking(e.target.value)}
          />
          <Input
            label="Tracking URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={isPending}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function NotesForm({
  internalNotes,
  onSave,
  isPending,
}: {
  internalNotes: string | null;
  onSave: (internalNotes: string) => void;
  isPending: boolean;
}) {
  const [notes, setNotes] = useState(internalNotes ?? '');
  const [editing, setEditing] = useState(false);

  const handleSave = () => {
    onSave(notes);
    setEditing(false);
  };

  return (
    <div className="space-y-2">
      {!editing ? (
        <>
          <p className="whitespace-pre-wrap text-sm text-gray-700">
            {notes || 'No notes'}
          </p>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
        </>
      ) : (
        <>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#DC2626] focus:ring-2 focus:ring-[#DC2626] focus:ring-offset-1"
            rows={4}
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={isPending}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
