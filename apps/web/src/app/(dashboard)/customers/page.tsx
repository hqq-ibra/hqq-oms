'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Button,
  Input,
  Select,
  SearchableSelect,
  SearchInput,
  DataTable,
  Pagination,
  Modal,
  type DataTableColumn,
  type SelectOption,
} from '@/components/ui';
import { useToast } from '@/components/ui';
import { Plus, MapPin, Trash2, Mail } from 'lucide-react';

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

interface CustomerRow {
  id: string;
  customerCode: string;
  name: string;
  type: string;
  city: string | null;
  googleMapsUrl: string | null;
  isActive: boolean;
  contacts: CustomerContact[];
}

interface CustomersResponse {
  data: CustomerRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

function ContactsCell({ customer }: { customer: CustomerRow }) {
  if (!customer.contacts?.length) {
    return <span className="text-gray-300">—</span>;
  }

  return (
    <div className="flex flex-col gap-2 py-1" onClick={(e) => e.stopPropagation()}>
      {customer.contacts.map((c) => {
        const digits = c.phone.replace(/[\s\-\+]/g, '');
        const gmailUrl = c.email
          ? `https://mail.google.com/mail/?view=cm&to=${encodeURIComponent(c.email)}`
          : null;
        return (
          <div key={c.id} className="flex items-center gap-2">
            <a
              href={`https://wa.me/${digits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#25D366]/10 transition-all hover:bg-[#25D366]/20 active:scale-95"
              title={`WhatsApp: ${c.phone}`}
            >
              <WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" />
            </a>
            {gmailUrl && (
              <a
                href={gmailUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 transition-all hover:bg-blue-100 active:scale-95"
                title={`Email: ${c.email}`}
              >
                <Mail className="h-3.5 w-3.5 text-blue-600" />
              </a>
            )}
            <div className="min-w-0">
              <span className="block truncate text-xs font-medium text-gray-700">{c.name}</span>
              <span className="block text-[10px] text-gray-400">{c.role}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function LocationCell({ customer }: { customer: CustomerRow }) {
  if (!customer.googleMapsUrl) return <span className="text-gray-300">—</span>;

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <a
        href={customer.googleMapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-50 transition-all hover:bg-red-100 active:scale-95"
        title="Google Maps"
      >
        <MapPin className="h-4 w-4 text-[#DC2626]" />
      </a>
    </div>
  );
}

export default function CustomersPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search, page, sortKey, sortOrder],
    queryFn: () =>
      api.get<CustomersResponse>('/api/v1/customers', {
        search,
        page: String(page),
        pageSize: '10',
        ...(sortKey ? { sortBy: sortKey, sortOrder } : {}),
      }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CustomerFormValues) =>
      api.post('/api/v1/customers', {
        ...payload,
        googleMapsUrl: payload.googleMapsUrl || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      addToast('Customer created successfully', 'success');
      setModalOpen(false);
      form.reset();
    },
    onError: (err: Error) => {
      addToast(err.message || 'Failed to create customer', 'error');
    },
  });

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      type: 'FACTORY',
      name: '',
      city: '',
      googleMapsUrl: '',
      notes: '',
      contacts: [{ name: '', role: '', phone: '', email: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'contacts',
  });

  const customers = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  const columns: DataTableColumn<CustomerRow>[] = [
    { key: 'name', header: 'Company Name', className: 'w-[28%]' },
    { key: 'type', header: 'Type', sortable: true, className: 'w-[12%]' },
    { key: 'city', header: 'City', sortable: true, className: 'w-[12%]', render: (r) => r.city ?? '—' },
    {
      key: 'googleMapsUrl',
      header: 'Location',
      className: 'w-[8%] text-center',
      render: (r) => <LocationCell customer={r} />,
    },
    {
      key: 'contacts',
      header: 'Contacts',
      className: 'w-[40%]',
      render: (r) => <ContactsCell customer={r} />,
    },
  ];

  const handleRowClick = (row: CustomerRow) => {
    router.push(`/customers/${row.id}`);
  };

  const handleAddClick = () => {
    form.reset({
      type: 'FACTORY',
      name: '',
      city: '',
      googleMapsUrl: '',
      notes: '',
      contacts: [{ name: '', role: '', phone: '', email: '' }],
    });
    setModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <Button variant="primary" size="md" onClick={handleAddClick}>
          <Plus className="h-4 w-4" />
          Add Customer
        </Button>
      </div>

      <SearchInput
        value={search}
        onChange={(v) => {
          setSearch(v);
          setPage(1);
        }}
        placeholder="Search customers..."
      />

      <DataTable
        columns={columns}
        data={customers}
        loading={isLoading}
        emptyMessage="No customers found"
        onRowClick={handleRowClick}
        sortKey={sortKey}
        sortOrder={sortOrder}
        onSort={(key, order) => {
          setSortKey(key);
          setSortOrder(order);
          setPage(1);
        }}
      />

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add Customer">
        <form
          onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
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
              onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={createMutation.isPending}>
              Add Customer
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
