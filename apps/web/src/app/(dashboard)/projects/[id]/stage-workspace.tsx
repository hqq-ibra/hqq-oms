'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Input, Modal, useToast, type SelectOption, Select } from '@/components/ui';
import { useSocketEvent } from '@/hooks/use-socket';
import { formatDateRelative, cn } from '@/lib/utils';

const SupplierShortlist = dynamic(() => import('./supplier-shortlist'), { ssr: false });
const QuoteComparison = dynamic(() => import('./quote-comparison'), { ssr: false });
const ClientApprovalWorkspace = dynamic(() => import('./client-approval-workspace'), { ssr: false });
const MindMapPanel = dynamic(() => import('./mind-map-panel'), { ssr: false });
const FlowchartPanel = dynamic(() => import('./flowchart-panel'), { ssr: false });
const ScoopyPanel = dynamic(() => import('./scoopy/scoopy-panel'), { ssr: false });
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  FileText,
  GripVertical,
  Image,
  Loader2,
  MessageSquare,
  Pencil,
  Play,
  Plus,
  StickyNote,
  Trash2,
  Upload,
  File,
  ClipboardList,
  FileEdit,
  FolderOpen,
  Globe,
  Network,
  Workflow,
  Pin,
  X,
  Bold,
  Italic,
  List,
  ListOrdered,
  Heading1,
  Heading2,
  Link as LinkIcon,
  Undo2,
  Redo2,
  Target,
  Search,
  ListChecks,
} from 'lucide-react';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TiptapLink from '@tiptap/extension-link';
import TiptapImage from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';

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
}

interface StickyNoteData {
  id: string;
  title: string;
  content: string;
  color: string;
  positionX: number;
  positionY: number;
  createdBy: { id: string; name: string };
  createdAt: string;
}

interface StageDocumentData {
  id: string;
  content: unknown;
  updatedBy: { id: string; name: string } | null;
  updatedAt: string;
}

interface StageFileData {
  id: string;
  title: string;
  filePath: string;
  fileType: string;
  fileSize: number | null;
  uploadedBy: { id: string; name: string };
  createdAt: string;
}

interface StageTaskData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assignee: { id: string; name: string } | null;
  dueDate: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface StageLinkData {
  id: string;
  title: string;
  url: string;
  description: string | null;
  createdBy: { id: string; name: string };
  createdAt: string;
}

interface StageMindMapData {
  id: string;
  content: unknown;
  updatedBy: { id: string; name: string } | null;
  updatedAt: string;
}

interface StageFlowchartData {
  id: string;
  content: unknown;
  updatedBy: { id: string; name: string } | null;
  updatedAt: string;
}

interface StageWorkspaceData extends StageData {
  stickyNotes: StickyNoteData[];
  document: StageDocumentData | null;
  mindMap: StageMindMapData | null;
  flowchart: StageFlowchartData | null;
  stageFiles: StageFileData[];
  stageTasks: StageTaskData[];
  stageLinks: StageLinkData[];
}

interface PinnedItemData {
  id: string;
  projectId: string;
  itemType: string;
  itemId: string;
  pinnedLocation: string;
  createdAt: string;
}

// ─── Colors ───

const NOTE_COLORS: Record<string, { bg: string; border: string; header: string }> = {
  yellow: { bg: 'bg-amber-50', border: 'border-amber-200', header: 'bg-amber-100' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', header: 'bg-blue-100' },
  green: { bg: 'bg-emerald-50', border: 'border-emerald-200', header: 'bg-emerald-100' },
  pink: { bg: 'bg-pink-50', border: 'border-pink-200', header: 'bg-pink-100' },
};

const TASK_STATUS_COLORS: Record<string, string> = {
  TODO: 'bg-gray-100 text-gray-700',
  DOING: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700',
};

const STAGE_STATUS_COLORS: Record<string, string> = {
  NOT_STARTED: 'bg-gray-100 text-gray-600',
  IN_PROGRESS: 'bg-blue-100 text-blue-700',
  DONE: 'bg-green-100 text-green-700',
};

const FILE_TYPE_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  PDF: { icon: FileText, color: 'bg-red-50 text-red-500' },
  IMAGE: { icon: Image, color: 'bg-purple-50 text-purple-500' },
  CAD: { icon: FileText, color: 'bg-orange-50 text-orange-500' },
  ZIP: { icon: File, color: 'bg-yellow-50 text-yellow-600' },
  OTHER: { icon: File, color: 'bg-gray-100 text-gray-500' },
};

type WorkspaceTab = 'notes' | 'document' | 'research' | 'requirements' | 'mindmap' | 'flowchart' | 'scoopy' | 'files' | 'links' | 'tasks';

const BASE_WORKSPACE_TABS: { key: WorkspaceTab; label: string; icon: React.ElementType }[] = [
  { key: 'notes', label: 'Sticky Notes', icon: StickyNote },
  { key: 'document', label: 'Document', icon: FileEdit },
  { key: 'files', label: 'Files', icon: FolderOpen },
  { key: 'links', label: 'Websites & Links', icon: Globe },
  { key: 'tasks', label: 'Tasks', icon: ClipboardList },
];

