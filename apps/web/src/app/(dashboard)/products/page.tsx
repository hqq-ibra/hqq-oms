'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  SearchInput,
  DataTable,
  Pagination,
  Modal,
  type DataTableColumn,
  type SelectOption,
} from '@/components/ui';
import { useToast } from '@/components/ui';
import { Plus, X, Users, Upload, FileText, ImageIcon, Trash2, FolderUp, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

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
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
  { value: '6K', label: '6K' },
  { value: '8K', label: '8K' },
  { value: '10K', label: '10K' },
  { value: '12K', label: '12K' },
];

const THERMOFORMING_GRAMS: SelectOption[] = [
  { value: '1000', label: '1000g' },
  { value: '500', label: '500g' },
  { value: '250', label: '250g' },
  { value: '50S', label: '50S' },
  { value: '50L', label: '50L' },
  { value: '30', label: '30g' },
];

const THERMOFORMING_PATTERNS: SelectOption[] = [
  '11','12','13','22','23','24','27','28',
  '32','33','34','35','36','37','38',
  '42','43','44','45','46','47','48',
  '53','54','63','64','65','66','68','75','A5',
].map((p) => {
  const x = p[0] === 'A' ? 10 : parseInt(p[0]);
  const y = parseInt(p[1]);
  return { value: p, label: `${p}  (${x}×${y} = ${x * y})` };
});

function generateThermoformingNames(
  machine: string,
  capacity: string,
  grams: string,
  pattern: string,
  drawing: string,
) {
  const machineLabel =
    THERMOFORMING_MACHINES.find((m) => m.value === machine.toUpperCase())?.label ?? machine;
  const gramsOpt = THERMOFORMING_GRAMS.find((g) => g.value === grams);
  const gramsLabel = gramsOpt?.label ?? (/^\d+$/.test(grams) ? `${grams}g` : grams);

  let nameEn = 'Thermoforming Silicon';
  if (machine) nameEn += ` (Machine: ${machineLabel})`;
  const enParts: string[] = [];
  if (capacity) enParts.push(`Capacity: ${capacity.toUpperCase()}g`);
  if (grams) enParts.push(`Filling Grams: ${gramsLabel}`);
  if (pattern) enParts.push(`Cavity Pattern: ${pattern}`);
  if (drawing) enParts.push(`Mold # ${drawing}`);
  if (enParts.length > 0) nameEn += ' ' + enParts.join(', ');

  let nameAr = 'سيليكون للتشكيل الحراري';
  if (machine) nameAr += ` (ماكينة: ${machineLabel})`;
  const arParts: string[] = [];
  if (capacity) {
    const capNum = capacity.toUpperCase().replace('K', '');
    arParts.push(`الطاقة الإنتاجية: ${capNum} كجم`);
  }
  if (grams) {
    const isNumeric = /^\d+$/.test(grams);
    arParts.push(`وزن التعبئة: ${isNumeric ? grams + ' جم' : grams}`);
  }
  if (pattern) arParts.push(`شكل التجاويف: ${pattern}`);
  if (drawing) arParts.push(`رقم القالب: ${drawing}`);
  if (arParts.length > 0) nameAr += ' – ' + arParts.join(' – ');

  return { nameEn, nameAr };
}

function parseThermoformingSku(sku: string) {
  const parts = sku.split('-');
  if (parts.length < 2 || parts[0].toUpperCase() !== 'THF') return null;
  const machine = parts[1] ?? '';
  const capacity = parts[2] ?? '';
  const grams = parts[3] ?? '';
  const pattern = parts[4] ?? '';
  const rawDrawing = parts[5] ?? '';
  const drawing = rawDrawing.replace(/^D/i, '').replace(/^0+/, '') || '0';
  return { machine, capacity, grams, pattern, drawing };
}

const productFormSchema = z.object({
  sku: z.string().min(1, 'SKU is required'),
  nameEn: z.string().min(1, 'Name (EN) is required'),
  nameAr: z.string().optional(),
  categoryId: z.string().min(1, 'Category is required'),
  subcategoryId: z.string().optional(),
  factoryId: z.string().optional(),
  notes: z.string().optional(),
  inventory: z.coerce.number().int().min(0).default(0),
  specMachine: z.string().optional(),
  specCapacity: z.string().optional(),
  specGrams: z.string().optional(),
  specPattern: z.string().optional(),
  specDrawing: z.string().optional(),
});

type ProductFormValues = z.infer<typeof productFormSchema>;

interface Factory {
  id: string;
  name: string;
}

interface Category {
  id: string;
  name: string;
  skuPrefix: string;
  subcategories: Subcategory[];
}

interface Subcategory {
  id: string;
  name: string;
  skuCode: string;
}

interface ThermoSpecs {
  machine?: string;
  capacity?: string;
  grams?: string;
  pattern?: string;
  drawing?: string;
}

interface ProductRow {
  id: string;
  sku: string;
  nameEn: string;
  nameAr: string | null;
  categoryId: string;
  subcategoryId: string | null;
  factoryId: string;
  specs: ThermoSpecs | null;
  inventory: number;
  category?: { id: string; name: string; skuPrefix: string };
  subcategory?: { id: string; name: string; skuCode: string } | null;
  factory?: { id: string; name: string };
}

