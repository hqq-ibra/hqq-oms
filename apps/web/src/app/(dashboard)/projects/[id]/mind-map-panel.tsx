'use client';

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui';
import { Plus, Trash2, LayoutGrid, Pencil, Maximize2, Minimize2 } from 'lucide-react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  Handle,
  Position,
  BackgroundVariant,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ─── Branch Color Palette ───

const BRANCH_PALETTE = [
  { main: '#f43f5e', bg: '#fecdd3', bgLight: '#fff1f2', border: '#f43f5e', borderLight: '#fda4af', text: '#9f1239' },
  { main: '#8b5cf6', bg: '#ddd6fe', bgLight: '#f5f3ff', border: '#8b5cf6', borderLight: '#c4b5fd', text: '#5b21b6' },
  { main: '#14b8a6', bg: '#99f6e4', bgLight: '#f0fdfa', border: '#14b8a6', borderLight: '#5eead4', text: '#115e59' },
  { main: '#f97316', bg: '#fed7aa', bgLight: '#fff7ed', border: '#f97316', borderLight: '#fdba74', text: '#9a3412' },
  { main: '#3b82f6', bg: '#bfdbfe', bgLight: '#eff6ff', border: '#3b82f6', borderLight: '#93c5fd', text: '#1e40af' },
  { main: '#10b981', bg: '#a7f3d0', bgLight: '#ecfdf5', border: '#10b981', borderLight: '#6ee7b7', text: '#064e3b' },
  { main: '#ec4899', bg: '#fbcfe8', bgLight: '#fdf2f8', border: '#ec4899', borderLight: '#f9a8d4', text: '#9d174d' },
  { main: '#eab308', bg: '#fef08a', bgLight: '#fefce8', border: '#ca8a04', borderLight: '#fde047', text: '#713f12' },
];

// ─── Tree helpers ───

function buildChildMap(edges: Edge[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const e of edges) {
    (map[e.source] ??= []).push(e.target);
  }
  return map;
}

function countLeaves(nodeId: string, cm: Record<string, string[]>): number {
  const ch = cm[nodeId];
  if (!ch || ch.length === 0) return 1;
  return ch.reduce((s, c) => s + countLeaves(c, cm), 0);
}

function computeNodeInfo(
  nodes: Node[],
  edges: Edge[],
): Map<string, { colorIndex: number; depth: number }> {
  const targetIds = new Set(edges.map((e) => e.target));
  const root =
    nodes.find((n) => n.data?.isRoot) ??
    nodes.find((n) => !targetIds.has(n.id)) ??
    nodes[0];
  if (!root) return new Map();

  const cm = buildChildMap(edges);
  const info = new Map<string, { colorIndex: number; depth: number }>();
  info.set(root.id, { colorIndex: -1, depth: 0 });

  const rootChildren = cm[root.id] ?? [];
  const assign = (id: string, ci: number, depth: number) => {
    info.set(id, { colorIndex: ci, depth });
    (cm[id] ?? []).forEach((c) => assign(c, ci, depth + 1));
  };

  rootChildren.forEach((childId, i) =>
    assign(childId, i % BRANCH_PALETTE.length, 1),
  );
  return info;
}

// ─── Dynamic handle selection ───

function getBestHandles(
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number },
): { sourceHandle: string; targetHandle: string } {
  const dx = targetPos.x - sourcePos.x;
  const dy = targetPos.y - sourcePos.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) {
      return { sourceHandle: 'right-source', targetHandle: 'left-target' };
    }
    return { sourceHandle: 'left-source', targetHandle: 'right-target' };
  }
  if (dy >= 0) {
    return { sourceHandle: 'bottom-source', targetHandle: 'top-target' };
  }
  return { sourceHandle: 'top-source', targetHandle: 'bottom-target' };
}

// ─── Auto-layout (horizontal tree) ───

const H_GAP = 240;
const V_GAP = 68;

