'use client';

import * as React from 'react';
import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import dynamic from 'next/dynamic';

const StageWorkspace = dynamic(() => import('./stage-workspace'), { ssr: false });
import {
  Button,
  Modal,
  SearchableSelect,
  useToast,
} from '@/components/ui';
import { useSocketEvent } from '@/hooks/use-socket';
import { cn } from '@/lib/utils';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Circle,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  XCircle,
  AlertTriangle,
  Building2,
  Briefcase,
} from 'lucide-react';

// ─── Types ───

interface StageData {
  id: string;
  name: string;
  stageKey: string;
  orderIndex: number;
  status: string;
  notes: string | null;
  startedAt: string | null;
  completedAt: string | null;
  tasks?: TaskData[];
  files?: FileData[];
}

interface TaskData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  completedAt: string | null;
  assignee: { id: string; name: string } | null;
  stage: { id: string; name: string } | null;
}

interface ContactData {
  id: string;
  name: string;
  company: string | null;
  country: string | null;
  capability: string | null;
  wechatId: string | null;
  contactPerson: string | null;
  contactPosition: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  location: string | null;
  lastContactAt: string | null;
  notes: string | null;
}

interface FileData {
  id: string;
  type: string;
  title: string;
  url: string;
  notes: string | null;
  stageId: string | null;
  uploadedBy: { id: string; name: string };
  stage?: { id: string; name: string } | null;
  createdAt: string;
}

interface PinnedItemData {
  id: string;
  projectId: string;
  itemType: string;
  itemId: string;
  pinnedLocation: string;
  createdAt: string;
}

interface ClientQuoteData {
  id: string;
  projectId: string;
  currency: string;
  quoteAmount: string | null;
  notes: string | null;
}

interface ClientDecisionData {
  id: string;
  projectId: string;
  status: string;
  decisionAt: string | null;
  notes: string | null;
  decidedBy: { id: string; name: string } | null;
}

interface ProjectDetail {
  id: string;
  code: string;
  name: string;
  projectType: string;
  customerId: string | null;
  customer: { id: string; name: string; customerCode: string } | null;
  status: string;
  priority: string;
  summary: string | null;
  successCriteria: string | null;
  startDate: string | null;
  targetDate: string | null;
  tags: string[];
  closedAt: string | null;
  createdAt: string;
  owner: { id: string; name: string; email: string };
  currentStage: StageData | null;
  stages: StageData[];
  tasks: TaskData[];
  contacts: ContactData[];
  files: FileData[];
  pinnedItems?: PinnedItemData[];
  clientQuote?: ClientQuoteData | null;
  clientDecision?: ClientDecisionData | null;
}

// ─── Constants ───

const PRIORITY_COLORS: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-orange-100 text-orange-700',
  HIGH: 'bg-red-100 text-red-700',
};