interface ProductsResponse {
  data: ProductRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface FactoriesResponse {
  data: Factory[];
}

interface LinkedCustomer {
  id: string;
  name: string;
  customerCode: string;
  type: string;
  city: string | null;
}

interface CustomerOption {
  id: string;
  name: string;
  customerCode: string;
}

interface ProductFile {
  id: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  createdAt: string;
}

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filterCategoryId, setFilterCategoryId] = useState('');
  const [filterSubcategoryId, setFilterSubcategoryId] = useState('');
  const [filterMachine, setFilterMachine] = useState('');
  const [filterCapacity, setFilterCapacity] = useState('');
  const [filterGrams, setFilterGrams] = useState('');
  const [filterPattern, setFilterPattern] = useState('');
  const [filterUnlinked, setFilterUnlinked] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newSubOpen, setNewSubOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatPrefix, setNewCatPrefix] = useState('');
  const [newSubName, setNewSubName] = useState('');
  const [newSubCode, setNewSubCode] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);


  const [newSpecOpen, setNewSpecOpen] = useState(false);
  const [newSpecType, setNewSpecType] = useState<'machine' | 'capacity' | 'grams' | 'pattern'>('machine');
  const [newSpecLabel, setNewSpecLabel] = useState('');
  const [newSpecCode, setNewSpecCode] = useState('');
  const [editingSpecValue, setEditingSpecValue] = useState<string | null>(null);
  const [customMachines, setCustomMachines] = useState<SelectOption[]>([]);
  const [customCapacities, setCustomCapacities] = useState<SelectOption[]>([]);
  const [customGrams, setCustomGrams] = useState<SelectOption[]>([]);
  const [customPatterns, setCustomPatterns] = useState<SelectOption[]>([]);

  const [importOpen, setImportOpen] = useState(false);
  const [importCategoryId, setImportCategoryId] = useState('');
  const [importSubcategoryId, setImportSubcategoryId] = useState('');
  const [importFiles, setImportFiles] = useState<File[]>([]);
  const [importRunning, setImportRunning] = useState(false);
  const [importResults, setImportResults] = useState<{ name: string; status: 'pending' | 'success' | 'error'; message?: string }[]>([]);

  const { data, isLoading, isPlaceholderData } = useQuery({
    queryKey: ['products', search, page, filterCategoryId, filterSubcategoryId, filterMachine, filterCapacity, filterGrams, filterPattern, filterUnlinked],
    queryFn: () => {
      const params: Record<string, string> = {
        search,
        page: String(page),
        pageSize: '10',
      };
      if (filterCategoryId) params.categoryId = filterCategoryId;
      if (filterSubcategoryId) params.subcategoryId = filterSubcategoryId;
      if (filterMachine) params.specMachine = filterMachine;
      if (filterCapacity) params.specCapacity = filterCapacity;
      if (filterGrams) params.specGrams = filterGrams;
      if (filterPattern) params.specPattern = filterPattern;
      if (filterUnlinked) params.unlinked = 'true';
      return api.get<ProductsResponse>('/api/v1/products', params);
    },
    placeholderData: (prev) => prev,
  });

  const { data: factoriesData } = useQuery({
    queryKey: ['factories', 'all'],
    queryFn: () =>
      api.get<FactoriesResponse>('/api/v1/factories', { pageSize: '100' }),
  });

  const { data: categories = [], refetch: refetchCategories } = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => api.get<Category[]>('/api/v1/products/categories'),
  });

  const isFilterThermoforming = (() => {
    const cat = categories.find((c) => c.id === filterCategoryId);
    return cat?.subcategories.find((s) => s.id === filterSubcategoryId)?.skuCode === 'THF';
  })();

  const { data: specOptions } = useQuery({
    queryKey: ['spec-options', filterCategoryId, filterSubcategoryId, filterMachine, filterCapacity, filterGrams, filterPattern],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (filterCategoryId) params.categoryId = filterCategoryId;
      if (filterSubcategoryId) params.subcategoryId = filterSubcategoryId;
      if (filterMachine) params.specMachine = filterMachine;
      if (filterCapacity) params.specCapacity = filterCapacity;
      if (filterGrams) params.specGrams = filterGrams;
      if (filterPattern) params.specPattern = filterPattern;
      return api.get<{ machines: string[]; capacities: string[]; grams: string[]; patterns: string[] }>('/api/v1/products/spec-options', params);
    },
    enabled: isFilterThermoforming,
  });

  const { data: linkedCustomers = [], refetch: refetchLinkedCustomers } = useQuery({
    queryKey: ['product-customers', editingProduct?.id],
    queryFn: () => api.get<LinkedCustomer[]>(`/api/v1/products/${editingProduct!.id}/customers`),
    enabled: !!editingProduct,
  });

  const { data: allCustomersData } = useQuery({
    queryKey: ['customers-all'],
    queryFn: () => api.get<{ data: CustomerOption[] }>('/api/v1/customers', { pageSize: '500' }),
    enabled: addCustomerOpen,
  });

  const { data: productFiles = [], refetch: refetchFiles } = useQuery({
    queryKey: ['product-files', editingProduct?.id],
    queryFn: () => api.get<ProductFile[]>(`/api/v1/products/${editingProduct!.id}/files`),
    enabled: !!editingProduct,
  });

  const uploadFileMutation = useMutation({
    mutationFn: (formData: FormData) =>
      api.upload(`/api/v1/products/${editingProduct!.id}/files`, formData),
    onSuccess: () => {
      refetchFiles();
      addToast('File uploaded', 'success');
    },
    onError: (err: Error) => addToast(err.message || 'Upload failed', 'error'),
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId: string) =>
      api.delete(`/api/v1/products/${editingProduct!.id}/files/${fileId}`),
    onSuccess: () => {
      refetchFiles();
      addToast('File deleted', 'success');
    },
    onError: (err: Error) => addToast(err.message || 'Delete failed', 'error'),
  });

  const ACCEPTED_TYPES = /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/;

  const addFiles = useCallback((files: File[]) => {
    const valid = files.filter((f) => ACCEPTED_TYPES.test(f.type));
    if (valid.length === 0) {
      addToast('Only images (JPG, PNG, GIF, WebP) and PDF are allowed', 'error');
      return;
    }
    if (editingProduct) {
      valid.forEach((file) => {
        const formData = new FormData();
        formData.append('file', file);
        uploadFileMutation.mutate(formData);
      });
    } else {
      setPendingFiles((prev) => [...prev, ...valid]);
    }
  }, [editingProduct, uploadFileMutation, addToast]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) addFiles(files);
    e.target.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) addFiles(files);
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const handlePaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.items ?? []);
      const files = items
        .filter((item) => item.kind === 'file')
        .map((item) => item.getAsFile())
        .filter((f): f is File => f !== null);
      if (files.length > 0) {
        e.preventDefault();
        addFiles(files);
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [modalOpen, addFiles]);

  const createMutation = useMutation({
    mutationFn: (payload: ProductFormValues) =>
      api.post<ProductRow>('/api/v1/products', payload),
    onSuccess: async (created) => {
      if (pendingFiles.length > 0) {
        const uploads = pendingFiles.map((file) => {
          const formData = new FormData();
          formData.append('file', file);
          return api.upload(`/api/v1/products/${(created as ProductRow).id}/files`, formData);
        });
        try {
          await Promise.all(uploads);
        } catch {
          addToast('Some files failed to upload', 'error');
        }
        setPendingFiles([]);
      }
      queryClient.invalidateQueries({ queryKey: ['products'] });
      addToast('Product created successfully', 'success');
      setEditingProduct(created);
    },
    onError: (err: Error) => {
      addToast(err.message || 'Failed to create product', 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<ProductFormValues>;
    }) => api.patch(`/api/v1/products/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      addToast('Product updated successfully', 'success');
      setModalOpen(false);
      setEditingProduct(null);
      form.reset();
    },
    onError: (err: Error) => {
      addToast(err.message || 'Failed to update product', 'error');
    },
  });

  const linkCustomerMutation = useMutation({
    mutationFn: (customerId: string) =>
      api.post(`/api/v1/products/${editingProduct!.id}/customers`, { customerId }),
    onSuccess: () => {
      refetchLinkedCustomers();
      setSelectedCustomerId('');
      setAddCustomerOpen(false);
      addToast('Customer linked', 'success');
    },
    onError: (err: Error) => addToast(err.message || 'Failed', 'error'),
  });

  const unlinkCustomerMutation = useMutation({
    mutationFn: (customerId: string) =>
      api.delete(`/api/v1/products/${editingProduct!.id}/customers/${customerId}`),
    onSuccess: () => {
      refetchLinkedCustomers();
      addToast('Customer unlinked', 'success');
    },
    onError: (err: Error) => addToast(err.message || 'Failed', 'error'),
  });

  const createCategoryMutation = useMutation({
    mutationFn: (data: { name: string; skuPrefix: string }) =>
      api.post('/api/v1/products/categories', data),
    onSuccess: () => {
      refetchCategories();
      setNewCatOpen(false);
      setNewCatName('');
      setNewCatPrefix('');
      addToast('Category created', 'success');
    },
    onError: (err: Error) => addToast(err.message || 'Failed', 'error'),
  });

  const createSubcategoryMutation = useMutation({
    mutationFn: (data: { categoryId: string; name: string; skuCode: string }) =>
      api.post(`/api/v1/products/categories/${data.categoryId}/subcategories`, {
        name: data.name,
        skuCode: data.skuCode,
      }),
    onSuccess: () => {
      refetchCategories();
      setNewSubOpen(false);
      setNewSubName('');
      setNewSubCode('');
      addToast('Subcategory created', 'success');
    },
    onError: (err: Error) => addToast(err.message || 'Failed', 'error'),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (categoryId: string) =>
      api.delete(`/api/v1/products/categories/${categoryId}`),
    onSuccess: () => {
      refetchCategories();
      form.setValue('categoryId', '');
      form.setValue('subcategoryId', '');
      addToast('Category deleted', 'success');
    },
    onError: (err: Error) => addToast(err.message || 'Failed', 'error'),
  });

  const deleteSubcategoryMutation = useMutation({
    mutationFn: ({ categoryId, subcategoryId }: { categoryId: string; subcategoryId: string }) =>
      api.delete(`/api/v1/products/categories/${categoryId}/subcategories/${subcategoryId}`),
    onSuccess: () => {
      refetchCategories();
      form.setValue('subcategoryId', '');
      addToast('Subcategory deleted', 'success');
    },
    onError: (err: Error) => addToast(err.message || 'Failed', 'error'),
  });

  const factories = factoriesData?.data ?? [];
  const factoryOptions: SelectOption[] = factories.map((f) => ({
    value: f.id,
    label: f.name,
  }));

  const categoryOptions: SelectOption[] = categories.map((c) => ({
    value: c.id,
    label: c.name,
  }));

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      sku: '',
      nameEn: '',
      nameAr: '',
      categoryId: '',
      subcategoryId: '',
      factoryId: '',
      notes: '',
    },
  });

  const watchedCategoryId = form.watch('categoryId');
  const watchedSubcategoryId = form.watch('subcategoryId');
  const watchedMachine = form.watch('specMachine');
  const watchedCapacity = form.watch('specCapacity');
  const watchedGrams = form.watch('specGrams');
  const watchedPattern = form.watch('specPattern');
  const watchedDrawing = form.watch('specDrawing');

  const selectedCategory = categories.find((c) => c.id === watchedCategoryId);
  const selectedSubcategory = selectedCategory?.subcategories.find((s) => s.id === watchedSubcategoryId);
  const isThermoforming = selectedSubcategory?.skuCode === 'THF';
  const isSiliconThermoforming = isThermoforming && selectedCategory?.name?.toLowerCase() === 'silicon';

  const subcategoryOptions: SelectOption[] = (selectedCategory?.subcategories ?? []).map((s) => ({
    value: s.id,
    label: s.name,
  }));

  useEffect(() => {
    if (!watchedCategoryId || editingProduct) return;
    if (isThermoforming) {
      const parts = ['THF'];
      if (watchedMachine) parts.push(watchedMachine);
      if (watchedCapacity) parts.push(watchedCapacity);
      if (watchedGrams) parts.push(watchedGrams);
      if (watchedPattern) parts.push(watchedPattern);
      if (watchedDrawing) parts.push(`D${watchedDrawing.padStart(3, '0')}`);
      form.setValue('sku', parts.join('-'));
      return;
    }
    const fetchSku = async () => {
      try {
        const params: Record<string, string> = { categoryId: watchedCategoryId };
        if (watchedSubcategoryId) params.subcategoryId = watchedSubcategoryId;
        const res = await api.get<{ sku: string }>('/api/v1/products/suggest-sku', params);
        form.setValue('sku', res.sku);
      } catch {}
    };
    fetchSku();
  }, [watchedCategoryId, watchedSubcategoryId, isThermoforming, watchedMachine, watchedCapacity, watchedGrams, watchedPattern, watchedDrawing, editingProduct, form]);

  useEffect(() => {
    if (!isSiliconThermoforming || editingProduct) return;

    const { nameEn, nameAr } = generateThermoformingNames(
      watchedMachine ?? '', watchedCapacity ?? '', watchedGrams ?? '',
      watchedPattern ?? '', watchedDrawing ?? '',
    );

    form.setValue('nameEn', nameEn);
    form.setValue('nameAr', nameAr);
  }, [isSiliconThermoforming, watchedMachine, watchedCapacity, watchedGrams, watchedPattern, watchedDrawing, editingProduct, form]);

  const products = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;
  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const columns: DataTableColumn<ProductRow>[] = [
    { key: 'sku', header: 'SKU', className: 'w-[180px] whitespace-nowrap' },
    { key: 'nameEn', header: 'Name (EN)' },
    {
      key: 'category',
      header: 'Category',
      className: 'w-[15%]',
      render: (r) => (
        <div>
          <span className="text-sm text-gray-900">{r.category?.name ?? '—'}</span>
          {r.subcategory && (
            <span className="ml-1.5 inline-flex rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">
              {r.subcategory.name}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'inventory',
      header: 'Inventory',
      className: 'w-[90px] text-center',
      render: (r) => (
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
          r.inventory > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
        }`}>
          {r.inventory}
        </span>
      ),
    },
  ];

  const handleRowClick = (row: ProductRow) => {
    setEditingProduct(row);
    const specs = (row.specs ?? {}) as ThermoSpecs;
    form.reset({
      sku: row.sku,
      nameEn: row.nameEn,
      nameAr: row.nameAr ?? '',
      categoryId: row.categoryId,
      subcategoryId: row.subcategoryId ?? '',
      factoryId: row.factoryId,
      notes: '',
      inventory: row.inventory ?? 0,
      specMachine: specs.machine ?? '',
      specCapacity: specs.capacity ?? '',
      specGrams: specs.grams ?? '',
      specPattern: specs.pattern ?? '',
      specDrawing: specs.drawing ?? '',
    });
    setModalOpen(true);
  };

  const handleAddClick = () => {
    setEditingProduct(null);
    setPendingFiles([]);
    form.reset({
      sku: '',
      nameEn: '',
      nameAr: '',
      categoryId: '',
      subcategoryId: '',
      factoryId: '',
      notes: '',
      inventory: 0,
      specMachine: '',
      specCapacity: '',
      specGrams: '',
      specPattern: '',
      specDrawing: '',
    });
    setModalOpen(true);
  };

  const onSubmit = (values: ProductFormValues) => {
    const { specMachine, specCapacity, specGrams, specPattern, specDrawing, ...rest } = values;
    const specs = isThermoforming
      ? { machine: specMachine, capacity: specCapacity, grams: specGrams, pattern: specPattern, drawing: specDrawing }
      : undefined;
    const payload = {
      ...rest,
      subcategoryId: rest.subcategoryId || undefined,
      specs,
    };
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, payload: payload as any });
    } else {
      createMutation.mutate(payload as any);
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const importCategory = categories.find((c) => c.id === importCategoryId);
  const importSubcategoryOptions: SelectOption[] = (importCategory?.subcategories ?? []).map((s) => ({
    value: s.id,
    label: s.name,
  }));

  const handleImportFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) => f.type === 'application/pdf');
    if (files.length > 0) setImportFiles((prev) => [...prev, ...files]);
    e.target.value = '';
  };

  const runImport = async () => {
    if (importFiles.length === 0 || !importCategoryId) return;
    setImportRunning(true);
    const results: { name: string; status: 'pending' | 'success' | 'error'; message?: string }[] = importFiles.map((f) => ({ name: f.name, status: 'pending' as const }));
    setImportResults([...results]);

    const isSiliconImport = importCategory?.name?.toLowerCase() === 'silicon';
    const importSub = importCategory?.subcategories.find((s) => s.id === importSubcategoryId);
    const isThermoImport = isSiliconImport && importSub?.skuCode === 'THF';

    for (let i = 0; i < importFiles.length; i++) {
      const file = importFiles[i];
      const sku = file.name.replace(/\.pdf$/i, '');
      let nameEn = sku;
      let nameAr: string | undefined;
      let specs: Record<string, string> | undefined;

      if (isThermoImport) {
        const parsed = parseThermoformingSku(sku);
        if (parsed) {
          const names = generateThermoformingNames(
            parsed.machine, parsed.capacity, parsed.grams, parsed.pattern, parsed.drawing,
          );
          nameEn = names.nameEn;
          nameAr = names.nameAr;
          specs = {
            machine: parsed.machine.toUpperCase(),
            capacity: parsed.capacity.toUpperCase(),
            grams: parsed.grams,
            pattern: parsed.pattern,
            drawing: parsed.drawing,
          };
        }
      }

      try {
        const product = await api.post<ProductRow>('/api/v1/products', {
          sku,
          nameEn,
          nameAr,
          categoryId: importCategoryId,
          subcategoryId: importSubcategoryId || undefined,
          specs,
        });
        const formData = new FormData();
        formData.append('file', file);
        await api.upload(`/api/v1/products/${(product as ProductRow).id}/files`, formData);
        results[i] = { name: file.name, status: 'success' };
      } catch (err) {
        results[i] = { name: file.name, status: 'error', message: (err as Error).message || 'Failed' };
      }
      setImportResults([...results]);
    }

    setImportRunning(false);
    queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const resetImport = () => {
    setImportOpen(false);
    setImportFiles([]);
    setImportResults([]);
    setImportCategoryId('');
    setImportSubcategoryId('');
    setImportRunning(false);
  };

  const specLabels = { machine: 'Machine', capacity: 'Capacity', grams: 'Grams', pattern: 'Cavity Pattern' } as const;

  const openNewSpec = (type: 'machine' | 'capacity' | 'grams' | 'pattern') => {
    setNewSpecType(type);
    setNewSpecLabel('');
    setNewSpecCode('');
    setEditingSpecValue(null);
    setNewSpecOpen(true);
  };

  const openEditSpec = (type: 'machine' | 'capacity' | 'grams' | 'pattern', value: string, option: SelectOption) => {
    setNewSpecType(type);
    setNewSpecLabel(option.label);
    setNewSpecCode(value);
    setEditingSpecValue(value);
    setNewSpecOpen(true);
  };

  const customSetters = {
    machine: setCustomMachines,
    capacity: setCustomCapacities,
    grams: setCustomGrams,
    pattern: setCustomPatterns,
  };

  const formFields = { machine: 'specMachine', capacity: 'specCapacity', grams: 'specGrams', pattern: 'specPattern' } as const;

  const saveNewSpec = () => {
    if (!newSpecLabel.trim() || !newSpecCode.trim()) return;
    const opt: SelectOption = { value: newSpecCode.trim().toUpperCase(), label: newSpecLabel.trim() };
    const setter = customSetters[newSpecType];

    if (editingSpecValue) {
      setter((prev) => prev.map((o) => o.value === editingSpecValue ? opt : o));
      if (form.getValues(formFields[newSpecType]) === editingSpecValue) {
        form.setValue(formFields[newSpecType], opt.value);
      }
    } else {
      setter((prev) => [...prev, opt]);
      form.setValue(formFields[newSpecType], opt.value);
    }
    setNewSpecOpen(false);
    setEditingSpecValue(null);
  };

  const deleteSpec = (type: 'machine' | 'capacity' | 'grams' | 'pattern', value: string) => {
    customSetters[type]((prev) => prev.filter((o) => o.value !== value));
    if (form.getValues(formFields[type]) === value) {
      form.setValue(formFields[type], '');
    }
  };

  const allMachines = useMemo(() => [...THERMOFORMING_MACHINES, ...customMachines], [customMachines]);
  const allCapacities = useMemo(() => [...THERMOFORMING_CAPACITIES, ...customCapacities], [customCapacities]);
  const allGrams = useMemo(() => [...THERMOFORMING_GRAMS, ...customGrams], [customGrams]);
  const allPatterns = useMemo(() => [...THERMOFORMING_PATTERNS, ...customPatterns], [customPatterns]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          {data?.total != null && (
            <span className="rounded-full bg-gray-100 px-3 py-0.5 text-sm font-medium text-gray-600">
              {data.total}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="md" onClick={() => setImportOpen(true)}>
            <FolderUp className="h-4 w-4" />
            Import Products
          </Button>
          <Button variant="primary" size="md" onClick={handleAddClick}>
            <Plus className="h-4 w-4" />
            Add Product
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Search by name, SKU, or category..."
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterCategoryId}
              onChange={(e) => {
                setFilterCategoryId(e.target.value);
                setFilterSubcategoryId('');
                setFilterMachine('');
                setFilterCapacity('');
                setFilterGrams('');
                setFilterPattern('');
                setFilterUnlinked(false);
                setPage(1);
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
            >
              <option value="">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {filterCategoryId && (() => {
              const filterCat = categories.find((c) => c.id === filterCategoryId);
              const subs = filterCat?.subcategories ?? [];
              if (subs.length === 0) return null;
              return (
                <select
                  value={filterSubcategoryId}
                  onChange={(e) => {
                    setFilterSubcategoryId(e.target.value);
                    setFilterMachine('');
                    setFilterCapacity('');
                    setFilterGrams('');
                    setFilterPattern('');
                    setFilterUnlinked(false);
                    setPage(1);
                  }}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
                >
                  <option value="">All Subcategories</option>
                  {subs.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              );
            })()}
          </div>
        </div>

        {/* Thermoforming spec filters */}
        {isFilterThermoforming && specOptions && (
          <div className="flex flex-wrap gap-2">
            <select
              value={filterMachine}
              onChange={(e) => { setFilterMachine(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
            >
              <option value="">All Machines ({specOptions.machines.length})</option>
              {specOptions.machines.map((code) => {
                const label = THERMOFORMING_MACHINES.find((m) => m.value === code)?.label ?? code;
                return <option key={code} value={code}>{label}</option>;
              })}
            </select>
            <select
              value={filterCapacity}
              onChange={(e) => { setFilterCapacity(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
            >
              <option value="">All Capacities ({specOptions.capacities.length})</option>
              {specOptions.capacities.map((code) => {
                const label = THERMOFORMING_CAPACITIES.find((c) => c.value === code)?.label ?? code;
                return <option key={code} value={code}>{label}</option>;
              })}
            </select>
            <select
              value={filterGrams}
              onChange={(e) => { setFilterGrams(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
            >
              <option value="">All Grams ({specOptions.grams.length})</option>
              {specOptions.grams.map((code) => {
                const label = THERMOFORMING_GRAMS.find((g) => g.value === code)?.label ?? code;
                return <option key={code} value={code}>{label}</option>;
              })}
            </select>
            <select
              value={filterPattern}
              onChange={(e) => { setFilterPattern(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
            >
              <option value="">All Patterns ({specOptions.patterns.length})</option>
              {specOptions.patterns.map((code) => {
                const label = THERMOFORMING_PATTERNS.find((p) => p.value === code)?.label ?? code;
                return <option key={code} value={code}>{label}</option>;
              })}
            </select>
            <button
              type="button"
              onClick={() => { setFilterUnlinked(!filterUnlinked); setPage(1); }}
              className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                filterUnlinked
                  ? 'border-[#DC2626] bg-[#DC2626] text-white'
                  : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
              }`}
            >
              Unlinked Only
            </button>
          </div>
        )}
        {(filterCategoryId || filterSubcategoryId || filterMachine || filterCapacity || filterGrams || filterPattern || filterUnlinked) && (
          <button
            type="button"
            onClick={() => {
              setFilterCategoryId('');
              setFilterSubcategoryId('');
              setFilterMachine('');
              setFilterCapacity('');
              setFilterGrams('');
              setFilterPattern('');
              setFilterUnlinked(false);
              setPage(1);
            }}
            className="flex items-center gap-1 self-start rounded-lg px-3 py-1.5 text-xs font-medium text-[#DC2626] transition-colors hover:bg-red-50"
          >
            <X className="h-3.5 w-3.5" />
            Clear all filters
          </button>
        )}
      </div>

      <div className={isPlaceholderData ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
        <DataTable
          columns={columns}
          data={products}
          loading={isLoading && !isPlaceholderData}
          emptyMessage="No products found"
          onRowClick={handleRowClick}
        />
      </div>


      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={setPage}
        />
      )}

      {/* Add / Edit product modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingProduct(null);
          setPendingFiles([]);
        }}
        title={editingProduct ? 'Edit Product' : 'Add Product'}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          {/* Category */}
          <div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <SearchableSelect
                  label="Category"
                  placeholder="Select category"
                  options={categoryOptions}
                  value={watchedCategoryId}
                  onChange={(val) => {
                    form.setValue('categoryId', val, { shouldValidate: true });
                    form.setValue('subcategoryId', '');
                  }}
                  onDeleteOption={(val) => {
                    if (confirm('Delete this category?')) deleteCategoryMutation.mutate(val);
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => setNewCatOpen(true)}
                className="mb-0.5 rounded-lg border border-gray-300 p-2.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-[#DC2626]"
                title="Add new category"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {form.formState.errors.categoryId?.message && (
              <p className="mt-1 text-sm text-red-600">{form.formState.errors.categoryId.message}</p>
            )}
          </div>

          {/* Subcategory */}
          {selectedCategory && subcategoryOptions.length > 0 && (
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <SearchableSelect
                  label="Subcategory"
                  placeholder="Select subcategory (optional)"
                  options={subcategoryOptions}
                  value={watchedSubcategoryId ?? ''}
                  onChange={(val) => form.setValue('subcategoryId', val)}
                  onDeleteOption={(val) => {
                    if (confirm('Delete this subcategory?')) deleteSubcategoryMutation.mutate({ categoryId: watchedCategoryId, subcategoryId: val });
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => setNewSubOpen(true)}
                className="mb-0.5 rounded-lg border border-gray-300 p-2.5 text-gray-500 transition-colors hover:bg-gray-50 hover:text-[#DC2626]"
                title="Add new subcategory"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}
          {selectedCategory && subcategoryOptions.length === 0 && (
            <button
              type="button"
              onClick={() => setNewSubOpen(true)}
              className="flex items-center gap-1 text-xs font-medium text-[#DC2626] hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Add subcategory to {selectedCategory.name}
            </button>
          )}

          {/* Thermoforming specs */}
          {isThermoforming && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Thermoforming Specs</p>
              <div className="grid grid-cols-2 gap-3">
                <SearchableSelect
                  label="Machine"
                  placeholder="Select machine"
                  options={allMachines}
                  value={watchedMachine ?? ''}
                  onChange={(val) => form.setValue('specMachine', val)}
                  creatable
                  createLabel="Add machine"
                  onAddClick={() => openNewSpec('machine')}
                  onEditOption={(val, opt) => openEditSpec('machine', val, opt)}
                  onDeleteOption={(val) => deleteSpec('machine', val)}
                />
                <SearchableSelect
                  label="Capacity"
                  placeholder="Select capacity"
                  options={allCapacities}
                  value={watchedCapacity ?? ''}
                  onChange={(val) => form.setValue('specCapacity', val)}
                  creatable
                  createLabel="Add capacity"
                  onAddClick={() => openNewSpec('capacity')}
                  onEditOption={(val, opt) => openEditSpec('capacity', val, opt)}
                  onDeleteOption={(val) => deleteSpec('capacity', val)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <SearchableSelect
                  label="Grams"
                  placeholder="Select grams"
                  options={allGrams}
                  value={watchedGrams ?? ''}
                  onChange={(val) => form.setValue('specGrams', val)}
                  creatable
                  createLabel="Add grams"
                  onAddClick={() => openNewSpec('grams')}
                  onEditOption={(val, opt) => openEditSpec('grams', val, opt)}
                  onDeleteOption={(val) => deleteSpec('grams', val)}
                />
                <SearchableSelect
                  label="Cavity Pattern"
                  placeholder="e.g. 23 (2×3)"
                  options={allPatterns}
                  value={watchedPattern ?? ''}
                  onChange={(val) => form.setValue('specPattern', val)}
                  creatable
                  createLabel="Add pattern"
                  onAddClick={() => openNewSpec('pattern')}
                  onEditOption={(val, opt) => openEditSpec('pattern', val, opt)}
                  onDeleteOption={(val) => deleteSpec('pattern', val)}
                />
              </div>
              <Input
                label="HQQ Drawing #"
                placeholder="1-999"
                {...form.register('specDrawing')}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^\d]/g, '').slice(0, 3);
                  form.setValue('specDrawing', v);
                }}
              />
            </div>
          )}

          <Input
            label="SKU"
            error={form.formState.errors.sku?.message}
            {...form.register('sku')}
            disabled={!!editingProduct || isThermoforming}
          />
          <Input
            label="Name (EN)"
            error={form.formState.errors.nameEn?.message}
            {...form.register('nameEn')}
            disabled={isSiliconThermoforming && !editingProduct}
          />
          <Input
            label="Name (AR)"
            {...form.register('nameAr')}
            disabled={isSiliconThermoforming && !editingProduct}
          />
          <Select
            label="Vendor"
            options={factoryOptions}
            placeholder="Select vendor"
            error={form.formState.errors.factoryId?.message}
            {...form.register('factoryId')}
          />
          <Input
            label="Inventory"
            type="number"
            min={0}
            {...form.register('inventory', { valueAsNumber: true })}
            error={form.formState.errors.inventory?.message}
          />
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
              onClick={() => {
                setModalOpen(false);
                setEditingProduct(null);
                setPendingFiles([]);
              }}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isPending}>
              {editingProduct ? 'Save' : 'Add Product'}
            </Button>
          </div>
        </form>

        {/* Linked Customers section (edit mode only) */}
        {editingProduct && (
          <div className="mt-6 border-t border-gray-200 pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Linked Customers</h3>
              <button
                type="button"
                onClick={() => setAddCustomerOpen(true)}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[#DC2626] transition-colors hover:bg-red-50"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Customer
              </button>
            </div>
            {linkedCustomers.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-400">No customers linked</p>
            ) : (
              <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                {linkedCustomers.map((c) => (
                  <div key={c.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                      <Users className="h-3.5 w-3.5 text-gray-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900">{c.name}</p>
                      <p className="text-xs text-gray-500">{c.customerCode} · {c.type}{c.city ? ` · ${c.city}` : ''}</p>
                    </div>
                    <button
                      onClick={() => unlinkCustomerMutation.mutate(c.id)}
                      className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      title="Unlink customer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Files section */}
        <div className="mt-6 border-t border-gray-200 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Pictures</h3>
            {editingProduct && uploadFileMutation.isPending && (
              <span className="text-xs text-gray-400">Uploading...</span>
            )}
          </div>

          {/* Drop zone */}
          <div
            ref={dropZoneRef}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`relative mb-3 flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 transition-colors ${
              isDragging
                ? 'border-[#DC2626] bg-red-50'
                : 'border-gray-300 bg-gray-50 hover:border-gray-400'
            }`}
          >
            <Upload className={`mb-2 h-6 w-6 ${isDragging ? 'text-[#DC2626]' : 'text-gray-400'}`} />
            <p className="text-sm text-gray-500">
              {isDragging ? 'Drop files here' : 'Drag & drop files here, paste, or'}
            </p>
            {!isDragging && (
              <label className="mt-1 cursor-pointer text-sm font-medium text-[#DC2626] hover:underline">
                browse files
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                  multiple
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={editingProduct ? uploadFileMutation.isPending : false}
                />
              </label>
            )}
            <p className="mt-1 text-[10px] text-gray-400">PDF, JPG, PNG, GIF, WebP (max 10MB)</p>
          </div>

          {/* Pending files (create mode) */}
          {!editingProduct && pendingFiles.length > 0 && (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {pendingFiles.map((file, idx) => {
                const isPdf = file.type === 'application/pdf';
                const Icon = isPdf ? FileText : ImageIcon;
                return (
                  <div key={idx} className="flex items-center gap-3 px-3 py-2.5">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isPdf ? 'bg-red-50' : 'bg-blue-50'}`}>
                      <Icon className={`h-4 w-4 ${isPdf ? 'text-red-500' : 'text-blue-500'}`} />
                    </div>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPendingFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      title="Remove file"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Uploaded files (edit mode) */}
          {editingProduct && productFiles.length > 0 && (
            <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {productFiles.map((f) => {
                const isPdf = f.fileType === 'PDF';
                const Icon = isPdf ? FileText : ImageIcon;
                const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
                const fullUrl = f.fileUrl.startsWith('http') ? f.fileUrl : `${apiBase}${f.fileUrl}`;
                return (
                  <div key={f.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isPdf ? 'bg-red-50' : 'bg-blue-50'}`}>
                      <Icon className={`h-4 w-4 ${isPdf ? 'text-red-500' : 'text-blue-500'}`} />
                    </div>
                    <a
                      href={fullUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-w-0 flex-1 truncate text-sm font-medium text-[#DC2626] hover:underline"
                    >
                      {f.fileName}
                    </a>
                    <button
                      onClick={() => deleteFileMutation.mutate(f.id)}
                      className="rounded-lg p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      title="Delete file"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* Link customer modal */}
      <Modal
        isOpen={addCustomerOpen}
        onClose={() => { setAddCustomerOpen(false); setSelectedCustomerId(''); }}
        title="Link Customer to Product"
      >
        <div className="space-y-4">
          <SearchableSelect
            label="Customer"
            placeholder="Search customers..."
            options={
              (allCustomersData?.data ?? [])
                .filter((c) => !linkedCustomers.some((lc) => lc.id === c.id))
                .map((c) => ({
                  value: c.id,
                  label: `${c.name} (${c.customerCode})`,
                }))
            }
            value={selectedCustomerId}
            onChange={(val) => setSelectedCustomerId(val)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setAddCustomerOpen(false); setSelectedCustomerId(''); }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!selectedCustomerId}
              loading={linkCustomerMutation.isPending}
              onClick={() => selectedCustomerId && linkCustomerMutation.mutate(selectedCustomerId)}
            >
              Link
            </Button>
          </div>
        </div>
      </Modal>

      {/* New Category modal */}
      <Modal
        isOpen={newCatOpen}
        onClose={() => { setNewCatOpen(false); setNewCatName(''); setNewCatPrefix(''); }}
        title="New Category"
      >
        <div className="space-y-4">
          <Input
            label="Category Name"
            placeholder="e.g. Conveyor Belts"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
          />
          <Input
            label="SKU Prefix (3 letters)"
            placeholder="e.g. CVB"
            value={newCatPrefix}
            onChange={(e) => setNewCatPrefix(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))}
            maxLength={3}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setNewCatOpen(false); setNewCatName(''); setNewCatPrefix(''); }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!newCatName.trim() || newCatPrefix.length < 2}
              loading={createCategoryMutation.isPending}
              onClick={() => createCategoryMutation.mutate({ name: newCatName.trim(), skuPrefix: newCatPrefix })}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* New Subcategory modal */}
      <Modal
        isOpen={newSubOpen}
        onClose={() => { setNewSubOpen(false); setNewSubName(''); setNewSubCode(''); }}
        title={`New Subcategory — ${selectedCategory?.name ?? ''}`}
      >
        <div className="space-y-4">
          <Input
            label="Subcategory Name"
            placeholder="e.g. Oil Filter"
            value={newSubName}
            onChange={(e) => setNewSubName(e.target.value)}
          />
          <Input
            label="SKU Code (2-3 letters)"
            placeholder="e.g. OIL"
            value={newSubCode}
            onChange={(e) => setNewSubCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))}
            maxLength={3}
          />
          {selectedCategory && newSubCode && (
            <p className="text-xs text-gray-500">
              SKU preview: <span className="font-mono font-medium text-gray-700">{selectedCategory.skuPrefix}-{newSubCode}-001</span>
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setNewSubOpen(false); setNewSubName(''); setNewSubCode(''); }}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!newSubName.trim() || newSubCode.length < 2 || !watchedCategoryId}
              loading={createSubcategoryMutation.isPending}
              onClick={() => createSubcategoryMutation.mutate({ categoryId: watchedCategoryId, name: newSubName.trim(), skuCode: newSubCode })}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Import Products modal */}
      <Modal
        isOpen={importOpen}
        onClose={importRunning ? () => {} : resetImport}
        title="Import Products from PDFs"
      >
        <div className="space-y-4">
          {importResults.length === 0 ? (
            <>
              <SearchableSelect
                label="Category"
                placeholder="Select category"
                options={categoryOptions}
                value={importCategoryId}
                onChange={(val) => {
                  setImportCategoryId(val);
                  setImportSubcategoryId('');
                }}
              />
              {importCategory && importSubcategoryOptions.length > 0 && (
                <SearchableSelect
                  label="Subcategory (optional)"
                  placeholder="Select subcategory"
                  options={importSubcategoryOptions}
                  value={importSubcategoryId}
                  onChange={(val) => setImportSubcategoryId(val)}
                />
              )}

              <div>
                <p className="mb-1.5 text-sm font-medium text-gray-700">PDF Files</p>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-6 transition-colors hover:border-gray-400">
                  <FolderUp className="mb-2 h-6 w-6 text-gray-400" />
                  <span className="text-sm text-gray-500">Click to select PDF files</span>
                  <span className="mt-1 text-[10px] text-gray-400">Filenames will be used as SKU numbers</span>
                  <input
                    type="file"
                    accept=".pdf"
                    multiple
                    className="hidden"
                    onChange={handleImportFiles}
                  />
                </label>
              </div>

              {importFiles.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-500">
                    {importFiles.length} file{importFiles.length > 1 ? 's' : ''} selected
                  </p>
                  <div className="max-h-[200px] overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200">
                    {importFiles.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-3 px-3 py-2">
                        <FileText className="h-4 w-4 shrink-0 text-red-500" />
                        <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                          {file.name.replace(/\.pdf$/i, '')}
                        </span>
                        <span className="shrink-0 text-[10px] text-gray-400">
                          {(file.size / 1024).toFixed(0)} KB
                        </span>
                        <button
                          type="button"
                          onClick={() => setImportFiles((prev) => prev.filter((_, i) => i !== idx))}
                          className="shrink-0 rounded-lg p-1 text-gray-400 hover:bg-red-50 hover:text-red-500"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={resetImport}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={importFiles.length === 0 || !importCategoryId}
                  onClick={runImport}
                >
                  <FolderUp className="h-4 w-4" />
                  Import {importFiles.length > 0 ? `${importFiles.length} Products` : ''}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="max-h-[350px] overflow-y-auto divide-y divide-gray-100 rounded-lg border border-gray-200">
                {importResults.map((r, idx) => (
                  <div key={idx} className="flex items-center gap-3 px-3 py-2.5">
                    {r.status === 'pending' && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" />}
                    {r.status === 'success' && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />}
                    {r.status === 'error' && <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />}
                    <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                      {r.name.replace(/\.pdf$/i, '')}
                    </span>
                    {r.status === 'error' && (
                      <span className="shrink-0 text-xs text-red-500">{r.message}</span>
                    )}
                  </div>
                ))}
              </div>
              {!importRunning && (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-500">
                    {importResults.filter((r) => r.status === 'success').length} / {importResults.length} imported
                  </p>
                  <Button variant="primary" onClick={resetImport}>
                    Done
                  </Button>
                </div>
              )}
              {importRunning && (
                <p className="text-center text-sm text-gray-400">
                  Importing... {importResults.filter((r) => r.status !== 'pending').length} / {importResults.length}
                </p>
              )}
            </>
          )}
        </div>
      </Modal>

      {/* New Thermoforming Spec modal */}
      <Modal
        isOpen={newSpecOpen}
        onClose={() => setNewSpecOpen(false)}
        title={editingSpecValue ? `Edit ${specLabels[newSpecType]}` : `Add New ${specLabels[newSpecType]}`}
      >
        <div className="space-y-4">
          <Input
            label="Display Name"
            placeholder={
              newSpecType === 'machine' ? 'e.g. GEA' :
              newSpecType === 'capacity' ? 'e.g. 14K' :
              newSpecType === 'grams' ? 'e.g. 200g' : 'e.g. 55 (5×5)'
            }
            value={newSpecLabel}
            onChange={(e) => setNewSpecLabel(e.target.value)}
          />
          <Input
            label="SKU Shortform"
            placeholder={
              newSpecType === 'machine' ? 'e.g. GE (2 letters)' :
              newSpecType === 'capacity' ? 'e.g. 14K' :
              newSpecType === 'grams' ? 'e.g. 200' : 'e.g. 55'
            }
            value={newSpecCode}
            onChange={(e) => setNewSpecCode(e.target.value.toUpperCase())}
          />
          {newSpecCode && (
            <p className="text-xs text-gray-500">
              Will appear in SKU as: <span className="font-mono font-medium text-gray-700">THF-...-{newSpecCode.trim().toUpperCase()}-...</span>
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNewSpecOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!newSpecLabel.trim() || !newSpecCode.trim()}
              onClick={saveNewSpec}
            >
              {editingSpecValue ? 'Save' : `Add ${specLabels[newSpecType]}`}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
