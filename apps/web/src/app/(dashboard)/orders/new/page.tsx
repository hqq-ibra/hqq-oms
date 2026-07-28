'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import {
  Button,
  Input,
  Select,
  SearchableSelect,
  type SelectOption,
  type SearchableSelectOption,
} from '@/components/ui';
import { useToast } from '@/components/ui';
import { OrderType } from '@/lib/types';
import { computeQuotationTotals } from '@/lib/quotation-totals';
import { format } from 'date-fns';
import { ChevronLeft, ChevronRight, Search, Plus, Minus, X, FileText } from 'lucide-react';

const THERMOFORMING_MACHINES: SelectOption[] = [
  { value: 'MV', label: 'MultiVac' },
  { value: 'HI', label: 'Hilutec' },
  { value: 'SM', label: 'SmartMacIv' },
  { value: 'UT', label: 'Utien' },
  { value: 'VV', label: 'ViviVac' },
  { value: 'GE', label: 'GEA' },
  { value: 'SP', label: 'Sealpack' },
  { value: 'BP', label: 'BetaPack' },
  { value: 'UL', label: 'Ulma' },
];

const THERMOFORMING_CAPACITIES: SelectOption[] = [
  { value: '2K', label: '2K' }, { value: '4K', label: '4K' },
  { value: '6K', label: '6K' }, { value: '8K', label: '8K' },
  { value: '10K', label: '10K' }, { value: '12K', label: '12K' },
];

const THERMOFORMING_GRAMS: SelectOption[] = [
  { value: '1000', label: '1000g' }, { value: '500', label: '500g' },
  { value: '250', label: '250g' }, { value: '50S', label: '50S' },
  { value: '50L', label: '50L' }, { value: '30', label: '30g' },
];

interface Category {
  id: string;
  name: string;
  skuPrefix: string;
  subcategories: { id: string; name: string; skuCode: string }[];
}

interface ProductFile {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
}

const STEPS = [
  { id: 1, label: 'Customer & Products' },
  { id: 2, label: 'Quotation' },
  { id: 3, label: 'Details & Submit' },
];

const step1Schema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
});

const step2Schema = z.object({
  expectedDeliveryDate: z.string().optional(),
  assignedUserId: z.string().optional(),
  internalNotes: z.string().optional(),
});

type Step1Values = z.infer<typeof step1Schema>;
type Step2Values = z.infer<typeof step2Schema>;

interface Customer {
  id: string;
  customerCode: string;
  name: string;
}

interface Product {
  id: string;
  sku: string;
  nameEn: string;
  factoryId: string;
  factory?: { id: string; name: string };
  _count?: { files: number };
  requiresLineSpecs: boolean;
}

interface User {
  id: string;
  name: string;
}

interface CustomersResponse {
  data: Customer[];
}

interface ProductsResponse {
  data: Product[];
}

interface UsersResponse {
  data: User[];
}

interface OrderLine {
  lineId: string;
  productId: string;
  productName: string;
  requiresLineSpecs: boolean;
  quantity: number;
  unitPrice: number | null;
  unitLabel: string;
  description: string;
  specs: Record<string, string>;
}

