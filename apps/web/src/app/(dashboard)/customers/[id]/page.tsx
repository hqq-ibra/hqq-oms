'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Button,
  Input,
  Select,
  SearchableSelect,
  Card,
  Modal,
  DataTable,
  type DataTableColumn,
  type SelectOption,
} from '@/components/ui';
import { useToast } from '@/components/ui';
import { format } from 'date-fns';
import { Pencil, ArrowLeft, Plus, Trash2, Mail, X, Package, FileText, ImageIcon, Loader2, ChevronDown } from 'lucide-react';

const CUSTOMER_TYPE_OPTIONS: SelectOption[] = [
  { value: 'FACTORY', label: 'Factory' },
  { value: 'RETAILER', label: 'Retailer' },
  { value: 'FREELANCER', label: 'Freelancer' },
];

const SAUDI_CITY_OPTIONS: SelectOption[] = [
  { value: 'الرياض', label: 'الرياض' },
  { value: 'الأحساء', label: 'الأحساء' },
  { value: 'الخرج', label: 'الخرج' },
  { value: 'بريدة', label: 'بريدة' },
  { value: 'عنيزة', label: 'عنيزة' },
  { value: 'الرس', label: 'الرس' },
  { value: 'حوطة بني تميم', label: 'حوطة بني تميم' },
  { value: 'السليل', label: 'السليل' },
  { value: 'المدينة المنورة', label: 'المدينة المنورة' },
  { value: 'جدة', label: 'جدة' },
  { value: 'مكة المكرمة', label: 'مكة المكرمة' },
  { value: 'الدمام', label: 'الدمام' },
  { value: 'الخبر', label: 'الخبر' },
  { value: 'الظهران', label: 'الظهران' },
  { value: 'الجبيل', label: 'الجبيل' },
  { value: 'تبوك', label: 'تبوك' },
  { value: 'أبها', label: 'أبها' },
  { value: 'خميس مشيط', label: 'خميس مشيط' },
  { value: 'الطائف', label: 'الطائف' },
  { value: 'حائل', label: 'حائل' },
  { value: 'نجران', label: 'نجران' },
  { value: 'جازان', label: 'جازان' },
  { value: 'ينبع', label: 'ينبع' },
  { value: 'القطيف', label: 'القطيف' },
  { value: 'الباحة', label: 'الباحة' },
  { value: 'عرعر', label: 'عرعر' },
  { value: 'سكاكا', label: 'سكاكا' },
  { value: 'القصيم', label: 'القصيم' },
];

const contactSchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
});

const customerFormSchema = z.object({
  type: z.string().min(1, 'Type is required'),
  name: z.string().min(1, 'Company name is required'),
  city: z.string().optional(),
  googleMapsUrl: z.string().url().optional().or(z.literal('')),
  notes: z.string().optional(),
  contacts: z.array(contactSchema),
});

type CustomerFormValues = z.infer<typeof customerFormSchema>;

interface CustomerContact {
  id: string;
  name: string;
  role: string;
  phone: string;
  email: string | null;
}

interface Customer {
  id: string;
  customerCode: string;
  name: string;
  type: string;
  city: string | null;
  googleMapsUrl: string | null;
  notes: string | null;
  isActive: boolean;
  contacts: CustomerContact[];
}

interface OrderRow {
  id: string;
  orderNumber: string | null;
  quoteNumber: string | null;
  status: string;
  expectedDeliveryDate: string | null;
  createdAt: string;
}

interface OrdersResponse {
  data: OrderRow[];
}

interface FilesResponse {
  data: { id: string; fileName: string; fileUrl: string; fileType: string }[];
}

interface LinkedProduct {
  id: string;
  sku: string;
  nameEn: string;
  nameAr: string | null;
  type: string;
  factory: { id: string; name: string } | null;
  linkedAt: string;
}