function layoutNodes(rawNodes: Node[], rawEdges: Edge[]): Node[] {
  if (rawNodes.length === 0) return rawNodes;
  const targetIds = new Set(rawEdges.map((e) => e.target));
  const root =
    rawNodes.find((n) => n.data?.isRoot) ??
    rawNodes.find((n) => !targetIds.has(n.id)) ??
    rawNodes[0];
  if (!root) return rawNodes;

  const cm = buildChildMap(rawEdges);
  const positions = new Map<string, { x: number; y: number }>();
  positions.set(root.id, { x: 0, y: 0 });

  const rootChildren = cm[root.id] ?? [];
  const rightCount = Math.ceil(rootChildren.length / 2);
  const rightChildren = rootChildren.slice(0, rightCount);
  const leftChildren = rootChildren.slice(rightCount);

  const positionSubtree = (
    nodeId: string,
    x: number,
    centerY: number,
    dir: 1 | -1,
  ) => {
    positions.set(nodeId, { x, y: centerY });
    const ch = cm[nodeId] ?? [];
    if (ch.length === 0) return;
    const lcs = ch.map((c) => countLeaves(c, cm));
    const total = lcs.reduce((a, b) => a + b, 0);
    const totalH = (total - 1) * V_GAP;
    let curY = centerY - totalH / 2;
    for (let i = 0; i < ch.length; i++) {
      const cy = curY + ((lcs[i] - 1) * V_GAP) / 2;
      positionSubtree(ch[i], x + dir * H_GAP, cy, dir);
      curY += lcs[i] * V_GAP;
    }
  };

  const positionGroup = (children: string[], dir: 1 | -1) => {
    if (children.length === 0) return;
    const lcs = children.map((c) => countLeaves(c, cm));
    const total = lcs.reduce((a, b) => a + b, 0);
    const totalH = (total - 1) * V_GAP;
    let curY = -totalH / 2;
    for (let i = 0; i < children.length; i++) {
      const cy = curY + ((lcs[i] - 1) * V_GAP) / 2;
      positionSubtree(children[i], dir * H_GAP, cy, dir);
      curY += lcs[i] * V_GAP;
    }
  };

  positionGroup(rightChildren, 1);
  positionGroup(leftChildren, -1);

  return rawNodes.map((n) => {
    const pos = positions.get(n.id);
    return pos ? { ...n, position: { x: pos.x, y: pos.y } } : n;
  });
}

// ─── Smart placement for new children (no re-layout) ───

function getSubtreeMax(
  nodeId: string,
  allNodes: Node[],
  cm: Record<string, string[]>,
  axis: 'x' | 'y',
): number {
  const node = allNodes.find((n) => n.id === nodeId);
  if (!node) return -Infinity;
  let result = node.position[axis];
  for (const child of cm[nodeId] ?? []) {
    result = Math.max(result, getSubtreeMax(child, allNodes, cm, axis));
  }
  return result;
}

function getSubtreeMin(
  nodeId: string,
  allNodes: Node[],
  cm: Record<string, string[]>,
  axis: 'x' | 'y',
): number {
  const node = allNodes.find((n) => n.id === nodeId);
  if (!node) return Infinity;
  let result = node.position[axis];
  for (const child of cm[nodeId] ?? []) {
    result = Math.min(result, getSubtreeMin(child, allNodes, cm, axis));
  }
  return result;
}

function findChildPosition(
  parentId: string,
  allNodes: Node[],
  allEdges: Edge[],
): { x: number; y: number } {
  const parent = allNodes.find((n) => n.id === parentId);
  if (!parent) return { x: 200, y: 200 };

  const cm = buildChildMap(allEdges);
  const existingChildIds = cm[parentId] ?? [];
  const siblings = existingChildIds
    .map((id) => allNodes.find((n) => n.id === id))
    .filter(Boolean) as Node[];

  const parentEdge = allEdges.find((e) => e.target === parentId);

  let dirX = 0;
  let dirY = 0;

  if (parentEdge) {
    const grandParent = allNodes.find((n) => n.id === parentEdge.source);
    if (grandParent) {
      const dx = parent.position.x - grandParent.position.x;
      const dy = parent.position.y - grandParent.position.y;
      if (Math.abs(dx) >= Math.abs(dy)) {
        dirX = dx >= 0 ? 1 : -1;
      } else {
        dirY = dy >= 0 ? 1 : -1;
      }
    }
  }

  if (dirX === 0 && dirY === 0) {
    const rightCount = siblings.filter(
      (c) => c.position.x >= parent.position.x,
    ).length;
    const leftCount = siblings.filter(
      (c) => c.position.x < parent.position.x,
    ).length;
    dirX = rightCount <= leftCount ? 1 : -1;
  }

  const levelGap = H_GAP;
  const siblingGap = V_GAP;

  if (dirX !== 0) {
    const targetX = parent.position.x + dirX * levelGap;
    const sameSide = siblings.filter((s) =>
      dirX > 0
        ? s.position.x > parent.position.x - 10
        : s.position.x < parent.position.x + 10,
    );

    if (sameSide.length === 0) {
      return { x: targetX, y: parent.position.y };
    }

    let maxY = -Infinity;
    for (const sib of sameSide) {
      maxY = Math.max(maxY, getSubtreeMax(sib.id, allNodes, cm, 'y'));
    }
    return { x: targetX, y: maxY + siblingGap };
  }

  const targetY = parent.position.y + dirY * levelGap;
  const sameSide = siblings.filter((s) =>
    dirY > 0
      ? s.position.y > parent.position.y - 10
      : s.position.y < parent.position.y + 10,
  );

  if (sameSide.length === 0) {
    return { x: parent.position.x, y: targetY };
  }

  let maxX = -Infinity;
  for (const sib of sameSide) {
    maxX = Math.max(maxX, getSubtreeMax(sib.id, allNodes, cm, 'x'));
  }
  return { x: maxX + levelGap, y: targetY };
}

