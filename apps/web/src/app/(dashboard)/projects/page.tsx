'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { api } from '@/lib/api';
import {
  Button,
  DataTable,
  Pagination,
  SearchInput,
  SearchableSelect,
  Select,
  Modal,
  Input,
  useToast,
  type DataTableColumn,
  type SelectOption,
} from '@/components/ui';
import { useSocketEvent } from '@/hooks/use-socket';
import { ProjectStatus, ProjectPriority } from '@/lib/types';
import { Plus, Building2, Briefcase, Copy, Trash2, X, Loader2 } from 'lucide-react';
import { formatDateRelative, cn } from '@/lib/utils';

interface ProjectRow {
  id: string;
  code: string;
  name: string;
  projectType: string;
  status: string;
  priority: string;
  tags: string[];
  owner?: { id: string; name: string };
  customer?: { id: string; name: string; customerCode: string } | null;
  currentStage?: { id: string; name: string; status: string } | null;
  _count?: { tasks: number };
  activities?: Array<{ createdAt: string; message: string }>;
}

interface CustomerOption {
  id: string;
  name: string;
  customerCode: string;
}

interface ProjectListResponse {
  data: ProjectRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const STATUS_OPTIONS: SelectOption[] = [
  { value: '', label: 'All Statuses' },
  ...Object.values(ProjectStatus).map((s) => ({
    value: s,
    label: s.replace(/_/g, ' '),
  })),
];

const PRIORITY_OPTIONS: SelectOption[] = [
  { value: '', label: 'All Priorities' },
  ...Object.values(ProjectPriority).map((p) => ({
    value: p,
    label: p,
  })),
];

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-green-100 text-green-800',
  ON_HOLD: 'bg-yellow-100 text-yellow-800',
  DONE: 'bg-blue-100 text-blue-800',
  CANCELLED: 'bg-red-100 text-red-800',
};

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-orange-100 text-orange-700',
  HIGH: 'bg-red-100 text-red-700',
};

const PROJECT_TYPE_OPTIONS: SelectOption[] = [
  { value: 'CLIENT', label: 'Client Project' },
  { value: 'INTERNAL', label: 'Internal Project' },
];

const createSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  projectType: z.enum(['CLIENT', 'INTERNAL']),
  customerId: z.string().optional(),
  summary: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  startDate: z.string().optional(),
  targetDate: z.string().optional(),
  tags: z.string().optional(),
}).refine(
  (d) => d.projectType !== 'CLIENT' || (d.customerId && d.customerId.length > 0),
  { message: 'Customer is required for client projects', path: ['customerId'] },
);
type CreateForm = z.infer<typeof createSchema>;