export default function NewOrderPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [step, setStep] = useState(1);
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const [pCategoryId, setPCategoryId] = useState('');
  const [pSubcategoryId, setPSubcategoryId] = useState('');
  const [pMachine, setPMachine] = useState('');
  const [pCapacity, setPCapacity] = useState('');
  const [pGrams, setPGrams] = useState('');
  const [pPattern, setPPattern] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [orderItems, setOrderItems] = useState<OrderLine[]>([]);
  const [itemsError, setItemsError] = useState('');
  const [discountAmount, setDiscountAmount] = useState(0);
  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatPercent, setVatPercent] = useState(15);
  const [validUntil, setValidUntil] = useState('');
  const [payMethod, setPayMethod] = useState('نقداً / تحويل بنكي');
  const [quoteNotes, setQuoteNotes] = useState('');
  const [viewFilesProductId, setViewFilesProductId] = useState<string | null>(null);

  const step1Form = useForm<Step1Values>({
    resolver: zodResolver(step1Schema),
    defaultValues: {
      customerId: '',
    },
  });

  const step2Form = useForm<Step2Values>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      expectedDeliveryDate: '',
      assignedUserId: '',
      internalNotes: '',
    },
  });

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customers', 'search', customerSearch],
    queryFn: () =>
      api.get<CustomersResponse>('/api/v1/customers', {
        search: customerSearch,
        pageSize: '20',
      }),
    enabled: step === 1,
  });

  const { data: productsData, isLoading: productsLoading } = useQuery({
    queryKey: ['products', 'order-search', productSearch, pCategoryId, pSubcategoryId, pMachine, pCapacity, pGrams, pPattern],
    queryFn: () => {
      const params: Record<string, string> = { search: productSearch, pageSize: '200' };
      if (pCategoryId) params.categoryId = pCategoryId;
      if (pSubcategoryId) params.subcategoryId = pSubcategoryId;
      if (pMachine) params.specMachine = pMachine;
      if (pCapacity) params.specCapacity = pCapacity;
      if (pGrams) params.specGrams = pGrams;
      if (pPattern) params.specPattern = pPattern;
      return api.get<ProductsResponse>('/api/v1/products', params);
    },
    placeholderData: (prev) => prev,
    enabled: step === 1,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => api.get<Category[]>('/api/v1/products/categories'),
  });

  const filterCategory = categories.find((c) => c.id === pCategoryId);
  const filterSubs = filterCategory?.subcategories ?? [];
  const isFilterThermoforming = filterSubs.find((s) => s.id === pSubcategoryId)?.skuCode === 'THF';

  const { data: specOptions } = useQuery({
    queryKey: ['spec-options-order', pCategoryId, pSubcategoryId, pMachine, pCapacity, pGrams, pPattern],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (pCategoryId) params.categoryId = pCategoryId;
      if (pSubcategoryId) params.subcategoryId = pSubcategoryId;
      if (pMachine) params.specMachine = pMachine;
      if (pCapacity) params.specCapacity = pCapacity;
      if (pGrams) params.specGrams = pGrams;
      if (pPattern) params.specPattern = pPattern;
      return api.get<{ machines: string[]; capacities: string[]; grams: string[]; patterns: string[] }>('/api/v1/products/spec-options', params);
    },
    enabled: isFilterThermoforming,
  });

  const watchedCustomerId = step1Form.watch('customerId');
  const { data: linkedProducts = [] } = useQuery({
    queryKey: ['customer-products', watchedCustomerId],
    queryFn: () =>
      api.get<Product[]>(`/api/v1/customers/${watchedCustomerId}/products`),
    enabled: !!watchedCustomerId,
  });

  const { data: viewFiles = [] } = useQuery({
    queryKey: ['product-files', viewFilesProductId],
    queryFn: () =>
      api.get<ProductFile[]>(`/api/v1/products/${viewFilesProductId}/files`),
    enabled: !!viewFilesProductId,
  });

  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: () =>
      api.get<UsersResponse>('/api/v1/users', { pageSize: '100' }),
    enabled: step === 3,
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<{ id: string }>('/api/v1/orders', payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      addToast('Order created successfully', 'success');
      router.push(`/orders/${(data as { id: string }).id}/quotation`);
    },
    onError: (err: Error) => {
      addToast(err.message || 'Failed to create order', 'error');
    },
  });

  const customers = customersData?.data ?? [];
  const products = productsData?.data ?? [];
  const users = usersData?.data ?? [];

  const customerOptions: SearchableSelectOption[] = customers.map((c) => ({
    value: c.id,
    label: c.name,
    sublabel: c.customerCode,
  }));

  const userOptions: SelectOption[] = [
    { value: '', label: 'None' },
    ...users.map((u) => ({ value: u.id, label: u.name })),
  ];

  const filteredProducts = products;

  const handleCustomerSelect = (value: string) => {
    step1Form.setValue('customerId', value);
    const c = customers.find((x) => x.id === value);
    setSelectedCustomer(c ?? null);
  };

  const addItem = (product: Product) => {
    setItemsError('');
    setOrderItems((prev) => {
      // Ordinary products merge into one line; a mold is a new design each time.
      if (!product.requiresLineSpecs) {
        const existing = prev.find((i) => i.productId === product.id);
        if (existing) {
          return prev.map((i) =>
            i.lineId === existing.lineId ? { ...i, quantity: i.quantity + 1 } : i,
          );
        }
      }
      return [
        ...prev,
        {
          lineId: crypto.randomUUID(),
          productId: product.id,
          productName: product.nameEn,
          requiresLineSpecs: product.requiresLineSpecs,
          quantity: 1,
          unitPrice: null,
          unitLabel: 'عدد',
          description: product.nameEn,
          specs: {},
        },
      ];
    });
  };

  const updateLine = (lineId: string, patch: Partial<OrderLine>) => {
    setOrderItems((prev) =>
      prev.map((i) => (i.lineId === lineId ? { ...i, ...patch } : i)),
    );
  };

  const updateSpec = (lineId: string, key: string, value: string) => {
    setOrderItems((prev) =>
      prev.map((i) =>
        i.lineId === lineId ? { ...i, specs: { ...i.specs, [key]: value } } : i,
      ),
    );
  };

  const updateQuantity = (productId: string, delta: number) => {
    setOrderItems((prev) =>
      prev
        .map((i) =>
          i.productId === productId && !i.requiresLineSpecs
            ? { ...i, quantity: Math.max(0, i.quantity + delta) }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  };

  // The grid's corner "X" is keyed by productId, but a mold placeholder can
  // occupy several independently-configured lines under one productId — a
  // naive filter-by-productId would silently wipe every design in one click.
  // Mirrors updateQuantity's existing no-op for the same reason: a mold line
  // is only ever removed individually in Step 2, where its specs are visible.
  const removeItem = (productId: string) => {
    setOrderItems((prev) => {
      if (prev.some((i) => i.productId === productId && i.requiresLineSpecs)) {
        return prev;
      }
      return prev.filter((i) => i.productId !== productId);
    });
  };

  const removeLine = (lineId: string) => {
    setOrderItems((prev) => prev.filter((i) => i.lineId !== lineId));
  };

  /** Total quantity of a product across its lines — drives the grid badge. */
  const getQuantity = (productId: string) =>
    orderItems
      .filter((i) => i.productId === productId)
      .reduce((sum, i) => sum + i.quantity, 0);

  const handleFileClick = async (product: Product) => {
    const count = product._count?.files ?? 0;
    if (count === 1) {
      const files = await api.get<ProductFile[]>(`/api/v1/products/${product.id}/files`);
      if (files.length === 1) {
        const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        const url = files[0].fileUrl.startsWith('http') ? files[0].fileUrl : `${apiBase}${files[0].fileUrl}`;
        window.open(url, '_blank');
        return;
      }
    }
    setViewFilesProductId(viewFilesProductId === product.id ? null : product.id);
  };

  const onStep1Submit = () => {
    if (orderItems.length === 0) {
      setItemsError('Please add at least one product');
      return;
    }
    setStep(2);
  };

  const handleSubmit = () => {
    const s1 = step1Form.getValues();
    const s2 = step2Form.getValues();
    createMutation.mutate({
      orderType: OrderType.NEW_MOLD,
      customerId: s1.customerId,
      items: orderItems.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        unitLabel: i.unitLabel,
        description: i.description,
        specs: i.requiresLineSpecs ? i.specs : null,
      })),
      expectedDeliveryDate: s2.expectedDeliveryDate
        ? new Date(s2.expectedDeliveryDate).toISOString()
        : undefined,
      assignedUserId: s2.assignedUserId || undefined,
      internalNotes: s2.internalNotes || undefined,
      quotation: {
        validUntil: validUntil || undefined,
        payMethod,
        notes: quoteNotes || undefined,
        discountAmount,
        vatEnabled,
        vatPercent,
      },
    });
  };

  const totals = computeQuotationTotals({
    lines: orderItems.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice })),
    discountAmount,
    vatEnabled,
    vatPercent,
  });

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">New Order</h1>

      {/* Step indicator */}
      <div className="flex items-center justify-between">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex flex-1 items-center">
            <div className="flex flex-col items-center">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors ${
                  step >= s.id
                    ? 'border-[#DC2626] bg-[#DC2626] text-white'
                    : 'border-gray-300 bg-white text-gray-500'
                }`}
              >
                {s.id}
              </div>
              <span className="mt-2 text-xs font-medium text-gray-600">
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`mx-2 h-0.5 flex-1 ${
                  step > s.id ? 'bg-[#DC2626]' : 'bg-gray-200'
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <form
          onSubmit={step1Form.handleSubmit(onStep1Submit)}
          className="space-y-6"
        >
          <SearchableSelect
            label="Customer"
            placeholder="Search customers..."
            value={step1Form.watch('customerId')}
            onChange={handleCustomerSelect}
            options={customerOptions}
            onSearch={setCustomerSearch}
            searchValue={customerSearch}
            onSearchChange={setCustomerSearch}
            loading={customersLoading}
            error={step1Form.formState.errors.customerId?.message}
            renderOption={(opt) => (
              <span>
                <span className="font-medium text-gray-500">{opt.sublabel}</span>
                {' — '}
                {opt.label}
              </span>
            )}
          />

          {/* Products Section */}
          <div>
            <p className="mb-3 text-sm font-medium text-gray-700">Products</p>

            {/* Selected summary bar */}
            {orderItems.length > 0 && (
              <div className="mb-3 flex items-center justify-between rounded-lg bg-red-50 border border-red-200 px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[#DC2626] px-2 text-xs font-bold text-white">
                    {orderItems.length}
                  </span>
                  <span className="text-sm font-medium text-gray-700">
                    {orderItems.length === 1 ? 'product' : 'products'} selected
                    ({orderItems.reduce((sum, i) => sum + i.quantity, 0)} total qty)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOrderItems([])}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Product Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search products by name or SKU..."
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-300 py-2.5 pl-10 pr-3 text-sm focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
              />
            </div>

            {/* Product Filters */}
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <select
                value={pCategoryId}
                onChange={(e) => { setPCategoryId(e.target.value); setPSubcategoryId(''); setPMachine(''); setPCapacity(''); setPGrams(''); setPPattern(''); }}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-[#DC2626] focus:outline-none"
              >
                <option value="">All Categories</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {pCategoryId && filterSubs.length > 0 && (
                <select
                  value={pSubcategoryId}
                  onChange={(e) => { setPSubcategoryId(e.target.value); setPMachine(''); setPCapacity(''); setPGrams(''); setPPattern(''); }}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-[#DC2626] focus:outline-none"
                >
                  <option value="">All Subcategories</option>
                  {filterSubs.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
              {isFilterThermoforming && (
                <>
                  <select
                    value={pMachine}
                    onChange={(e) => setPMachine(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-[#DC2626] focus:outline-none"
                  >
                    <option value="">Machine</option>
                    {(specOptions?.machines ?? []).map((m) => {
                      const label = THERMOFORMING_MACHINES.find((x) => x.value === m)?.label ?? m;
                      return <option key={m} value={m}>{label}</option>;
                    })}
                  </select>
                  <select
                    value={pCapacity}
                    onChange={(e) => setPCapacity(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-[#DC2626] focus:outline-none"
                  >
                    <option value="">Capacity</option>
                    {(specOptions?.capacities ?? []).map((c) => {
                      const label = THERMOFORMING_CAPACITIES.find((x) => x.value === c)?.label ?? c;
                      return <option key={c} value={c}>{label}</option>;
                    })}
                  </select>
                  <select
                    value={pGrams}
                    onChange={(e) => setPGrams(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-[#DC2626] focus:outline-none"
                  >
                    <option value="">Grams</option>
                    {(specOptions?.grams ?? []).map((g) => {
                      const label = THERMOFORMING_GRAMS.find((x) => x.value === g)?.label ?? g;
                      return <option key={g} value={g}>{label}</option>;
                    })}
                  </select>
                  <select
                    value={pPattern}
                    onChange={(e) => setPPattern(e.target.value)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs focus:border-[#DC2626] focus:outline-none"
                  >
                    <option value="">Pattern</option>
                    {(specOptions?.patterns ?? []).map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </>
              )}
              {(pCategoryId || pSubcategoryId || pMachine || pCapacity || pGrams || pPattern) && (
                <button
                  type="button"
                  onClick={() => { setPCategoryId(''); setPSubcategoryId(''); setPMachine(''); setPCapacity(''); setPGrams(''); setPPattern(''); }}
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
                >
                  Clear filters
                </button>
              )}
            </div>

            {/* Product Grid */}
            <div className="max-h-[400px] overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3">
              {/* Suggested Products (linked to customer) */}
              {linkedProducts.length > 0 && (
                <div className="mb-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-green-600">
                    Suggested — Previously ordered ({linkedProducts.length})
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {linkedProducts.map((product) => {
                      const qty = getQuantity(product.id);
                      const isSelected = qty > 0;
                      const fileCount = product._count?.files ?? 0;
                      return (
                        <div
                          key={product.id}
                          className={`relative flex flex-col rounded-lg border-2 p-3 transition-all ${
                            isSelected
                              ? 'border-[#DC2626] bg-red-50 shadow-sm'
                              : 'border-green-200 bg-green-50'
                          }`}
                        >
                          {isSelected && (
                            <button
                              type="button"
                              onClick={() => removeItem(product.id)}
                              title={product.requiresLineSpecs ? 'Remove each design individually in the Quotation step' : 'Remove'}
                              className="absolute -right-1.5 -top-1.5 rounded-full bg-red-100 p-0.5 text-red-600 hover:bg-red-200"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                          {fileCount > 0 && (
                            <button
                              type="button"
                              onClick={() => handleFileClick(product)}
                              className="absolute left-1 top-1 rounded bg-gray-100 p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                              title="View files"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => (product.requiresLineSpecs || !isSelected) && addItem(product)}
                            className={`flex flex-col items-center text-center ${!isSelected ? 'cursor-pointer' : 'cursor-default'}`}
                          >
                            <span className="text-sm font-medium text-gray-900 line-clamp-2">
                              {product.nameEn}
                            </span>
                            <span className="mt-0.5 text-xs text-gray-500">{product.sku}</span>
                          </button>
                          {viewFilesProductId === product.id && viewFiles.length > 0 && (
                            <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2">
                              <div className="flex flex-col gap-1">
                                {viewFiles.map((f) => {
                                  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
                                  const url = f.fileUrl.startsWith('http') ? f.fileUrl : `${apiBase}${f.fileUrl}`;
                                  return (
                                    <a key={f.id} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">
                                      <FileText className="h-3 w-3 shrink-0" />
                                      <span className="truncate">{f.fileName}</span>
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {isSelected && (
                            <div className="mt-2 flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => updateQuantity(product.id, -1)}
                                className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="min-w-[20px] text-center text-sm font-bold text-[#DC2626]">{qty}</span>
                              <button
                                type="button"
                                onClick={() => updateQuantity(product.id, 1)}
                                className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* All Products */}
              {productsLoading ? (
                <div className="flex items-center justify-center py-8 text-sm text-gray-400">
                  Loading products...
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex items-center justify-center py-8 text-sm text-gray-400">
                  No products found
                </div>
              ) : (
                <>
                  {linkedProducts.length > 0 && (
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                      All Products
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {filteredProducts
                      .filter((p) => !linkedProducts.some((lp) => lp.id === p.id))
                      .map((product) => {
                      const qty = getQuantity(product.id);
                      const isSelected = qty > 0;
                      const fileCount = product._count?.files ?? 0;
                      return (
                        <div
                          key={product.id}
                          className={`relative flex flex-col rounded-lg border-2 p-3 transition-all ${
                            isSelected
                              ? 'border-[#DC2626] bg-red-50 shadow-sm'
                              : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                          }`}
                        >
                          {isSelected && (
                            <button
                              type="button"
                              onClick={() => removeItem(product.id)}
                              title={product.requiresLineSpecs ? 'Remove each design individually in the Quotation step' : 'Remove'}
                              className="absolute -right-1.5 -top-1.5 rounded-full bg-red-100 p-0.5 text-red-600 hover:bg-red-200"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                          {fileCount > 0 && (
                            <button
                              type="button"
                              onClick={() => handleFileClick(product)}
                              className="absolute left-1 top-1 rounded bg-gray-100 p-1 text-gray-500 hover:bg-gray-200 hover:text-gray-700"
                              title="View files"
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => (product.requiresLineSpecs || !isSelected) && addItem(product)}
                            className={`flex flex-col items-center text-center ${!isSelected ? 'cursor-pointer' : 'cursor-default'}`}
                          >
                            <span className="text-sm font-medium text-gray-900 line-clamp-2">
                              {product.nameEn}
                            </span>
                            <span className="mt-0.5 text-xs text-gray-500">{product.sku}</span>
                          </button>
                          {viewFilesProductId === product.id && viewFiles.length > 0 && (
                            <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2">
                              <div className="flex flex-col gap-1">
                                {viewFiles.map((f) => {
                                  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
                                  const url = f.fileUrl.startsWith('http') ? f.fileUrl : `${apiBase}${f.fileUrl}`;
                                  return (
                                    <a key={f.id} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-blue-600 hover:bg-blue-50">
                                      <FileText className="h-3 w-3 shrink-0" />
                                      <span className="truncate">{f.fileName}</span>
                                    </a>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                          {isSelected && (
                            <div className="mt-2 flex items-center justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => updateQuantity(product.id, -1)}
                                className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                              >
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="min-w-[20px] text-center text-sm font-bold text-[#DC2626]">{qty}</span>
                              <button
                                type="button"
                                onClick={() => updateQuantity(product.id, 1)}
                                className="flex h-6 w-6 items-center justify-center rounded border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                              >
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {itemsError && (
              <p className="mt-1 text-sm text-red-600">{itemsError}</p>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary">
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </form>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 text-white">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Description</th>
                  <th className="w-24 px-3 py-2 font-semibold">Qty</th>
                  <th className="w-28 px-3 py-2 font-semibold">Unit</th>
                  <th className="w-32 px-3 py-2 font-semibold">Price</th>
                  <th className="w-32 px-3 py-2 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item, index) => (
                  <tr key={item.lineId} className="border-b border-gray-100 align-top">
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateLine(item.lineId, { description: e.target.value })}
                        className="w-full rounded border border-gray-200 px-2 py-1.5 focus:border-[#DC2626] focus:outline-none"
                      />
                      {item.requiresLineSpecs && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <select
                            value={item.specs.machine ?? ''}
                            onChange={(e) => updateSpec(item.lineId, 'machine', e.target.value)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          >
                            <option value="">Machine…</option>
                            {THERMOFORMING_MACHINES.map((m) => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                          <select
                            value={item.specs.capacity ?? ''}
                            onChange={(e) => updateSpec(item.lineId, 'capacity', e.target.value)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          >
                            <option value="">Capacity…</option>
                            {THERMOFORMING_CAPACITIES.map((c) => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                          <select
                            value={item.specs.grams ?? ''}
                            onChange={(e) => updateSpec(item.lineId, 'grams', e.target.value)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          >
                            <option value="">Grams…</option>
                            {THERMOFORMING_GRAMS.map((g) => (
                              <option key={g.value} value={g.value}>{g.label}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={item.specs.pattern ?? ''}
                            onChange={(e) => updateSpec(item.lineId, 'pattern', e.target.value)}
                            placeholder="Pattern"
                            className="w-28 rounded border border-gray-300 px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => removeLine(item.lineId)}
                            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateLine(item.lineId, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-full rounded border border-gray-200 px-2 py-1.5 text-center focus:border-[#DC2626] focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={item.unitLabel}
                        onChange={(e) => updateLine(item.lineId, { unitLabel: e.target.value })}
                        className="w-full rounded border border-gray-200 px-2 py-1.5 text-center focus:border-[#DC2626] focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unitPrice ?? ''}
                        onChange={(e) => updateLine(item.lineId, { unitPrice: e.target.value === '' ? null : Number(e.target.value) })}
                        className="w-full rounded border border-gray-200 px-2 py-1.5 text-center focus:border-[#DC2626] focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 text-center font-bold text-[#DC2626]">
                      {totals.lineTotals[index].toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Valid until"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
            <Input
              label="Payment terms"
              type="text"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between py-1 text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-semibold">{totals.subtotal.toFixed(2)} SAR</span>
            </div>
            <div className="flex items-center justify-between py-1 text-sm">
              <span className="text-gray-500">Discount (SAR)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                className="w-28 rounded border border-gray-300 px-2 py-1 text-center"
              />
            </div>
            <div className="flex items-center justify-between py-1 text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-gray-500">
                <input
                  type="checkbox"
                  checked={vatEnabled}
                  onChange={(e) => setVatEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                VAT %
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={vatPercent}
                onChange={(e) => setVatPercent(Number(e.target.value) || 0)}
                disabled={!vatEnabled}
                className="w-28 rounded border border-gray-300 px-2 py-1 text-center disabled:bg-gray-100"
              />
            </div>
            <div className="mt-3 flex items-center justify-between rounded bg-[#DC2626] px-3 py-2 text-white">
              <span className="font-bold">Grand total</span>
              <span className="text-lg font-extrabold">{totals.grandTotal.toFixed(2)} SAR</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Quotation notes (visible to the customer)
            </label>
            <textarea
              value={quoteNotes}
              onChange={(e) => setQuoteNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              placeholder="Any additional terms or remarks..."
            />
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <Button type="button" variant="primary" onClick={() => setStep(3)}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
            <Input
              label="Expected delivery date"
              type="date"
              {...step2Form.register('expectedDeliveryDate')}
            />
            <Select
              label="Assign user"
              options={userOptions}
              placeholder="Select user (optional)"
              {...step2Form.register('assignedUserId')}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Internal notes
              </label>
              <textarea
                {...step2Form.register('internalNotes')}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
                placeholder="Optional notes..."
              />
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-6">
            <h3 className="mb-4 font-semibold text-gray-900">Summary</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Customer</dt>
                <dd className="font-medium">
                  {selectedCustomer
                    ? `${selectedCustomer.customerCode} - ${selectedCustomer.name}`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">
                  Items ({orderItems.length})
                </dt>
                <dd>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {orderItems.map((item) => (
                      <div
                        key={item.lineId}
                        className="flex flex-col items-center rounded-lg border border-gray-200 bg-gray-50 p-3 min-w-[100px]"
                      >
                        <span className="text-sm font-medium text-gray-900 text-center">
                          {item.description}
                        </span>
                        <span className="mt-1 inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[#DC2626] px-2 text-xs font-bold text-white">
                          {item.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Expected delivery</dt>
                <dd className="font-medium">
                  {step2Form.getValues('expectedDeliveryDate')
                    ? format(
                        new Date(step2Form.getValues('expectedDeliveryDate')!),
                        'MMM d, yyyy',
                      )
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Assigned user</dt>
                <dd className="font-medium">
                  {step2Form.getValues('assignedUserId')
                    ? users.find(
                        (u) => u.id === step2Form.getValues('assignedUserId'),
                      )?.name ?? '—'
                    : '—'}
                </dd>
              </div>
              {step2Form.getValues('internalNotes') && (
                <div>
                  <dt className="text-gray-500">Internal notes</dt>
                  <dd className="font-medium">
                    {step2Form.getValues('internalNotes')}
                  </dd>
                </div>
              )}
            </dl>
          </div>
          <div className="flex justify-between">
            <Button variant="secondary" onClick={() => setStep(2)}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <Button
              variant="primary"
              onClick={handleSubmit}
              loading={createMutation.isPending}
            >
              Submit Order
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