// ─── Page ───

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const id = params.id as string;
  const { data: project, isLoading } = useQuery({
    queryKey: ['project', id],
    queryFn: () => api.get<ProjectDetail>(`/api/v1/projects/${id}`),
    enabled: !!id,
  });

  const refetch = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['project', id] });
    queryClient.invalidateQueries({ queryKey: ['project-activity', id] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  }, [queryClient, id]);

  useSocketEvent('project.updated', refetch, [refetch]);
  useSocketEvent('project.task.updated', refetch, [refetch]);
  useSocketEvent('project.stage.updated', refetch, [refetch]);
  useSocketEvent('project.activity.created', refetch, [refetch]);

  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const nameInputRef = React.useRef<HTMLInputElement>(null);

  const renameMutation = useMutation({
    mutationFn: (newName: string) =>
      api.patch(`/api/v1/projects/${id}`, { name: newName }),
    onSuccess: () => {
      refetch();
      setEditingName(false);
      addToast('Project renamed', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const startRename = () => {
    if (!project) return;
    setNameValue(project.name);
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.select(), 50);
  };

  const commitRename = () => {
    const trimmed = nameValue.trim();
    if (!trimmed || trimmed === project?.name) {
      setEditingName(false);
      return;
    }
    renameMutation.mutate(trimmed);
  };

  const [changeCustomerOpen, setChangeCustomerOpen] = useState(false);

  const [statusConfirm, setStatusConfirm] = useState<{ target: string; label: string; icon: React.ElementType; color: string } | null>(null);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const statusMenuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setStatusMenuOpen(false);
      }
    };
    if (statusMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [statusMenuOpen]);

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) =>
      api.patch(`/api/v1/projects/${id}`, { status: newStatus }),
    onSuccess: () => {
      refetch();
      setStatusConfirm(null);
      addToast('Status updated', 'success');
    },
    onError: (err: Error) => {
      setStatusConfirm(null);
      addToast(err.message, 'error');
    },
  });

  if (isLoading || !project) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#DC2626] border-t-transparent" />
      </div>
    );
  }

  const STATUS_MENU_ITEMS: Record<string, Array<{ target: string; label: string; icon: React.ElementType; color: string; desc: string }>> = {
    ACTIVE: [
      { target: 'ON_HOLD', label: 'Put on Hold', icon: Pause, color: 'text-yellow-600', desc: 'Pause work temporarily' },
      { target: 'DONE', label: 'Mark Complete', icon: CheckCircle2, color: 'text-blue-600', desc: 'Project finished successfully' },
      { target: 'CANCELLED', label: 'Cancel Project', icon: XCircle, color: 'text-red-500', desc: 'Cancel this project' },
    ],
    ON_HOLD: [
      { target: 'ACTIVE', label: 'Resume', icon: Play, color: 'text-green-600', desc: 'Continue working on it' },
      { target: 'CANCELLED', label: 'Cancel Project', icon: XCircle, color: 'text-red-500', desc: 'Cancel this project' },
    ],
    DONE: [
      { target: 'ACTIVE', label: 'Reopen Project', icon: RotateCcw, color: 'text-green-600', desc: 'Set back to active' },
    ],
    CANCELLED: [
      { target: 'ACTIVE', label: 'Reopen Project', icon: RotateCcw, color: 'text-green-600', desc: 'Set back to active' },
    ],
  };

  const STATUS_DOT: Record<string, string> = {
    ACTIVE: 'bg-green-500',
    ON_HOLD: 'bg-yellow-500',
    DONE: 'bg-blue-500',
    CANCELLED: 'bg-red-500',
  };

  const menuItems = STATUS_MENU_ITEMS[project.status] ?? [];
  const openTasks = project.tasks.filter((t) => t.status !== 'DONE');
  const isClientProject = project.projectType === 'CLIENT';

  return (
    <div className="space-y-6">
      {/* Warning banner: client project without customer */}
      {isClientProject && !project.customerId && (
        <CustomerWarningBanner projectId={project.id} onRefetch={refetch} />
      )}

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.push('/projects')} className="-ml-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <div className="flex items-center gap-2">
              {editingName ? (
                <input
                  ref={nameInputRef}
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') setEditingName(false);
                  }}
                  className="rounded-lg border border-[#DC2626] bg-white px-2 py-1 text-2xl font-bold text-gray-900 outline-none ring-2 ring-[#DC2626]/20"
                  disabled={renameMutation.isPending}
                />
              ) : (
                <button
                  type="button"
                  onClick={startRename}
                  className="group flex items-center gap-2 rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-gray-100"
                  title="Click to rename"
                >
                  <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
                  <Pencil className="h-4 w-4 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              )}
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                isClientProject ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
              }`}>
                {isClientProject ? <Building2 className="h-3 w-3" /> : <Briefcase className="h-3 w-3" />}
                {isClientProject ? 'Client' : 'Internal'}
              </span>
            </div>
            <p className="text-sm text-gray-500">
              {project.code}
              {isClientProject && (
                <>
                  {' '}&middot;{' '}
                  <button
                    type="button"
                    onClick={() => setChangeCustomerOpen(true)}
                    className="inline-flex items-center gap-1 rounded px-1 py-0.5 font-medium text-gray-700 transition-colors hover:bg-blue-50 hover:text-blue-700"
                  >
                    {project.customer ? project.customer.name : 'Set Customer'}
                    <Pencil className="h-3 w-3 text-gray-300" />
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_COLORS[project.priority]}`}>
            {project.priority}
          </span>

          {/* Status dropdown */}
          <div className="relative" ref={statusMenuRef}>
            <button
              type="button"
              onClick={() => setStatusMenuOpen(!statusMenuOpen)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition-colors hover:bg-gray-50',
                'border-gray-200 bg-white text-gray-900'
              )}
            >
              <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_DOT[project.status])} />
              {project.status.replace(/_/g, ' ')}
              <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', statusMenuOpen && 'rotate-180')} />
            </button>

            {statusMenuOpen && (
              <div className="absolute right-0 z-30 mt-2 w-64 origin-top-right rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  Change status
                </div>
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.target}
                      type="button"
                      onClick={() => {
                        setStatusMenuOpen(false);
                        setStatusConfirm(item);
                      }}
                      className="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                    >
                      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', item.color)} />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.label}</p>
                        <p className="text-xs text-gray-500">{item.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status change confirmation modal */}
      <Modal
        isOpen={!!statusConfirm}
        onClose={() => setStatusConfirm(null)}
        title="Confirm Status Change"
      >
        {statusConfirm && (() => {
          const Icon = statusConfirm.icon;
          return (
            <div className="space-y-4">
              <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-center gap-2">
                  <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_DOT[project.status])} />
                  <span className="text-sm font-medium text-gray-700">{project.status.replace(/_/g, ' ')}</span>
                </div>
                <span className="text-lg text-gray-300">&rarr;</span>
                <div className="flex items-center gap-2">
                  <Icon className={cn('h-4 w-4', statusConfirm.color)} />
                  <span className="text-sm font-semibold text-gray-900">{statusConfirm.label}</span>
                </div>
              </div>

              {(statusConfirm.target === 'DONE' || statusConfirm.target === 'CANCELLED') && openTasks.length > 0 && (
                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                  <p className="text-sm font-medium text-yellow-800">
                    This project still has {openTasks.length} open task{openTasks.length > 1 ? 's' : ''}.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="secondary" onClick={() => setStatusConfirm(null)}>
                  Go Back
                </Button>
                <Button
                  type="button"
                  variant="primary"
                  disabled={statusMutation.isPending}
                  onClick={() => statusMutation.mutate(statusConfirm.target)}
                >
                  {statusMutation.isPending ? 'Updating...' : 'Confirm'}
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Change Customer Modal */}
      {isClientProject && (
        <ChangeCustomerModal
          projectId={project.id}
          currentCustomerId={project.customerId}
          isOpen={changeCustomerOpen}
          onClose={() => setChangeCustomerOpen(false)}
          onRefetch={refetch}
        />
      )}

      {/* Stage Workspace */}
      <StageWorkspace projectId={id} stages={project.stages} currentStageId={project.currentStage?.id} onRefetch={refetch} />
    </div>
  );
}

// ═══════════════════════════════════════
// CUSTOMER WARNING BANNER
// ═══════════════════════════════════════

function CustomerWarningBanner({ projectId, onRefetch }: { projectId: string; onRefetch: () => void }) {
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customers-picker-banner', customerSearch],
    queryFn: () =>
      api.get<{ data: Array<{ id: string; name: string; customerCode: string }> }>('/api/v1/customers', {
        search: customerSearch,
        pageSize: '20',
      }),
    enabled: open,
  });

  const customerOptions = (customersData?.data ?? []).map((c) => ({
    value: c.id,
    label: c.name,
    sublabel: c.customerCode,
  }));

  const [selectedCustomerId, setSelectedCustomerId] = useState('');

  const saveMutation = useMutation({
    mutationFn: () => api.patch(`/api/v1/projects/${projectId}`, { customerId: selectedCustomerId }),
    onSuccess: () => {
      onRefetch();
      setOpen(false);
      addToast('Customer set', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  return (
    <>
      <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" />
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800">Client project has no customer selected</p>
          <p className="text-xs text-amber-600">Set a customer to track this project properly.</p>
        </div>
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          Set Customer
        </Button>
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Set Customer">
        <div className="space-y-4">
          <SearchableSelect
            label="Customer"
            placeholder="Search customers..."
            value={selectedCustomerId}
            onChange={(val) => setSelectedCustomerId(val)}
            options={customerOptions}
            onSearchChange={setCustomerSearch}
            loading={customersLoading}
            emptyMessage="No customers found"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              type="button"
              variant="primary"
              disabled={!selectedCustomerId || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ═══════════════════════════════════════
// CHANGE CUSTOMER MODAL
// ═══════════════════════════════════════

function ChangeCustomerModal({
  projectId,
  currentCustomerId,
  isOpen,
  onClose,
  onRefetch,
}: {
  projectId: string;
  currentCustomerId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onRefetch: () => void;
}) {
  const { addToast } = useToast();
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(currentCustomerId ?? '');

  React.useEffect(() => {
    if (isOpen) setSelectedCustomerId(currentCustomerId ?? '');
  }, [isOpen, currentCustomerId]);

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customers-picker-change', customerSearch],
    queryFn: () =>
      api.get<{ data: Array<{ id: string; name: string; customerCode: string }> }>('/api/v1/customers', {
        search: customerSearch,
        pageSize: '20',
      }),
    enabled: isOpen,
  });

  const customerOptions = (customersData?.data ?? []).map((c) => ({
    value: c.id,
    label: c.name,
    sublabel: c.customerCode,
  }));

  const saveMutation = useMutation({
    mutationFn: () => api.patch(`/api/v1/projects/${projectId}`, { customerId: selectedCustomerId || null }),
    onSuccess: () => {
      onRefetch();
      onClose();
      addToast('Customer updated', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Change Customer">
      <div className="space-y-4">
        <SearchableSelect
          label="Customer"
          placeholder="Search customers..."
          value={selectedCustomerId}
          onChange={(val) => setSelectedCustomerId(val)}
          options={customerOptions}
          onSearchChange={setCustomerSearch}
          loading={customersLoading}
          emptyMessage="No customers found"
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            type="button"
            variant="primary"
            disabled={!selectedCustomerId || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