export default function ProjectsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === projects.length && projects.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(projects.map((p) => p.id)));
    }
  };

  const clearSelection = () => setSelectedIds(new Set());

  const duplicateMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await api.post(`/api/v1/projects/${id}/duplicate`, {});
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      clearSelection();
      addToast('Project(s) duplicated', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        await api.delete(`/api/v1/projects/${id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      clearSelection();
      setDeleteConfirmOpen(false);
      addToast('Project(s) deleted', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const filters: Record<string, string> = {
    ...(status && { status }),
    ...(priority && { priority }),
    ...(search && { search }),
    page: String(page),
    pageSize: '10',
  };

  const { data, isLoading } = useQuery({
    queryKey: ['projects', filters],
    queryFn: () => api.get<ProjectListResponse>('/api/v1/projects', filters),
  });

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  }, [queryClient]);

  useSocketEvent('project.updated', refetch, [refetch]);
  useSocketEvent('project.task.updated', refetch, [refetch]);

  const [customerSearch, setCustomerSearch] = useState('');

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customers-picker', customerSearch],
    queryFn: () =>
      api.get<{ data: CustomerOption[] }>('/api/v1/customers', {
        search: customerSearch,
        pageSize: '20',
      }),
  });

  const customerOptions = (customersData?.data ?? []).map((c) => ({
    value: c.id,
    label: c.name,
    sublabel: c.customerCode,
  }));

  const form = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
    defaultValues: { name: '', projectType: 'CLIENT', customerId: '', summary: '', priority: 'MEDIUM', tags: '' },
  });

  const watchProjectType = form.watch('projectType');

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<ProjectRow>('/api/v1/projects', body),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setCreateOpen(false);
      form.reset();
      addToast('Project created', 'success');
      router.push(`/projects/${project.id}`);
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const onSubmit = form.handleSubmit((data) => {
    const tags = data.tags
      ? data.tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];
    createMutation.mutate({
      name: data.name,
      projectType: data.projectType,
      customerId: data.projectType === 'CLIENT' ? data.customerId : undefined,
      summary: data.summary || undefined,
      priority: data.priority,
      startDate: data.startDate || undefined,
      targetDate: data.targetDate || undefined,
      tags,
    });
  });

  const projects = data?.data ?? [];
  const totalPages = data?.totalPages ?? 1;

  const columns: DataTableColumn<ProjectRow>[] = [
    {
      key: 'select',
      header: (
        <input
          type="checkbox"
          checked={selectedIds.size === projects.length && projects.length > 0}
          onChange={toggleAll}
          className="h-4 w-4 rounded border-gray-300 text-[#DC2626] focus:ring-[#DC2626] cursor-pointer"
        />
      ),
      className: 'w-10',
      render: (row) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.id)}
          onChange={() => toggleSelect(row.id)}
          onClick={(e) => e.stopPropagation()}
          className="h-4 w-4 rounded border-gray-300 text-[#DC2626] focus:ring-[#DC2626] cursor-pointer"
        />
      ),
    },
    { key: 'code', header: 'Code', className: 'w-32' },
    { key: 'name', header: 'Name' },
    {
      key: 'projectType',
      header: 'Type',
      render: (row) => (
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
          row.projectType === 'CLIENT'
            ? 'bg-blue-50 text-blue-700'
            : 'bg-purple-50 text-purple-700'
        }`}>
          {row.projectType === 'CLIENT' ? <Building2 className="h-3 w-3" /> : <Briefcase className="h-3 w-3" />}
          {row.projectType === 'CLIENT' ? 'Client' : 'Internal'}
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Client',
      render: (row) => row.customer?.name ?? <span className="text-gray-300">—</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status] ?? ''}`}>
          {row.status.replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      key: 'priority',
      header: 'Priority',
      render: (row) => (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_COLORS[row.priority] ?? ''}`}>
          {row.priority}
        </span>
      ),
    },
    {
      key: 'currentStage',
      header: 'Current Stage',
      render: (row) => row.currentStage?.name ?? '—',
    },
    {
      key: 'owner',
      header: 'Owner',
      render: (row) => row.owner?.name ?? '—',
    },
    {
      key: 'lastActivity',
      header: 'Last Activity',
      render: (row) => {
        const last = row.activities?.[0];
        return last ? (
          <span className="text-xs text-gray-500" title={last.message}>
            {formatDateRelative(last.createdAt)}
          </span>
        ) : (
          '—'
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <Button
          variant="primary"
          size="md"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 items-end gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            label="Status"
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          />
          <Select
            label="Priority"
            options={PRIORITY_OPTIONS}
            value={priority}
            onChange={(e) => { setPriority(e.target.value); setPage(1); }}
          />
          <div className="sm:col-span-2">
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setPage(1); }}
              placeholder="Search by name, code, or tag..."
            />
          </div>
        </div>
      </div>

      {/* Desktop table */}
      <div className="hidden md:block">
        <DataTable
          columns={columns}
          data={projects}
          loading={isLoading}
          emptyMessage="No projects found"
          onRowClick={(row) => router.push(`/projects/${row.id}`)}
        />
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-lg border border-gray-200 p-4">
              <div className="h-4 w-24 rounded bg-gray-200" />
              <div className="mt-2 h-4 w-40 rounded bg-gray-200" />
            </div>
          ))
        ) : projects.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-500">No projects found</p>
        ) : (
          projects.map((p) => (
            <div
              key={p.id}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-4 transition-colors hover:bg-gray-50',
                selectedIds.has(p.id) ? 'border-[#DC2626] bg-red-50/30' : 'border-gray-200',
              )}
            >
              <input
                type="checkbox"
                checked={selectedIds.has(p.id)}
                onChange={() => toggleSelect(p.id)}
                className="mt-1 h-4 w-4 shrink-0 rounded border-gray-300 text-[#DC2626] focus:ring-[#DC2626] cursor-pointer"
              />
              <button
                type="button"
                onClick={() => router.push(`/projects/${p.id}`)}
                className="min-w-0 flex-1 text-left"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-500">{p.code}</p>
                    <p className="font-medium text-gray-900">{p.name}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {p.currentStage?.name ?? '—'} &middot; {p.owner?.name}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[p.status]}`}>
                      {p.status.replace(/_/g, ' ')}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${PRIORITY_COLORS[p.priority]}`}>
                      {p.priority}
                    </span>
                  </div>
                </div>
              </button>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {/* Floating action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-5 py-3 shadow-2xl">
            <span className="text-sm font-semibold text-gray-700">
              {selectedIds.size} selected
            </span>
            <div className="h-5 w-px bg-gray-200" />
            <button
              type="button"
              onClick={() => duplicateMutation.mutate(Array.from(selectedIds))}
              disabled={duplicateMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50"
            >
              {duplicateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Copy className="h-4 w-4" />}
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => setDeleteConfirmOpen(true)}
              disabled={deleteMutation.isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-red-50 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50"
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Delete
            </button>
            <div className="h-5 w-px bg-gray-200" />
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Delete Projects"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to delete {selectedIds.size} project{selectedIds.size > 1 ? 's' : ''}? This action cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => deleteMutation.mutate(Array.from(selectedIds))}
              disabled={deleteMutation.isPending}
              className="!bg-red-600 hover:!bg-red-700"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Create project modal */}
      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New Project"
      >
        <form onSubmit={onSubmit} className="space-y-4">
          <Input
            label="Project Name"
            {...form.register('name')}
            error={form.formState.errors.name?.message}
          />

          {/* Project Type */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Project Type</label>
            <div className="grid grid-cols-2 gap-3">
              {PROJECT_TYPE_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border-2 p-3 transition-colors ${
                    watchProjectType === opt.value
                      ? 'border-[#DC2626] bg-red-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    value={opt.value}
                    {...form.register('projectType')}
                    className="sr-only"
                  />
                  {opt.value === 'CLIENT' ? (
                    <Building2 className={`h-5 w-5 ${watchProjectType === opt.value ? 'text-[#DC2626]' : 'text-gray-400'}`} />
                  ) : (
                    <Briefcase className={`h-5 w-5 ${watchProjectType === opt.value ? 'text-[#DC2626]' : 'text-gray-400'}`} />
                  )}
                  <span className={`text-sm font-medium ${watchProjectType === opt.value ? 'text-[#DC2626]' : 'text-gray-700'}`}>
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Customer picker (CLIENT only) */}
          {watchProjectType === 'CLIENT' && (
            <Controller
              name="customerId"
              control={form.control}
              render={({ field }) => (
                <SearchableSelect
                  label="Customer"
                  placeholder="Search customers..."
                  value={field.value ?? ''}
                  onChange={(val) => field.onChange(val)}
                  options={customerOptions}
                  onSearchChange={setCustomerSearch}
                  loading={customersLoading}
                  error={form.formState.errors.customerId?.message}
                  emptyMessage="No customers found"
                />
              )}
            />
          )}

          <Input
            label="Summary"
            {...form.register('summary')}
          />
          <Select
            label="Priority"
            options={PRIORITY_OPTIONS.filter((o) => o.value !== '')}
            {...form.register('priority')}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Start Date"
              type="date"
              {...form.register('startDate')}
            />
            <Input
              label="Target Date"
              type="date"
              {...form.register('targetDate')}
            />
          </div>
          <Input
            label="Tags (comma-separated)"
            {...form.register('tags')}
            placeholder="e.g. silicone, kitchen, mold"
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={createMutation.isPending}
            >
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