const MINDMAP_TAB = { key: 'mindmap' as WorkspaceTab, label: 'Mind Map', icon: Network };
const FLOWCHART_TAB = { key: 'flowchart' as WorkspaceTab, label: 'Flowchart', icon: Workflow };
const SCOOPY_TAB = { key: 'scoopy' as WorkspaceTab, label: 'Scoopy', icon: Target };
const RESEARCH_TAB = { key: 'research' as WorkspaceTab, label: 'Research', icon: Search };
const REQUIREMENTS_TAB = { key: 'requirements' as WorkspaceTab, label: 'Requirements', icon: ListChecks };

// ─── Main Component ───

export default function StageWorkspace({
  projectId,
  stages,
  currentStageId,
  onRefetch,
}: {
  projectId: string;
  stages: StageData[];
  currentStageId?: string;
  onRefetch: () => void;
}) {
  const [selectedStageId, setSelectedStageId] = useState<string | null>(
    stages[0]?.id ?? null,
  );
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('notes');
  const [doneModalOpen, setDoneModalOpen] = useState(false);
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const selectedStage = stages.find((s) => s.id === selectedStageId);
  const stageKey = selectedStage?.stageKey ?? 'CUSTOM';
  const isSupplierShortlist = stageKey === 'SUPPLIER_SHORTLIST';
  const isQuotationSamples = stageKey === 'QUOTATION_SAMPLES';
  const isClientApproval = stageKey === 'CLIENT_APPROVAL';
  const isIdeaScope = stageKey === 'IDEA_SCOPE';
  const isSpecializedStage = isSupplierShortlist || isQuotationSamples || isClientApproval;

  const isResearchReq = stageKey === 'RESEARCH_REQUIREMENTS';

  const WORKSPACE_TABS = React.useMemo(() => {
    if (isIdeaScope) {
      const tabs = [...BASE_WORKSPACE_TABS];
      tabs.splice(2, 0, MINDMAP_TAB, FLOWCHART_TAB, SCOOPY_TAB);
      return tabs;
    }
    if (isResearchReq) {
      const tabs = BASE_WORKSPACE_TABS.filter((t) => t.key !== 'document');
      tabs.splice(1, 0, RESEARCH_TAB, REQUIREMENTS_TAB);
      return tabs;
    }
    const tabs = [...BASE_WORKSPACE_TABS];
    tabs.splice(2, 0, MINDMAP_TAB);
    return tabs;
  }, [isIdeaScope, isResearchReq]);

  const { data: workspace, isLoading: wsLoading } = useQuery({
    queryKey: ['stage-workspace', selectedStageId],
    queryFn: () => api.get<StageWorkspaceData>(`/api/v1/projects/${projectId}/stages/${selectedStageId}/workspace`),
    enabled: !!selectedStageId && !isSpecializedStage,
  });

  const refetchWorkspace = useCallback(() => {
    if (selectedStageId) {
      queryClient.invalidateQueries({ queryKey: ['stage-workspace', selectedStageId] });
    }
    onRefetch();
  }, [queryClient, selectedStageId, onRefetch]);

  useSocketEvent('project.stage.updated', refetchWorkspace, [refetchWorkspace]);

  const statusMutation = useMutation({
    mutationFn: ({ stageId, status }: { stageId: string; status: string }) =>
      api.patch(`/api/v1/projects/${projectId}/stages/${stageId}`, { status }),
    onSuccess: () => {
      refetchWorkspace();
      addToast('Stage updated', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const setCurrentMutation = useMutation({
    mutationFn: (stageId: string) =>
      api.patch(`/api/v1/projects/${projectId}`, { currentStageId: stageId }),
    onSuccess: () => {
      refetchWorkspace();
      addToast('Current stage updated', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const handleMarkDone = () => {
    if (!selectedStageId) return;
    setDoneModalOpen(true);
  };

  const confirmMarkDone = () => {
    if (!selectedStageId) return;
    statusMutation.mutate({ stageId: selectedStageId, status: 'DONE' });
    setDoneModalOpen(false);
  };

  const hasContent = (stage: StageData) => {
    if (!workspace || workspace.id !== stage.id) return false;
    return workspace.stickyNotes.length > 0 || workspace.document?.content || workspace.stageFiles.length > 0 || workspace.stageTasks.length > 0 || workspace.stageLinks.length > 0;
  };

  return (
    <div className="flex gap-0 rounded-xl border border-gray-200 bg-white" style={{ minHeight: '70vh' }}>
      {/* LEFT PANEL - Stage List (sticky) */}
      <div className="w-[280px] shrink-0 border-r border-gray-200 bg-gray-50/50 self-start sticky top-0" style={{ maxHeight: '100vh' }}>
        <div className="border-b border-gray-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-700">Stages</h3>
          <p className="mt-0.5 text-[10px] text-gray-400">Click a stage to open its workspace</p>
        </div>
        <div className="space-y-1 p-2 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 60px)' }}>
          {stages.map((stage, idx) => {
            const isSelected = stage.id === selectedStageId;
            const isCurrent = stage.id === currentStageId;
            const StatusIcon = stage.status === 'DONE' ? CheckCircle2 : stage.status === 'IN_PROGRESS' ? Play : Circle;

            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => setSelectedStageId(stage.id)}
                className={cn(
                  'group flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-3 text-left transition-all',
                  isSelected
                    ? 'bg-white shadow-md ring-2 ring-[#DC2626]/20 border-l-[3px] border-l-[#DC2626]'
                    : 'border-l-[3px] border-l-transparent hover:bg-white hover:shadow-sm',
                )}
              >
                <div className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                  stage.status === 'DONE' ? 'bg-green-100' :
                  stage.status === 'IN_PROGRESS' ? 'bg-blue-100' :
                  'bg-gray-100',
                )}>
                  <StatusIcon className={cn(
                    'h-4 w-4',
                    stage.status === 'DONE' ? 'text-green-600' :
                    stage.status === 'IN_PROGRESS' ? 'text-blue-600' :
                    'text-gray-400',
                  )} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      'text-xs font-bold',
                      isSelected ? 'text-[#DC2626]' : 'text-gray-400',
                    )}>{idx + 1}.</span>
                    <span className={cn(
                      'truncate text-sm',
                      isSelected ? 'font-semibold text-gray-900' : 'font-medium text-gray-700',
                    )}>{stage.name}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className={cn('inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium', STAGE_STATUS_COLORS[stage.status])}>
                      {stage.status.replace(/_/g, ' ')}
                    </span>
                    {isCurrent && (
                      <span className="inline-flex rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">
                        Current
                      </span>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <div className="shrink-0 text-[#DC2626]">
                    <ExternalLink className="h-3.5 w-3.5" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* RIGHT PANEL - Workspace */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!selectedStageId || !selectedStage ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
            <MessageSquare className="h-12 w-12 text-gray-300" />
            <p className="text-sm font-medium">Select a stage from the left</p>
            <p className="text-xs">Click any stage to open its workspace</p>
          </div>
        ) : isSupplierShortlist ? (
          <div className="flex-1 overflow-auto p-6">
            <SupplierShortlist
              projectId={projectId}
              stageId={selectedStageId}
              stageName={selectedStage.name}
              stageStatus={selectedStage.status}
              onRefetch={refetchWorkspace}
              onStatusChange={(status) => statusMutation.mutate({ stageId: selectedStageId, status })}
            />
          </div>
        ) : isQuotationSamples ? (
          <div className="flex-1 overflow-auto p-6">
            <QuoteComparison
              projectId={projectId}
              stageId={selectedStageId}
              stageName={selectedStage.name}
              stageStatus={selectedStage.status}
              onRefetch={refetchWorkspace}
              onStatusChange={(status) => statusMutation.mutate({ stageId: selectedStageId, status })}
            />
          </div>
        ) : isClientApproval ? (
          <div className="flex-1 overflow-auto p-6">
            <ClientApprovalWorkspace
              projectId={projectId}
              stageId={selectedStageId}
              stageName={selectedStage.name}
              stageStatus={selectedStage.status}
              onRefetch={refetchWorkspace}
              onStatusChange={(status) => statusMutation.mutate({ stageId: selectedStageId, status })}
            />
          </div>
        ) : wsLoading || !workspace ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin text-[#DC2626]" />
            <p className="text-sm">Loading workspace...</p>
          </div>
        ) : (
          <>
            {/* Workspace Header */}
            <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{workspace.name}</h2>
                <div className="mt-1 flex items-center gap-2">
                  {(['NOT_STARTED', 'IN_PROGRESS', 'DONE'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => statusMutation.mutate({ stageId: workspace.id, status: s })}
                      className={cn(
                        'rounded-full px-3 py-1 text-xs font-medium transition-all',
                        workspace.status === s
                          ? STAGE_STATUS_COLORS[s] + ' ring-2 ring-offset-1 ring-gray-300'
                          : 'bg-gray-50 text-gray-400 hover:bg-gray-100',
                      )}
                    >
                      {s.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {workspace.id !== currentStageId && (
                  <Button variant="secondary" size="sm" onClick={() => setCurrentMutation.mutate(workspace.id)}>
                    Set as Current
                  </Button>
                )}
                {workspace.status !== 'DONE' && (
                  <Button variant="primary" size="sm" onClick={handleMarkDone}>
                    <CheckCircle2 className="h-4 w-4" /> Mark Done
                  </Button>
                )}
              </div>
            </div>

            {/* Workspace Tabs */}
            <div className="border-b border-gray-200 px-6">
              <nav className="flex gap-1">
                {WORKSPACE_TABS.map((tab) => {
                  const Icon = tab.icon;
                  let count = 0;
                  if (tab.key === 'notes') count = workspace.stickyNotes.length;
                  else if (tab.key === 'files') count = workspace.stageFiles.length;
                  else if (tab.key === 'links') count = workspace.stageLinks.length;
                  else if (tab.key === 'tasks') count = workspace.stageTasks.length;

                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setWorkspaceTab(tab.key)}
                      className={cn(
                        'flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                        workspaceTab === tab.key
                          ? 'border-[#DC2626] text-[#DC2626]'
                          : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700',
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {tab.label}
                      {count > 0 && (
                        <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                          {count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Tab Content */}
            <div className={cn('flex-1', workspaceTab === 'mindmap' || workspaceTab === 'flowchart' || workspaceTab === 'scoopy' ? 'overflow-hidden' : 'overflow-auto p-6')}>
              {workspaceTab === 'notes' && (
                <StickyNotesPanel projectId={projectId} stageId={workspace.id} notes={workspace.stickyNotes} onRefetch={refetchWorkspace} />
              )}
              {workspaceTab === 'document' && (
                <DocumentPanel projectId={projectId} stageId={workspace.id} document={workspace.document} onRefetch={refetchWorkspace} />
              )}
              {workspaceTab === 'research' && (
                <LocalDocumentPanel storageKey={`research_${projectId}_${workspace.id}`} placeholder="اكتب البحث هنا..." label="Research" />
              )}
              {workspaceTab === 'requirements' && (
                <LocalDocumentPanel storageKey={`requirements_${projectId}_${workspace.id}`} placeholder="اكتب المتطلبات هنا..." label="Requirements" />
              )}
              {workspaceTab === 'mindmap' && (
                <MindMapPanel projectId={projectId} stageId={workspace.id} mindMap={workspace.mindMap} onRefetch={refetchWorkspace} />
              )}
              {workspaceTab === 'flowchart' && (
                <FlowchartPanel projectId={projectId} stageId={workspace.id} flowchart={workspace.flowchart} onRefetch={refetchWorkspace} />
              )}
              {workspaceTab === 'scoopy' && (
                <ScoopyPanel />
              )}
              {workspaceTab === 'files' && (
                <StageFilesPanel projectId={projectId} stageId={workspace.id} files={workspace.stageFiles} onRefetch={refetchWorkspace} />
              )}
              {workspaceTab === 'links' && (
                <StageLinksPanel projectId={projectId} stageId={workspace.id} links={workspace.stageLinks} onRefetch={refetchWorkspace} />
              )}
              {workspaceTab === 'tasks' && (
                <StageTasksPanel projectId={projectId} stageId={workspace.id} tasks={workspace.stageTasks} onRefetch={refetchWorkspace} />
              )}
            </div>
          </>
        )}
      </div>

      {/* Mark Done Modal */}
      <Modal isOpen={doneModalOpen} onClose={() => setDoneModalOpen(false)} title="Mark Stage as Done">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to mark <strong>{workspace?.name}</strong> as done?
          </p>
          {workspace && (workspace.stickyNotes.length > 0 || workspace.stageFiles.length > 0) && (
            <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700">
              <p className="font-medium">This stage contains:</p>
              <ul className="mt-1 list-inside list-disc text-xs">
                {workspace.stickyNotes.length > 0 && <li>{workspace.stickyNotes.length} sticky note(s)</li>}
                {workspace.stageFiles.length > 0 && <li>{workspace.stageFiles.length} file(s)</li>}
                {workspace.stageTasks.length > 0 && <li>{workspace.stageTasks.length} task(s)</li>}
                {workspace.stageLinks.length > 0 && <li>{workspace.stageLinks.length} link(s)</li>}
              </ul>
              <p className="mt-2 text-xs">You can pin important items to the project overview using the <Pin className="inline h-3 w-3" /> pin button.</p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDoneModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={confirmMarkDone}>
              <CheckCircle2 className="h-4 w-4" /> Mark Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════
// STICKY NOTES PANEL
// ═══════════════════════════════════════

function StickyNotesPanel({
  projectId,
  stageId,
  notes,
  onRefetch,
}: {
  projectId: string;
  stageId: string;
  notes: StickyNoteData[];
  onRefetch: () => void;
}) {
  const { addToast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editNote, setEditNote] = useState<StickyNoteData | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [color, setColor] = useState('yellow');

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post(`/api/v1/projects/${projectId}/stages/${stageId}/notes`, body),
    onSuccess: () => {
      onRefetch();
      setAddOpen(false);
      setTitle('');
      setContent('');
      setColor('yellow');
      addToast('Note created', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ noteId, body }: { noteId: string; body: Record<string, unknown> }) =>
      api.patch(`/api/v1/projects/${projectId}/stages/${stageId}/notes/${noteId}`, body),
    onSuccess: () => {
      onRefetch();
      setEditNote(null);
      addToast('Note updated', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (noteId: string) =>
      api.delete(`/api/v1/projects/${projectId}/stages/${stageId}/notes/${noteId}`),
    onSuccess: () => {
      onRefetch();
      addToast('Note deleted', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const openEdit = (note: StickyNoteData) => {
    setEditNote(note);
    setTitle(note.title);
    setContent(note.content);
    setColor(note.color);
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">{notes.length} note{notes.length !== 1 ? 's' : ''}</p>
        <Button variant="primary" size="sm" onClick={() => { setAddOpen(true); setTitle(''); setContent(''); setColor('yellow'); }}>
          <Plus className="h-4 w-4" /> Add Note
        </Button>
      </div>

      {notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <StickyNote className="h-12 w-12 mb-3" />
          <p className="text-sm font-medium">No sticky notes yet</p>
          <p className="text-xs">Add notes for brainstorming and quick ideas</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => {
            const colors = NOTE_COLORS[note.color] ?? NOTE_COLORS.yellow;
            return (
              <div
                key={note.id}
                className={cn('group rounded-lg border shadow-sm transition-shadow hover:shadow-md', colors.bg, colors.border)}
              >
                <div className={cn('flex items-center justify-between rounded-t-lg px-3 py-2', colors.header)}>
                  <h4 className="truncate text-sm font-semibold text-gray-800">{note.title}</h4>
                  <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button type="button" onClick={() => openEdit(note)} className="rounded p-1 hover:bg-black/5">
                      <Pencil className="h-3.5 w-3.5 text-gray-600" />
                    </button>
                    <button type="button" onClick={() => deleteMutation.mutate(note.id)} className="rounded p-1 hover:bg-black/5">
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
                <div className="px-3 py-2">
                  <p className="whitespace-pre-wrap text-sm text-gray-700">{note.content || '...'}</p>
                  <p className="mt-2 text-[10px] text-gray-400">{note.createdBy.name} · {formatDateRelative(note.createdAt)}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal
        isOpen={addOpen || !!editNote}
        onClose={() => { setAddOpen(false); setEditNote(null); }}
        title={editNote ? 'Edit Note' : 'New Sticky Note'}
      >
        <div className="space-y-4">
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#DC2626] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Color</label>
            <div className="flex gap-2">
              {Object.entries(NOTE_COLORS).map(([key, val]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setColor(key)}
                  className={cn(
                    'h-8 w-8 rounded-full border-2 transition-all',
                    val.bg,
                    color === key ? 'ring-2 ring-[#DC2626] ring-offset-2 border-gray-400' : 'border-gray-200',
                  )}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setAddOpen(false); setEditNote(null); }}>Cancel</Button>
            <Button
              variant="primary"
              disabled={!title.trim()}
              onClick={() => {
                if (editNote) {
                  updateMutation.mutate({ noteId: editNote.id, body: { title, content, color } });
                } else {
                  createMutation.mutate({ title, content, color });
                }
              }}
            >
              {editNote ? 'Save' : 'Create'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ═══════════════════════════════════════
// DOCUMENT PANEL (TipTap)
// ═══════════════════════════════════════

function DocumentPanel({
  projectId,
  stageId,
  document,
  onRefetch,
}: {
  projectId: string;
  stageId: string;
  document: StageDocumentData | null;
  onRefetch: () => void;
}) {
  const { addToast } = useToast();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveMutation = useMutation({
    mutationFn: (content: unknown) =>
      api.patch(`/api/v1/projects/${projectId}/stages/${stageId}/document`, { content }),
    onSuccess: () => {
      onRefetch();
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TiptapLink.configure({ openOnClick: false }),
      TiptapImage,
      Placeholder.configure({ placeholder: 'Start writing your stage document here...' }),
    ],
    content: (document?.content as object) ?? {},
    onUpdate: ({ editor: e }) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveMutation.mutate(e.getJSON());
      }, 1500);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[400px] focus:outline-none px-4 py-3',
      },
    },
  });

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!editor) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {document?.updatedBy && (
            <span>Last edited by {document.updatedBy.name} · {formatDateRelative(document.updatedAt)}</span>
          )}
          {saveMutation.isPending && <span className="text-blue-500">Saving...</span>}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 border-gray-200 bg-gray-50 px-2 py-1.5">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} icon={Bold} title="Bold" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} icon={Italic} title="Italic" />
        <div className="mx-1 h-5 w-px bg-gray-200" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} icon={Heading1} title="Heading 1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} icon={Heading2} title="Heading 2" />
        <div className="mx-1 h-5 w-px bg-gray-200" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} icon={List} title="Bullet List" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} icon={ListOrdered} title="Ordered List" />
        <div className="mx-1 h-5 w-px bg-gray-200" />
        <ToolbarButton
          onClick={() => {
            const url = window.prompt('Enter URL:');
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
          active={editor.isActive('link')}
          icon={LinkIcon}
          title="Link"
        />
        <div className="mx-1 h-5 w-px bg-gray-200" />
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} icon={Undo2} title="Undo" />
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} icon={Redo2} title="Redo" />
      </div>

      <div className="rounded-b-lg border border-gray-200 bg-white">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// LOCAL DOCUMENT PANEL (localStorage-backed TipTap)
// ═══════════════════════════════════════

function LocalDocumentPanel({
  storageKey,
  placeholder,
  label,
}: {
  storageKey: string;
  placeholder: string;
  label: string;
}) {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saved, setSaved] = useState(false);

  const loadContent = (): object => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      TiptapLink.configure({ openOnClick: false }),
      TiptapImage,
      Placeholder.configure({ placeholder }),
    ],
    content: loadContent(),
    onUpdate: ({ editor: e }) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaved(false);
      saveTimerRef.current = setTimeout(() => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(e.getJSON()));
          setSaved(true);
          setTimeout(() => setSaved(false), 1500);
        } catch { /* storage full */ }
      }, 800);
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none min-h-[400px] focus:outline-none px-4 py-3',
      },
    },
  });

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!editor) return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        {saved && <span className="text-xs text-green-500">Saved</span>}
      </div>

      <div className="flex flex-wrap items-center gap-0.5 rounded-t-lg border border-b-0 border-gray-200 bg-gray-50 px-2 py-1.5">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} icon={Bold} title="Bold" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} icon={Italic} title="Italic" />
        <div className="mx-1 h-5 w-px bg-gray-200" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })} icon={Heading1} title="Heading 1" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })} icon={Heading2} title="Heading 2" />
        <div className="mx-1 h-5 w-px bg-gray-200" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} icon={List} title="Bullet List" />
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} icon={ListOrdered} title="Ordered List" />
        <div className="mx-1 h-5 w-px bg-gray-200" />
        <ToolbarButton
          onClick={() => {
            const url = window.prompt('Enter URL:');
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
          active={editor.isActive('link')}
          icon={LinkIcon}
          title="Link"
        />
        <div className="mx-1 h-5 w-px bg-gray-200" />
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} icon={Undo2} title="Undo" />
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} icon={Redo2} title="Redo" />
      </div>

      <div className="rounded-b-lg border border-gray-200 bg-white">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

function ToolbarButton({
  onClick,
  active,
  icon: Icon,
  title,
}: {
  onClick: () => void;
  active?: boolean;
  icon: React.ElementType;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'rounded p-1.5 transition-colors',
        active ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

// ═══════════════════════════════════════
// FILES PANEL
// ═══════════════════════════════════════

function StageFilesPanel({
  projectId,
  stageId,
  files,
  onRefetch,
}: {
  projectId: string;
  stageId: string;
  files: StageFileData[];
  onRefetch: () => void;
}) {
  const { addToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) =>
      api.delete(`/api/v1/projects/${projectId}/stages/${stageId}/files/${fileId}`),
    onSuccess: () => {
      onRefetch();
      addToast('File deleted', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const uploadFiles = async (fileList: globalThis.File[]) => {
    if (fileList.length === 0) return;
    setUploading(true);
    try {
      const formData = new FormData();
      for (const f of fileList) formData.append('files', f);
      await api.upload(`/api/v1/projects/${projectId}/stages/${stageId}/files/upload`, formData);
      onRefetch();
      addToast(`${fileList.length} file${fileList.length > 1 ? 's' : ''} uploaded`, 'success');
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  };

  const onDragEnter = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current++; setIsDragging(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); dragCounter.current--; if (dragCounter.current <= 0) { dragCounter.current = 0; setIsDragging(false); } };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) uploadFiles(dropped);
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? []);
    if (selected.length > 0) uploadFiles(selected);
    e.target.value = '';
  };

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

  const formatSize = (bytes: number | null) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={onFileInputChange} />

      {/* Upload zone */}
      <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={cn(
          'mb-4 rounded-xl border-2 border-dashed transition-all',
          isDragging
            ? 'border-[#DC2626] bg-red-50/50 ring-4 ring-red-100'
            : 'border-gray-300 bg-gray-50/50 hover:border-gray-400',
        )}
      >
        {isDragging ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <Upload className="h-10 w-10 text-[#DC2626]" />
            <p className="text-sm font-medium text-[#DC2626]">Drop files here</p>
          </div>
        ) : uploading ? (
          <div className="flex flex-col items-center gap-2 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-[#DC2626]" />
            <p className="text-sm font-medium text-gray-600">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-8">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg bg-[#DC2626] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700"
            >
              <Upload className="h-4 w-4" /> Upload Files
            </button>
            <p className="text-xs text-gray-400">Drag & drop files or click to browse</p>
          </div>
        )}
      </div>

      {/* File list */}
      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <FolderOpen className="h-12 w-12 mb-3" />
          <p className="text-sm font-medium">No files yet</p>
        </div>
      ) : (
        <div className="space-y-1">
          {files.map((file) => {
            const ft = FILE_TYPE_ICONS[file.fileType] ?? FILE_TYPE_ICONS.OTHER;
            const Icon = ft.icon;
            const href = `${apiBase}${file.filePath}`;
            const isImage = file.fileType === 'IMAGE';

            return (
              <div key={file.id} className="group flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5 transition-colors hover:bg-gray-50">
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
                  <p className="text-xs text-gray-400">
                    {file.fileType}{file.fileSize ? ` · ${formatSize(file.fileSize)}` : ''} · {file.uploadedBy.name} · {formatDateRelative(file.createdAt)}
                  </p>
                </div>
                <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded p-1.5 text-gray-300 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 group-hover:opacity-100">
                  <ExternalLink className="h-4 w-4" />
                </a>
                <button type="button" onClick={() => deleteMutation.mutate(file.id)} className="shrink-0 rounded p-1.5 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// LINKS PANEL
// ═══════════════════════════════════════

function getFaviconUrl(url: string): string {
  try {
    const u = new URL(url);
    return `https://www.google.com/s2/favicons?domain=${u.hostname}&sz=32`;
  } catch {
    return '';
  }
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace('www.', '');
  } catch {
    return url.substring(0, 50);
  }
}

function StageLinkCard({
  projectId,
  stageId,
  link,
  onRefetch,
}: {
  projectId: string;
  stageId: string;
  link: StageLinkData;
  onRefetch: () => void;
}) {
  const { addToast } = useToast();
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(link.title);
  const [descValue, setDescValue] = useState(link.description ?? '');
  const titleRef = useRef<HTMLInputElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    setTitleValue(link.title);
    setDescValue(link.description ?? '');
  }, [link.title, link.description]);

  const updateMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/api/v1/projects/${projectId}/stages/${stageId}/links/${link.id}`, body),
    onSuccess: () => onRefetch(),
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      api.delete(`/api/v1/projects/${projectId}/stages/${stageId}/links/${link.id}`),
    onSuccess: () => {
      onRefetch();
      addToast('Link removed', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const commitTitle = () => {
    setEditingTitle(false);
    const trimmed = titleValue.trim();
    if (!trimmed || trimmed === link.title) {
      setTitleValue(link.title);
      return;
    }
    updateMutation.mutate({ title: trimmed });
  };

  const handleDescChange = (value: string) => {
    setDescValue(value);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateMutation.mutate({ description: value.trim() || null });
    }, 1000);
  };

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  const favicon = getFaviconUrl(link.url);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      {/* Header: favicon + title + actions */}
      <div className="flex items-center gap-3 px-4 py-3">
        <a href={link.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
          {favicon ? (
            <img src={favicon} alt="" className="h-6 w-6 rounded" />
          ) : (
            <Globe className="h-6 w-6 text-gray-400" />
          )}
        </a>

        <div className="min-w-0 flex-1">
          {editingTitle ? (
            <input
              ref={titleRef}
              type="text"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle();
                if (e.key === 'Escape') { setTitleValue(link.title); setEditingTitle(false); }
              }}
              className="w-full rounded border border-[#DC2626] bg-white px-1.5 py-0.5 text-sm font-semibold text-gray-900 outline-none ring-2 ring-[#DC2626]/20"
            />
          ) : (
            <button
              type="button"
              onClick={() => { setEditingTitle(true); setTimeout(() => titleRef.current?.select(), 50); }}
              className="group/title flex items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-gray-50"
            >
              <span className="text-sm font-semibold text-gray-900">{link.title}</span>
              <Pencil className="h-3 w-3 text-gray-300 opacity-0 transition-opacity group-hover/title:opacity-100" />
            </button>
          )}
          <a href={link.url} target="_blank" rel="noopener noreferrer" className="block truncate px-1 text-xs text-gray-400 hover:text-[#DC2626]" dir="ltr">
            {link.url}
          </a>
        </div>

        <div className="flex shrink-0 gap-0.5">
          <a
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Open link"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={() => deleteMutation.mutate()}
            className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Description - always visible */}
      <div className="border-t border-gray-100 px-4 py-2">
        <textarea
          value={descValue}
          onChange={(e) => handleDescChange(e.target.value)}
          rows={2}
          placeholder="Add notes about this link..."
          className="w-full resize-none border-0 bg-transparent p-0 text-sm text-gray-600 placeholder-gray-300 focus:outline-none focus:ring-0"
        />
      </div>
    </div>
  );
}

function StageLinksPanel({
  projectId,
  stageId,
  links,
  onRefetch,
}: {
  projectId: string;
  stageId: string;
  links: StageLinkData[];
  onRefetch: () => void;
}) {
  const { addToast } = useToast();
  const [quickUrl, setQuickUrl] = useState('');

  const createMutation = useMutation({
    mutationFn: (body: { title: string; url: string }) =>
      api.post(`/api/v1/projects/${projectId}/stages/${stageId}/links`, body),
    onSuccess: () => {
      onRefetch();
      setQuickUrl('');
      addToast('Link added', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const quickAdd = () => {
    const trimmed = quickUrl.trim();
    if (!trimmed) return;
    const url = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    createMutation.mutate({ title: titleFromUrl(url), url });
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text/plain');
    if (text && text.trim().startsWith('http')) {
      e.preventDefault();
      const urls = text.split(/[\n\r]+/).map((s) => s.trim()).filter((s) => s.startsWith('http'));
      for (const url of urls) {
        createMutation.mutate({ title: titleFromUrl(url), url });
      }
    }
  };

  return (
    <div>
      {/* Quick add */}
      <div className="mb-4 flex items-center gap-2">
        <Globe className="h-4 w-4 shrink-0 text-gray-400" />
        <input
          type="text"
          value={quickUrl}
          onChange={(e) => setQuickUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') quickAdd(); }}
          onPaste={handlePaste}
          placeholder="Paste a website URL and press Enter..."
          dir="ltr"
          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#DC2626] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20"
        />
        <Button variant="primary" size="sm" onClick={quickAdd} disabled={!quickUrl.trim() || createMutation.isPending}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {/* Links list */}
      {links.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <Globe className="h-12 w-12 mb-3" />
          <p className="text-sm font-medium">No links yet</p>
          <p className="text-xs">Paste a URL above to add a website link</p>
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((link) => (
            <StageLinkCard
              key={link.id}
              projectId={projectId}
              stageId={stageId}
              link={link}
              onRefetch={onRefetch}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// TASKS PANEL
// ═══════════════════════════════════════

function StageTasksPanel({
  projectId,
  stageId,
  tasks,
  onRefetch,
}: {
  projectId: string;
  stageId: string;
  tasks: StageTaskData[];
  onRefetch: () => void;
}) {
  const { addToast } = useToast();
  const [quickTitle, setQuickTitle] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const createMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post(`/api/v1/projects/${projectId}/stages/${stageId}/tasks`, body),
    onSuccess: () => {
      onRefetch();
      setQuickTitle('');
      addToast('Task created', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ taskId, body }: { taskId: string; body: Record<string, unknown> }) =>
      api.patch(`/api/v1/projects/${projectId}/stages/${stageId}/tasks/${taskId}`, body),
    onSuccess: () => {
      onRefetch();
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (taskId: string) =>
      api.delete(`/api/v1/projects/${projectId}/stages/${stageId}/tasks/${taskId}`),
    onSuccess: () => {
      onRefetch();
      addToast('Task deleted', 'success');
    },
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const handleQuickAdd = () => {
    if (!quickTitle.trim()) return;
    createMutation.mutate({ title: quickTitle.trim() });
  };

  const cycleStatus = (task: StageTaskData) => {
    const next = task.status === 'TODO' ? 'DOING' : task.status === 'DOING' ? 'DONE' : 'TODO';
    updateMutation.mutate({ taskId: task.id, body: { status: next } });
  };

  const filtered = filterStatus === 'ALL' ? tasks : tasks.filter((t) => t.status === filterStatus);
  const todoCount = tasks.filter((t) => t.status === 'TODO').length;
  const doingCount = tasks.filter((t) => t.status === 'DOING').length;
  const doneCount = tasks.filter((t) => t.status === 'DONE').length;

  return (
    <div>
      {/* Quick add */}
      <div className="mb-4 flex items-center gap-2">
        <input
          type="text"
          value={quickTitle}
          onChange={(e) => setQuickTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd(); }}
          placeholder="Add a task and press Enter..."
          className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-[#DC2626] focus:outline-none focus:ring-2 focus:ring-[#DC2626]/20"
        />
        <Button variant="primary" size="sm" onClick={handleQuickAdd} disabled={!quickTitle.trim()}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>

      {/* Filters */}
      <div className="mb-4 flex gap-2">
        {[
          { key: 'ALL', label: `All (${tasks.length})` },
          { key: 'TODO', label: `To Do (${todoCount})` },
          { key: 'DOING', label: `Doing (${doingCount})` },
          { key: 'DONE', label: `Done (${doneCount})` },
        ].map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilterStatus(f.key)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium transition-colors',
              filterStatus === f.key
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <ClipboardList className="h-12 w-12 mb-3" />
          <p className="text-sm font-medium">{tasks.length === 0 ? 'No tasks yet' : 'No matching tasks'}</p>
        </div>
      ) : (
        <div className="space-y-1">
          {filtered.map((task) => (
            <div key={task.id} className="group flex items-center gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5 transition-colors hover:bg-gray-50">
              <button
                type="button"
                onClick={() => cycleStatus(task)}
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all',
                  task.status === 'DONE'
                    ? 'border-green-500 bg-green-500 text-white'
                    : task.status === 'DOING'
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-300 bg-white hover:border-gray-400',
                )}
              >
                {task.status === 'DONE' && <CheckCircle2 className="h-3.5 w-3.5" />}
                {task.status === 'DOING' && <div className="h-2 w-2 rounded-full bg-blue-500" />}
              </button>

              <div className="min-w-0 flex-1">
                <p className={cn('text-sm font-medium', task.status === 'DONE' ? 'text-gray-400 line-through' : 'text-gray-900')}>
                  {task.title}
                </p>
                <div className="flex items-center gap-2">
                  {task.assignee && <span className="text-xs text-gray-400">{task.assignee.name}</span>}
                  {task.dueDate && <span className="text-xs text-gray-400">Due: {formatDateRelative(task.dueDate)}</span>}
                </div>
              </div>

              <span className={cn('shrink-0 rounded px-2 py-0.5 text-[10px] font-medium', TASK_STATUS_COLORS[task.status])}>
                {task.status}
              </span>

              <button type="button" onClick={() => deleteMutation.mutate(task.id)} className="shrink-0 rounded p-1.5 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