interface ProductOption {
  id: string;
  sku: string;
  nameEn: string;
  nameAr: string | null;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const id = params.id as string;
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  const { data: customer, isLoading, error } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => api.get<Customer>(`/api/v1/customers/${id}`),
    enabled: !!id,
  });

  const { data: ordersData } = useQuery({
    queryKey: ['orders', 'customer', id],
    queryFn: () =>
      api.get<OrdersResponse>('/api/v1/orders', {
        customerId: id,
        pageSize: '50',
      }),
    enabled: !!id,
  });

  const { data: filesData } = useQuery({
    queryKey: ['files', 'CUSTOMER', id],
    queryFn: () =>
      api.get<FilesResponse>('/api/v1/files', {
        entityType: 'CUSTOMER',
        entityId: id,
        pageSize: '50',
      }),
    enabled: !!id,
  });

  const { data: linkedProducts = [] } = useQuery({
    queryKey: ['customer-products', id],
    queryFn: () => api.get<LinkedProduct[]>(`/api/v1/customers/${id}/products`),
    enabled: !!id,
  });

  const { data: expandedProductFiles = [], isLoading: expandedFilesLoading } = useQuery({
    queryKey: ['product-files', expandedProductId],
    queryFn: () => api.get<{ id: string; fileName: string; fileUrl: string; fileType: string }[]>(`/api/v1/products/${expandedProductId!}/files`),
    enabled: !!expandedProductId,
  });

  const { data: allProductsData } = useQuery({
    queryKey: ['products-all'],
    queryFn: () => api.get<{ data: ProductOption[] }>('/api/v1/products', { pageSize: '500' }),
    enabled: addProductOpen,
  });

  const linkProductMutation = useMutation({
    mutationFn: (productId: string) =>
      api.post(`/api/v1/customers/${id}/products`, { productId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-products', id] });
      setSelectedProductId('');
      setAddProductOpen(false);
      addToast('Product linked', 'success');
    },
    onError: (err: Error) => addToast(err.message || 'Failed to link product', 'error'),
  });

  const unlinkProductMutation = useMutation({
    mutationFn: (productId: string) =>
      api.delete(`/api/v1/customers/${id}/products/${productId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-products', id] });
      addToast('Product unlinked', 'success');
    },
    onError: (err: Error) => addToast(err.message || 'Failed to unlink product', 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: CustomerFormValues) =>
      api.patch(`/api/v1/customers/${id}`, {
        ...payload,
        googleMapsUrl: payload.googleMapsUrl || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] });
      addToast('Customer updated successfully', 'success');
      setEditModalOpen(false);
    },
    onError: (err: Error) => {
      addToast(err.message || 'Failed to update customer', 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/v1/customers/${id}`),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['customer', id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      addToast('Customer deleted successfully', 'success');
      router.push('/customers');
    },
    onError: (err: Error) => {
      addToast(err.message || 'Failed to delete customer', 'error');
    },
  });

  const customerToFormValues = (c: Customer): CustomerFormValues => ({
    type: c.type,
    name: c.name,
    city: c.city ?? '',
    googleMapsUrl: c.googleMapsUrl ?? '',
    notes: c.notes ?? '',
    contacts: c.contacts.length > 0
      ? c.contacts.map((ct) => ({ name: ct.name, role: ct.role, phone: ct.phone, email: ct.email ?? '' }))
      : [{ name: '', role: '', phone: '', email: '' }],
  });

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    values: customer ? customerToFormValues(customer) : undefined,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'contacts',
  });

  const orders = ordersData?.data ?? [];
  const files = filesData?.data ?? [];

  const orderColumns: DataTableColumn<OrderRow>[] = [
    {
      key: 'orderNumber',
      header: 'Order #',
      render: (row) => row.orderNumber ?? row.quoteNumber ?? '—',
    },
    { key: 'status', header: 'Status' },
    {
      key: 'expectedDeliveryDate',
      header: 'Expected Delivery',
      render: (r) =>
        r.expectedDeliveryDate
          ? format(new Date(r.expectedDeliveryDate), 'MMM d, yyyy')
          : '—',
    },
    {
      key: 'createdAt',
      header: 'Created',
      render: (r) => format(new Date(r.createdAt), 'MMM d, yyyy'),
    },
  ];

  if (error) {
    return (
      <div className="space-y-6">
        <p className="text-red-600">Failed to load customer: {(error as Error).message}</p>
        <Button variant="secondary" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
      </div>
    );
  }

  if (isLoading || !customer) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-48 rounded bg-gray-200" />
        <div className="h-64 rounded-lg bg-gray-200" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/customers">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{customer.name}</h1>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            form.reset(customerToFormValues(customer));
            setEditModalOpen(true);
          }}>
          <Pencil className="h-4 w-4" />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDeleteConfirmOpen(true)}
          className="text-red-500 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </div>

      <Card title="Customer Information">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-gray-500">Customer Code</dt>
            <dd className="font-medium">{customer.customerCode}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Type</dt>
            <dd className="font-medium">{customer.type}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">City</dt>
            <dd className="font-medium">{customer.city ?? '—'}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Status</dt>
            <dd>
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                  customer.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}>
                {customer.isActive ? 'Active' : 'Inactive'}
              </span>
            </dd>
          </div>
          {customer.googleMapsUrl && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-gray-500">Google Maps</dt>
              <dd>
                <a
                  href={customer.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#DC2626] hover:underline">
                  {customer.googleMapsUrl}
                </a>
              </dd>
            </div>
          )}
          {customer.notes && (
            <div className="sm:col-span-2">
              <dt className="text-sm text-gray-500">Notes</dt>
              <dd className="font-medium">{customer.notes}</dd>
            </div>
          )}
        </dl>
      </Card>

      {customer.contacts.length > 0 && (
        <Card title="Contacts">
          <div className="divide-y divide-gray-100">
            {customer.contacts.map((c) => {
              const digits = c.phone.replace(/[\s\-\+]/g, '');
              const gmailUrl = c.email
                ? `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(c.email)}`
                : null;
              return (
                <div key={c.id} className="flex items-center gap-4 py-3">
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <a
                      href={`https://wa.me/${digits}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25D366]/10 transition-colors hover:bg-[#25D366]/20"
                      title={`WhatsApp: ${c.phone}`}
                    >
                      <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
                    </a>
                    {gmailUrl && (
                      <a
                        href={gmailUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50 transition-colors hover:bg-blue-100"
                        title={`Email: ${c.email}`}
                      >
                        <Mail className="h-5 w-5 text-blue-600" />
                      </a>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.role}</p>
                  </div>
                  <span className="text-sm text-gray-500" dir="ltr">{c.phone}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Card title={
        <div className="flex items-center justify-between">
          <span>Linked Products</span>
          <Button variant="ghost" size="sm" onClick={() => setAddProductOpen(true)} className="text-[#DC2626]">
            <Plus className="h-4 w-4" />
            Link Product
          </Button>
        </div>
      }>
        {linkedProducts.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            No products linked to this customer
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {linkedProducts.map((p) => {
              const isExpanded = expandedProductId === p.id;
              const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
              return (
                <div key={p.id}>
                  <div className="flex items-center gap-4 py-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                      <Package className="h-4 w-4 text-gray-500" />
                    </div>
                    <div
                      className="min-w-0 flex-1 cursor-pointer"
                      onClick={() => setExpandedProductId(isExpanded ? null : p.id)}
                    >
                      <p className="text-sm font-medium text-gray-900">{p.nameEn}</p>
                      <p className="text-xs text-gray-500">{p.sku}</p>
                    </div>
                    <button
                      onClick={() => setExpandedProductId(isExpanded ? null : p.id)}
                      className={`rounded-lg p-2 transition-colors ${
                        isExpanded
                          ? 'bg-[#DC2626] text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-[#DC2626] hover:text-white'
                      }`}
                      title="View files"
                    >
                      <FileText className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => unlinkProductMutation.mutate(p.id)}
                      className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      title="Unlink product"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="mb-3 ml-13 rounded-lg border border-gray-200 bg-gray-50">
                      {expandedFilesLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                        </div>
                      ) : expandedProductFiles.length === 0 ? (
                        <p className="py-4 text-center text-xs text-gray-400">No files attached</p>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {expandedProductFiles.map((f) => {
                            const isPdf = f.fileType === 'PDF';
                            const Icon = isPdf ? FileText : ImageIcon;
                            const fullUrl = f.fileUrl.startsWith('http') ? f.fileUrl : `${apiBase}${f.fileUrl}`;
                            return (
                              <a
                                key={f.id}
                                href={fullUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-white"
                              >
                                <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${isPdf ? 'bg-red-100' : 'bg-blue-100'}`}>
                                  <Icon className={`h-3.5 w-3.5 ${isPdf ? 'text-red-500' : 'text-blue-500'}`} />
                                </div>
                                <span className="min-w-0 flex-1 truncate font-medium text-[#DC2626]">
                                  {f.fileName}
                                </span>
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Related Orders">
        {orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            No orders for this customer
          </p>
        ) : (
          <DataTable
            columns={orderColumns}
            data={orders}
            onRowClick={(row) => router.push(`/orders/${row.id}`)}
          />
        )}
      </Card>

      <Card title="Files">
        {files.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            No files uploaded
          </p>
        ) : (
          <ul className="space-y-2">
            {files.map((f) => {
              const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
              const href = f.fileUrl.startsWith('http') ? f.fileUrl : `${apiBase}${f.fileUrl}`;
              return (
                <li key={f.id}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#DC2626] hover:underline">
                    {f.fileName} ({f.fileType})
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Modal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        title="Edit Customer">
        <form
          onSubmit={form.handleSubmit((values) => updateMutation.mutate(values))}
          className="space-y-4">
          <Select
            label="Type"
            options={CUSTOMER_TYPE_OPTIONS}
            error={form.formState.errors.type?.message}
            {...form.register('type')}
          />
          <Input
            label="Company Name"
            error={form.formState.errors.name?.message}
            {...form.register('name')}
          />
          <SearchableSelect
            label="City"
            placeholder="اختر المدينة"
            options={SAUDI_CITY_OPTIONS}
            value={form.watch('city') ?? ''}
            onChange={(val) => form.setValue('city', val, { shouldValidate: true })}
            creatable
            createLabel="إضافة مدينة"
          />
          <Input
            label="Google Maps URL"
            type="url"
            placeholder="https://..."
            {...form.register('googleMapsUrl')}
          />

          {/* Contacts */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">Contacts</label>
            {fields.map((field, index) => (
              <div key={field.id} className="rounded-lg border border-gray-200 bg-gray-50/50 p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="grid flex-1 grid-cols-2 gap-2">
                    <Input
                      placeholder="Name"
                      error={form.formState.errors.contacts?.[index]?.name?.message}
                      {...form.register(`contacts.${index}.name`)}
                    />
                    <Input
                      placeholder="Role"
                      error={form.formState.errors.contacts?.[index]?.role?.message}
                      {...form.register(`contacts.${index}.role`)}
                    />
                  </div>
                  {fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="mt-2 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="w-full">
                    <div className="flex h-10 w-full overflow-hidden rounded-lg border border-gray-300 bg-white transition-colors focus-within:ring-2 focus-within:ring-[#DC2626] focus-within:ring-offset-1 hover:border-gray-400">
                      <span className="flex items-center bg-gray-50 px-2.5 text-sm font-medium text-gray-500 select-none border-r border-gray-300">
                        +966
                      </span>
                      <input
                        type="tel"
                        dir="ltr"
                        placeholder="5XXXXXXXX"
                        className="w-full min-w-0 bg-transparent px-2.5 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none"
                        {...form.register(`contacts.${index}.phone`, {
                          setValueAs: (v: string) => {
                            const digits = v.replace(/[^\d]/g, '');
                            return digits ? `+966${digits}` : '';
                          },
                        })}
                        onChange={(e) => {
                          const raw = e.target.value.replace(/[^\d]/g, '');
                          e.target.value = raw;
                          form.register(`contacts.${index}.phone`).onChange(e);
                        }}
                        defaultValue={
                          form.getValues(`contacts.${index}.phone`)?.replace(/^\+966/, '') ?? ''
                        }
                      />
                    </div>
                    {form.formState.errors.contacts?.[index]?.phone?.message && (
                      <p className="mt-1.5 text-sm text-red-600" role="alert">
                        {form.formState.errors.contacts[index].phone.message}
                      </p>
                    )}
                  </div>
                  <Input
                    type="email"
                    placeholder="Email (optional)"
                    error={form.formState.errors.contacts?.[index]?.email?.message}
                    {...form.register(`contacts.${index}.email`)}
                  />
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={() => append({ name: '', role: '', phone: '', email: '' })}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#DC2626] transition-colors hover:bg-red-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Contact
            </button>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Notes
            </label>
            <textarea
              {...form.register('notes')}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setEditModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={updateMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete Customer"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete <span className="font-semibold text-gray-900">{customer.name}</span>? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              className="!bg-red-600 hover:!bg-red-700"
              loading={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={addProductOpen}
        onClose={() => { setAddProductOpen(false); setSelectedProductId(''); }}
        title="Link Product"
      >
        <div className="space-y-4">
          <SearchableSelect
            label="Product"
            placeholder="Search products..."
            options={
              (allProductsData?.data ?? [])
                .filter((p) => !linkedProducts.some((lp) => lp.id === p.id))
                .map((p) => ({
                  value: p.id,
                  label: `${p.nameEn}${p.nameAr ? ` - ${p.nameAr}` : ''} (${p.sku})`,
                }))
            }
            value={selectedProductId}
            onChange={(val) => setSelectedProductId(val)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setAddProductOpen(false); setSelectedProductId(''); }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!selectedProductId}
              loading={linkProductMutation.isPending}
              onClick={() => selectedProductId && linkProductMutation.mutate(selectedProductId)}
            >
              Link
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