// ─── Custom Node ───

const HANDLE_STYLE: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  width: 8,
  height: 8,
  minWidth: 0,
  minHeight: 0,
};

function MindMapNode({
  id,
  data,
}: {
  id: string;
  data: Record<string, unknown>;
}) {
  const label = (data.label as string) || '';
  const isRoot = data.isRoot as boolean;
  const depth = (data.depth as number) ?? 0;
  const colorIndex = (data.colorIndex as number) ?? 0;
  const onLabelChange = data.onLabelChange as (id: string, l: string) => void;
  const onAddChild = data.onAddChild as (pid: string) => void;
  const onDelete = data.onDelete as (id: string) => void;

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(label);
  }, [label]);

  useEffect(() => {
    if (editing) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
    }
  }, [editing]);

  const color =
    colorIndex >= 0
      ? BRANCH_PALETTE[colorIndex % BRANCH_PALETTE.length]
      : null;
  const isMain = depth === 1;
  const isSub = depth >= 2;

  const nodeStyle: React.CSSProperties = isRoot
    ? {
        background: '#f3f4f6',
        borderColor: '#9ca3af',
        color: '#1f2937',
        borderWidth: 2,
        borderRadius: 14,
        padding: '14px 28px',
      }
    : isMain && color
      ? {
          background: color.bg,
          borderColor: color.border,
          color: color.text,
          borderWidth: 2,
          borderRadius: 12,
          padding: '10px 20px',
        }
      : {
          background: color?.bgLight ?? '#f9fafb',
          borderColor: color?.borderLight ?? '#e5e7eb',
          color: color?.text ?? '#374151',
          borderWidth: 1.5,
          borderRadius: 10,
          padding: '7px 14px',
        };

  const commit = () => {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed && trimmed !== label) {
      onLabelChange(id, trimmed);
    } else {
      setValue(label);
    }
  };

  const startEditing = () => {
    setEditing(true);
  };

  return (
    <div
      className="group relative"
      style={{
        ...nodeStyle,
        borderStyle: 'solid',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        minWidth: isRoot ? 140 : isSub ? 80 : 100,
        boxShadow: isRoot
          ? '0 4px 14px rgba(0,0,0,0.08)'
          : '0 2px 8px rgba(0,0,0,0.05)',
        transition: 'box-shadow 0.2s',
      }}
    >
      {/* 8 handles: all 4 directions × source + target */}
      <Handle type="source" position={Position.Top} id="top-source" style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Top} id="top-target" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Right} id="right-source" style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Right} id="right-target" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Bottom} id="bottom-source" style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Bottom} id="bottom-target" style={HANDLE_STYLE} />
      <Handle type="source" position={Position.Left} id="left-source" style={HANDLE_STYLE} />
      <Handle type="target" position={Position.Left} id="left-target" style={HANDLE_STYLE} />

      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') {
              setValue(label);
              setEditing(false);
            }
          }}
          className="w-full border-0 bg-transparent text-center font-bold outline-none"
          style={{
            fontFamily: 'inherit',
            color: 'inherit',
            fontSize: isRoot ? 18 : isSub ? 12 : 14,
            minWidth: 60,
          }}
        />
      ) : (
        <div
          className="flex items-center justify-center gap-1.5"
          onDoubleClick={startEditing}
        >
          <span
            className="cursor-default select-none text-center font-bold whitespace-nowrap"
            style={{ fontSize: isRoot ? 18 : isSub ? 12 : 14 }}
          >
            {label || (isRoot ? 'Double-click to name' : 'New')}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              startEditing();
            }}
            className="shrink-0 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-70 hover:!opacity-100"
            style={{ color: 'inherit' }}
            title="Rename"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Hover action buttons */}
      <div
        className="absolute -bottom-8 left-1/2 flex -translate-x-1/2 gap-1.5 opacity-0 transition-opacity group-hover:opacity-100"
        style={{ zIndex: 50 }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAddChild(id);
          }}
          className="flex h-5 w-5 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-110"
          style={{
            background: isRoot ? '#4b5563' : (color?.main ?? '#6b7280'),
            color: '#fff',
          }}
          title="Add branch"
        >
          <Plus className="h-3 w-3" />
        </button>
        {!isRoot && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(id);
            }}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-400 text-white shadow-lg transition-transform hover:scale-110 hover:bg-red-500"
            title="Delete"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

const mindMapNodeTypes: NodeTypes = {
  mindMapNode: MindMapNode as unknown as NodeTypes[string],
};

// ─── Saved data (supports old & new format) ───

interface SavedNode {
  id: string;
  position?: { x: number; y: number };
  label?: string;
  isRoot?: boolean;
  type?: string;
  data?: { label?: string; isRoot?: boolean };
}

interface SavedEdge {
  id: string;
  source: string;
  target: string;
}

function parseSavedNode(n: SavedNode): Node {
  return {
    id: n.id,
    type: 'mindMapNode',
    position: n.position ?? { x: 0, y: 0 },
    data: {
      label: n.label ?? n.data?.label ?? 'Untitled',
      isRoot: n.isRoot ?? n.data?.isRoot ?? false,
    },
  };
}

// ─── Main Component ───

export default function MindMapPanel({
  projectId,
  stageId,
  mindMap,
}: {
  projectId: string;
  stageId: string;
  mindMap: {
    id: string;
    content: unknown;
    updatedBy: { id: string; name: string } | null;
    updatedAt: string;
  } | null;
  onRefetch: () => void;
}) {
  const { addToast } = useToast();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rfRef = useRef<ReactFlowInstance | null>(null);

  // ── Bootstrap ──

  const [initialState] = useState(() => {
    const content = (mindMap?.content ?? {}) as {
      nodes?: SavedNode[];
      edges?: SavedEdge[];
    };
    const rawNodes: Node[] = content.nodes?.length
      ? content.nodes.map(parseSavedNode)
      : [
          {
            id: 'root',
            type: 'mindMapNode' as const,
            position: { x: 0, y: 0 },
            data: { label: 'Main Idea', isRoot: true },
          },
        ];
    const rawEdges: Edge[] = (content.edges ?? []).map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));
    return { nodes: layoutNodes(rawNodes, rawEdges), edges: rawEdges };
  });

  const [nodes, setNodes, onNodesChange] = useNodesState(initialState.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialState.edges);
  const nodeCounter = useRef(initialState.nodes.length);

  // ── Persist ──

  const saveMutation = useMutation({
    mutationFn: (payload: { nodes: Node[]; edges: Edge[] }) =>
      api.patch(
        `/api/v1/projects/${projectId}/stages/${stageId}/mindmap`,
        {
          content: {
            nodes: payload.nodes.map((n) => ({
              id: n.id,
              position: n.position,
              label: (n.data.label as string) || '',
              isRoot: n.data.isRoot as boolean,
            })),
            edges: payload.edges.map((e) => ({
              id: e.id,
              source: e.source,
              target: e.target,
            })),
          },
        },
      ),
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const scheduleSave = useCallback(
    (n: Node[], e: Edge[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(
        () => saveMutation.mutate({ nodes: n, edges: e }),
        1200,
      );
    },
    [saveMutation],
  );

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  // ── Actions (declared before memos that reference them) ──

  const doLayout = useCallback(
    (ns: Node[], es: Edge[]) => {
      const layouted = layoutNodes(ns, es);
      setNodes(layouted);
      setEdges(es);
      scheduleSave(layouted, es);
      setTimeout(
        () => rfRef.current?.fitView({ padding: 0.3, duration: 300 }),
        100,
      );
    },
    [setNodes, setEdges, scheduleSave],
  );

  const onLabelChange = useCallback(
    (nodeId: string, newLabel: string) => {
      setNodes((nds) => {
        const updated = nds.map((n) =>
          n.id === nodeId
            ? { ...n, data: { ...n.data, label: newLabel } }
            : n,
        );
        scheduleSave(updated, edges);
        return updated;
      });
    },
    [setNodes, edges, scheduleSave],
  );

  const onAddChild = useCallback(
    (parentId: string) => {
      nodeCounter.current += 1;
      const newId = `node-${nodeCounter.current}-${Date.now()}`;
      const newPos = findChildPosition(parentId, nodes, edges);
      const newNode: Node = {
        id: newId,
        type: 'mindMapNode',
        position: newPos,
        data: { label: 'Branch', isRoot: false },
      };
      const newEdge: Edge = {
        id: `e-${parentId}-${newId}`,
        source: parentId,
        target: newId,
      };
      const updatedNodes = [...nodes, newNode];
      const updatedEdges = [...edges, newEdge];
      setNodes(updatedNodes);
      setEdges(updatedEdges);
      scheduleSave(updatedNodes, updatedEdges);
    },
    [nodes, edges, setNodes, setEdges, scheduleSave],
  );

  const onDeleteNode = useCallback(
    (nodeId: string) => {
      const descendants = new Set<string>();
      const find = (id: string) => {
        descendants.add(id);
        edges
          .filter((e) => e.source === id)
          .forEach((e) => find(e.target));
      };
      find(nodeId);
      const updatedNodes = nodes.filter((n) => !descendants.has(n.id));
      const updatedEdges = edges.filter(
        (e) =>
          !descendants.has(e.source) && !descendants.has(e.target),
      );
      setNodes(updatedNodes);
      setEdges(updatedEdges);
      scheduleSave(updatedNodes, updatedEdges);
    },
    [nodes, edges, setNodes, setEdges, scheduleSave],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const newEdge: Edge = {
        id: `e-${connection.source}-${connection.target}`,
        source: connection.source!,
        target: connection.target!,
      };
      const updatedEdges = [...edges, newEdge];
      setEdges(updatedEdges);
      scheduleSave(nodes, updatedEdges);
    },
    [nodes, edges, setEdges, scheduleSave],
  );

  const handleNodeDragStop = useCallback(() => {
    scheduleSave(nodes, edges);
  }, [nodes, edges, scheduleSave]);

  const handleAutoLayout = useCallback(() => {
    doLayout(nodes, edges);
  }, [nodes, edges, doLayout]);

  // ── Derived display data ──

  const nodeInfo = useMemo(
    () => computeNodeInfo(nodes, edges),
    [nodes, edges],
  );

  const displayEdges = useMemo(() => {
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    return edges.map((e) => {
      const source = nodeMap.get(e.source);
      const target = nodeMap.get(e.target);
      if (!source || !target) return e;

      const { sourceHandle, targetHandle } = getBestHandles(
        source.position,
        target.position,
      );
      const ti = nodeInfo.get(e.target);
      const ci = ti?.colorIndex ?? 0;
      const strokeColor =
        ci >= 0
          ? BRANCH_PALETTE[ci % BRANCH_PALETTE.length].main
          : '#9ca3af';

      return {
        ...e,
        sourceHandle,
        targetHandle,
        type: 'default',
        style: { stroke: strokeColor, strokeWidth: 2.5 },
      };
    });
  }, [nodes, edges, nodeInfo]);

  const displayNodes = useMemo(() => {
    return nodes.map((n) => {
      const info = nodeInfo.get(n.id) ?? { colorIndex: 0, depth: 0 };
      return {
        ...n,
        data: {
          ...n.data,
          colorIndex: info.colorIndex,
          depth: info.depth,
          onLabelChange,
          onAddChild,
          onDelete: onDeleteNode,
        },
      };
    });
  }, [nodes, nodeInfo, onLabelChange, onAddChild, onDeleteNode]);

  // ── Fullscreen ──

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [isFullscreen]);

  useEffect(() => {
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isFullscreen]);

  useEffect(() => {
    setTimeout(() => rfRef.current?.fitView({ padding: 0.3, duration: 200 }), 150);
  }, [isFullscreen]);

  // ── Render ──

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-white'
          : 'relative h-full w-full'
      }
      style={isFullscreen ? undefined : { minHeight: '500px' }}
    >
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
        <button
          type="button"
          onClick={handleAutoLayout}
          className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-md ring-1 ring-gray-200 transition-colors hover:bg-gray-50 hover:text-gray-900"
          title="Auto arrange"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Organize
        </button>
        <button
          type="button"
          onClick={() => setIsFullscreen((v) => !v)}
          className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-md ring-1 ring-gray-200 transition-colors hover:bg-gray-50 hover:text-gray-900"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="h-3.5 w-3.5" />
              Exit
            </>
          ) : (
            <>
              <Maximize2 className="h-3.5 w-3.5" />
              Fullscreen
            </>
          )}
        </button>
      </div>

      <ReactFlow
        nodes={displayNodes}
        edges={displayEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStop={handleNodeDragStop}
        nodeTypes={mindMapNodeTypes}
        onInit={(instance) => {
          rfRef.current = instance;
        }}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={2}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="#e5e7eb"
        />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
