'use client';

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  type DragEvent,
} from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useToast } from '@/components/ui';
import {
  Maximize2,
  Minimize2,
  Trash2,
  Pencil,
  Palette,
  ArrowLeftRight,
} from 'lucide-react';
import {
  ReactFlow,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type Connection,
  type NodeTypes,
  type EdgeTypes,
  Handle,
  Position,
  BackgroundVariant,
  type ReactFlowInstance,
  MarkerType,
  ConnectionMode,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getStraightPath,
  getSmoothStepPath,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

// ═══════════════════════════════════════
// SHAPE DEFINITIONS
// ═══════════════════════════════════════

type ShapeType =
  | 'start'
  | 'end'
  | 'process'
  | 'decision';

interface ShapeDef {
  type: ShapeType;
  label: string;
  defaultW: number;
  defaultH: number;
  defaultColorIdx: number;
  defaultLabel: string;
}

const SHAPES: ShapeDef[] = [
  { type: 'start', label: 'Start', defaultW: 160, defaultH: 56, defaultColorIdx: 1, defaultLabel: 'Start' },
  { type: 'end', label: 'End', defaultW: 160, defaultH: 56, defaultColorIdx: 2, defaultLabel: 'End' },
  { type: 'process', label: 'Process', defaultW: 160, defaultH: 64, defaultColorIdx: 0, defaultLabel: '' },
  { type: 'decision', label: 'Decision', defaultW: 140, defaultH: 100, defaultColorIdx: 3, defaultLabel: '' },
];

const SHAPE_COLORS = [
  { name: 'Blue', bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  { name: 'Green', bg: '#dcfce7', border: '#22c55e', text: '#166534' },
  { name: 'Red', bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
  { name: 'Yellow', bg: '#fef9c3', border: '#eab308', text: '#854d0e' },
  { name: 'Purple', bg: '#f3e8ff', border: '#a855f7', text: '#6b21a8' },
  { name: 'Teal', bg: '#ccfbf1', border: '#14b8a6', text: '#115e59' },
  { name: 'Orange', bg: '#ffedd5', border: '#f97316', text: '#9a3412' },
  { name: 'Gray', bg: '#f3f4f6', border: '#6b7280', text: '#374151' },
];

const DEFAULT_COLOR = SHAPE_COLORS[0];

// ═══════════════════════════════════════
// SVG SHAPE RENDERERS
// ═══════════════════════════════════════

function StartSvg({ w, h, bg, border }: { w: number; h: number; bg: string; border: string }) {
  const r = h / 2;
  return (
    <svg width={w} height={h} className="absolute inset-0">
      <rect x={1.5} y={1.5} width={w - 3} height={h - 3} rx={r} ry={r} fill={bg} stroke={border} strokeWidth={2} />
      <polygon
        points={`${w / 2 - 5},${h / 2 - 7} ${w / 2 - 5},${h / 2 + 7} ${w / 2 + 7},${h / 2}`}
        fill={border}
        opacity={0.35}
      />
    </svg>
  );
}

function EndSvg({ w, h, bg, border }: { w: number; h: number; bg: string; border: string }) {
  const r = h / 2;
  const inset = 5;
  return (
    <svg width={w} height={h} className="absolute inset-0">
      <rect x={1.5} y={1.5} width={w - 3} height={h - 3} rx={r} ry={r} fill={bg} stroke={border} strokeWidth={2} />
      <rect x={inset + 1.5} y={inset + 1.5} width={w - 3 - inset * 2} height={h - 3 - inset * 2} rx={r - inset} ry={r - inset} fill="none" stroke={border} strokeWidth={1.5} />
    </svg>
  );
}

function ProcessSvg({ w, h, bg, border }: { w: number; h: number; bg: string; border: string }) {
  return (
    <svg width={w} height={h} className="absolute inset-0">
      <rect x={1.5} y={1.5} width={w - 3} height={h - 3} rx={6} ry={6} fill={bg} stroke={border} strokeWidth={2} />
    </svg>
  );
}

function DecisionSvg({ w, h, bg, border }: { w: number; h: number; bg: string; border: string }) {
  const cx = w / 2;
  const cy = h / 2;
  return (
    <svg width={w} height={h} className="absolute inset-0">
      <polygon
        points={`${cx},3 ${w - 3},${cy} ${cx},${h - 3} 3,${cy}`}
        fill={bg}
        stroke={border}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </svg>
  );
}

const SVG_RENDERERS: Record<ShapeType, React.FC<{ w: number; h: number; bg: string; border: string }>> = {
  start: StartSvg,
  end: EndSvg,
  process: ProcessSvg,
  decision: DecisionSvg,
};

// ═══════════════════════════════════════
// SMART HANDLE DETECTION
// ═══════════════════════════════════════

function getOptimalHandles(
  srcPos: { x: number; y: number },
  tgtPos: { x: number; y: number },
  srcSize: { w: number; h: number },
  tgtSize: { w: number; h: number },
): { sourceHandle: string; targetHandle: string } {
  const sx = srcPos.x + srcSize.w / 2;
  const sy = srcPos.y + srcSize.h / 2;
  const tx = tgtPos.x + tgtSize.w / 2;
  const ty = tgtPos.y + tgtSize.h / 2;

  const dx = tx - sx;
  const dy = ty - sy;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { sourceHandle: 'right', targetHandle: 'left' }
      : { sourceHandle: 'left', targetHandle: 'right' };
  }

  if (dy >= 0) {
    return { sourceHandle: 'bottom', targetHandle: 'top' };
  }

  // Backward: route through the side to create a visible loop
  if (dx <= 0) {
    return { sourceHandle: 'left', targetHandle: 'left' };
  }
  return { sourceHandle: 'right', targetHandle: 'right' };
}

// ═══════════════════════════════════════
// CUSTOM FLOWCHART NODE
// ═══════════════════════════════════════

const HANDLE_STYLE: React.CSSProperties = {
  width: 10,
  height: 10,
  background: '#3b82f6',
  border: '2px solid white',
  borderRadius: '50%',
  opacity: 0,
  transition: 'opacity 0.15s',
};

function FlowchartNode({
  id,
  data,
  selected,
}: {
  id: string;
  data: Record<string, unknown>;
  selected?: boolean;
}) {
  const shapeType = (data.shape as ShapeType) ?? 'process';
  const label = (data.label as string) ?? '';
  const colorIdx = (data.colorIdx as number) ?? 0;
  const w = (data.w as number) ?? 160;
  const h = (data.h as number) ?? 64;
  const onLabelChange = data.onLabelChange as (id: string, v: string) => void;
  const onColorChange = data.onColorChange as (id: string, ci: number) => void;
  const onDeleteNode = data.onDeleteNode as (id: string) => void;

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  const [showColors, setShowColors] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setValue(label); }, [label]);
  useEffect(() => {
    if (editing) setTimeout(() => { inputRef.current?.focus(); inputRef.current?.select(); }, 30);
  }, [editing]);

  const color = SHAPE_COLORS[colorIdx % SHAPE_COLORS.length] ?? DEFAULT_COLOR;
  const SvgShape = SVG_RENDERERS[shapeType] ?? ProcessSvg;

  const commit = () => {
    setEditing(false);
    const trimmed = value.trim();
    if (trimmed !== label) onLabelChange(id, trimmed);
    else setValue(label);
  };

  const isDecision = shapeType === 'decision';
  const textPadX = isDecision ? w * 0.22 : 12;
  const textPadY = isDecision ? h * 0.25 : 8;

  return (
    <div
      className="group relative"
      style={{ width: w, height: h }}
    >
      <SvgShape w={w} h={h} bg={color.bg} border={color.border} />

      {/* Handles */}
      <Handle type="source" position={Position.Top} id="top" style={{ ...HANDLE_STYLE, ...(selected ? { opacity: 1 } : {}) }} />
      <Handle type="target" position={Position.Top} id="top" style={{ ...HANDLE_STYLE, ...(selected ? { opacity: 1 } : {}) }} />
      <Handle type="source" position={Position.Right} id="right" style={{ ...HANDLE_STYLE, ...(selected ? { opacity: 1 } : {}) }} />
      <Handle type="target" position={Position.Right} id="right" style={{ ...HANDLE_STYLE, ...(selected ? { opacity: 1 } : {}) }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ ...HANDLE_STYLE, ...(selected ? { opacity: 1 } : {}) }} />
      <Handle type="target" position={Position.Bottom} id="bottom" style={{ ...HANDLE_STYLE, ...(selected ? { opacity: 1 } : {}) }} />
      <Handle type="source" position={Position.Left} id="left" style={{ ...HANDLE_STYLE, ...(selected ? { opacity: 1 } : {}) }} />
      <Handle type="target" position={Position.Left} id="left" style={{ ...HANDLE_STYLE, ...(selected ? { opacity: 1 } : {}) }} />

      {/* Text */}
      <div
        className="absolute flex items-center justify-center"
        style={{
          left: textPadX,
          right: textPadX,
          top: textPadY,
          bottom: textPadY,
        }}
      >
        {editing ? (
          <textarea
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commit(); }
              if (e.key === 'Escape') { setValue(label); setEditing(false); }
            }}
            className="h-full w-full resize-none border-0 bg-transparent text-center outline-none"
            style={{ color: color.text, fontSize: 13, fontWeight: 600, fontFamily: 'inherit', lineHeight: '1.3' }}
          />
        ) : (
          <div
            onDoubleClick={() => setEditing(true)}
            className="flex h-full w-full cursor-default items-center justify-center overflow-hidden text-center"
            style={{ color: color.text, fontSize: 13, fontWeight: 600, lineHeight: '1.3', wordBreak: 'break-word' }}
          >
            {label || (isDecision ? '?' : 'Double-click')}
          </div>
        )}
      </div>

      {/* Actions toolbar (on hover / selected) */}
      <div
        className="absolute -top-9 left-1/2 flex -translate-x-1/2 gap-1 rounded-lg bg-white px-1.5 py-1 shadow-lg ring-1 ring-gray-200 transition-opacity"
        style={{ opacity: selected ? 1 : 0, pointerEvents: selected ? 'auto' : 'none', zIndex: 50 }}
      >
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          title="Edit text"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowColors((v) => !v)}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            title="Change color"
          >
            <Palette className="h-3.5 w-3.5" />
          </button>
          {showColors && (
            <div className="absolute top-7 left-1/2 -translate-x-1/2 flex gap-1 rounded-lg bg-white p-1.5 shadow-xl ring-1 ring-gray-200" style={{ zIndex: 60 }}>
              {SHAPE_COLORS.map((c, i) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => { onColorChange(id, i); setShowColors(false); }}
                  className="h-5 w-5 rounded-full ring-1 ring-gray-200 transition-transform hover:scale-125"
                  style={{ background: c.border }}
                  title={c.name}
                />
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => onDeleteNode(id)}
          className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-600"
          title="Delete"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Hover handles visibility */}
      <style>{`
        .group:hover [class*="react-flow__handle"] { opacity: 1 !important; }
      `}</style>
    </div>
  );
}

const flowchartNodeTypes: NodeTypes = {
  flowchartNode: FlowchartNode as unknown as NodeTypes[string],
};

// ═══════════════════════════════════════
// CUSTOM LABELED EDGE
// ═══════════════════════════════════════

function LabeledEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
  markerEnd,
  selected,
}: {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: Position;
  targetPosition: Position;
  data?: Record<string, unknown>;
  style?: React.CSSProperties;
  markerEnd?: string;
  selected?: boolean;
}) {
  const edgeType = (data?.edgeType as string) ?? 'bezier';
  const label = (data?.label as string) ?? '';
  const onLabelChange = data?.onEdgeLabelChange as ((id: string, v: string) => void) | undefined;
  const onReverse = data?.onReverseEdge as ((id: string) => void) | undefined;

  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setValue(label); }, [label]);

  let edgePath: string;
  let labelX: number;
  let labelY: number;

  if (edgeType === 'straight') {
    [edgePath, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  } else if (edgeType === 'bezier') {
    [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  } else {
    [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, borderRadius: 8 });
  }

  const commitLabel = () => {
    setEditing(false);
    onLabelChange?.(id, value.trim());
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan"
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
        >
          <div className="flex items-center gap-1">
            {selected && onReverse && (
              <button
                type="button"
                onClick={() => onReverse(id)}
                className="rounded bg-white p-1 text-gray-400 shadow-sm ring-1 ring-gray-200 transition-colors hover:bg-blue-50 hover:text-blue-600 hover:ring-blue-300"
                title="Reverse direction"
              >
                <ArrowLeftRight className="h-3 w-3" />
              </button>
            )}
            {editing ? (
              <input
                ref={inputRef}
                autoFocus
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onBlur={commitLabel}
                onKeyDown={(e) => { if (e.key === 'Enter') commitLabel(); if (e.key === 'Escape') { setValue(label); setEditing(false); } }}
                className="rounded border border-blue-400 bg-white px-2 py-0.5 text-center text-xs font-medium text-gray-800 shadow-sm outline-none ring-2 ring-blue-200"
                style={{ minWidth: 40 }}
              />
            ) : (
              <button
                type="button"
                onDoubleClick={() => setEditing(true)}
                className="rounded bg-white px-1.5 py-0.5 text-xs font-medium shadow-sm ring-1 ring-gray-200 transition-colors hover:ring-blue-300"
                style={{ color: '#374151', minHeight: 18, opacity: label || selected ? 1 : 0 }}
                title="Double-click to add label"
              >
                {label || '...'}
              </button>
            )}
          </div>
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const flowchartEdgeTypes: EdgeTypes = {
  labeled: LabeledEdge as unknown as EdgeTypes[string],
};

// ═══════════════════════════════════════
// SHAPE PALETTE (LEFT SIDEBAR)
// ═══════════════════════════════════════

function ShapePreview({ type, size = 44 }: { type: ShapeType; size?: number }) {
  const Svg = SVG_RENDERERS[type];
  if (!Svg) return null;
  const def = SHAPES.find((s) => s.type === type)!;
  const color = SHAPE_COLORS[def.defaultColorIdx] ?? DEFAULT_COLOR;
  const aspect = def.defaultW / def.defaultH;
  const previewW = aspect >= 1 ? size : size * aspect;
  const previewH = aspect >= 1 ? size / aspect : size;
  return <Svg w={previewW} h={previewH} bg={color.bg} border={color.border} />;
}

function ShapePalette({ isFullscreen }: { isFullscreen: boolean }) {
  const onDragStart = (e: DragEvent, shapeType: ShapeType) => {
    e.dataTransfer.setData('application/flowchart-shape', shapeType);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className="flex flex-col gap-1 border-r border-gray-200 bg-gray-50/80 p-2"
      style={{ width: isFullscreen ? 160 : 140 }}
    >
      <p className="px-1 pb-1 text-[10px] font-semibold tracking-wide text-gray-400 uppercase">
        Shapes
      </p>
      {SHAPES.map((shape) => (
        <div
          key={shape.type}
          draggable
          onDragStart={(e) => onDragStart(e, shape.type)}
          className="flex cursor-grab items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-white hover:shadow-sm active:cursor-grabbing"
          title={`Drag to add ${shape.label}`}
        >
          <div className="relative flex h-8 w-10 items-center justify-center">
            <ShapePreview type={shape.type} size={36} />
          </div>
          <span className="text-[11px] font-medium text-gray-600">
            {shape.label}
          </span>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════
// SAVED DATA HELPERS
// ═══════════════════════════════════════

interface SavedFcNode {
  id: string;
  position: { x: number; y: number };
  shape: ShapeType;
  label: string;
  colorIdx: number;
  w?: number;
  h?: number;
}

interface SavedFcEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  label?: string;
  edgeType?: string;
}

function parseSavedFcNode(n: SavedFcNode): Node {
  const shape: ShapeType = (n.shape as string) === 'terminal' ? 'start' : n.shape;
  const def = SHAPES.find((s) => s.type === shape);
  return {
    id: n.id,
    type: 'flowchartNode',
    position: n.position,
    data: {
      shape,
      label: n.label ?? '',
      colorIdx: n.colorIdx ?? 0,
      w: n.w ?? def?.defaultW ?? 160,
      h: n.h ?? def?.defaultH ?? 64,
    },
  };
}

function parseSavedFcEdge(e: SavedFcEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    type: 'labeled',
    data: { label: e.label ?? '', edgeType: 'bezier' },
    markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#6b7280' },
    style: { stroke: '#6b7280', strokeWidth: 2 },
  };
}

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════

export default function FlowchartPanel({
  projectId,
  stageId,
  flowchart,
}: {
  projectId: string;
  stageId: string;
  flowchart: {
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
  const wrapperRef = useRef<HTMLDivElement>(null);

  // ── Fullscreen ──
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [isFullscreen]);

  useEffect(() => {
    document.body.style.overflow = isFullscreen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isFullscreen]);

  useEffect(() => {
    setTimeout(() => rfRef.current?.fitView({ padding: 0.3, duration: 200 }), 150);
  }, [isFullscreen]);

  // ── Bootstrap ──
  const [initialState] = useState(() => {
    const content = (flowchart?.content ?? {}) as {
      nodes?: SavedFcNode[];
      edges?: SavedFcEdge[];
    };
    const nodes: Node[] = (content.nodes ?? []).map(parseSavedFcNode);
    const edges: Edge[] = (content.edges ?? []).map(parseSavedFcEdge);
    return { nodes, edges };
  });

  const [nodes, setNodes, onNodesChange] = useNodesState(initialState.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialState.edges);
  const nodeCounter = useRef(initialState.nodes.length);

  // ── Persist ──
  const saveMutation = useMutation({
    mutationFn: (payload: { nodes: Node[]; edges: Edge[] }) =>
      api.patch(`/api/v1/projects/${projectId}/stages/${stageId}/flowchart`, {
        content: {
          nodes: payload.nodes.map((n) => ({
            id: n.id,
            position: n.position,
            shape: n.data.shape as string,
            label: (n.data.label as string) ?? '',
            colorIdx: (n.data.colorIdx as number) ?? 0,
            w: n.data.w as number,
            h: n.data.h as number,
          })),
          edges: payload.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            label: (e.data as Record<string, unknown>)?.label ?? '',
            edgeType: (e.data as Record<string, unknown>)?.edgeType ?? 'bezier',
          })),
        },
      }),
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const scheduleSave = useCallback(
    (n: Node[], e: Edge[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveMutation.mutate({ nodes: n, edges: e }), 1200);
    },
    [saveMutation],
  );

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  // ── Node actions ──
  const onLabelChange = useCallback(
    (nodeId: string, newLabel: string) => {
      setNodes((nds) => {
        const updated = nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, label: newLabel } } : n,
        );
        scheduleSave(updated, edges);
        return updated;
      });
    },
    [setNodes, edges, scheduleSave],
  );

  const onColorChange = useCallback(
    (nodeId: string, colorIdx: number) => {
      setNodes((nds) => {
        const updated = nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, colorIdx } } : n,
        );
        scheduleSave(updated, edges);
        return updated;
      });
    },
    [setNodes, edges, scheduleSave],
  );

  const onDeleteNode = useCallback(
    (nodeId: string) => {
      const updatedNodes = nodes.filter((n) => n.id !== nodeId);
      const updatedEdges = edges.filter((e) => e.source !== nodeId && e.target !== nodeId);
      setNodes(updatedNodes);
      setEdges(updatedEdges);
      scheduleSave(updatedNodes, updatedEdges);
    },
    [nodes, edges, setNodes, setEdges, scheduleSave],
  );

  // ── Edge actions ──
  const onEdgeLabelChange = useCallback(
    (edgeId: string, newLabel: string) => {
      setEdges((eds) => {
        const updated = eds.map((e) =>
          e.id === edgeId ? { ...e, data: { ...((e.data ?? {}) as object), label: newLabel } } : e,
        );
        scheduleSave(nodes, updated);
        return updated;
      });
    },
    [setEdges, nodes, scheduleSave],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const srcNode = nodes.find((n) => n.id === connection.source);
      const tgtNode = nodes.find((n) => n.id === connection.target);

      let srcHandle = connection.sourceHandle ?? 'bottom';
      let tgtHandle = connection.targetHandle ?? 'top';

      if (srcNode && tgtNode) {
        const handles = getOptimalHandles(
          srcNode.position,
          tgtNode.position,
          { w: (srcNode.data.w as number) ?? 160, h: (srcNode.data.h as number) ?? 64 },
          { w: (tgtNode.data.w as number) ?? 160, h: (tgtNode.data.h as number) ?? 64 },
        );
        srcHandle = handles.sourceHandle;
        tgtHandle = handles.targetHandle;
      }

      const newEdge: Edge = {
        id: `e-${connection.source}-${srcHandle}-${connection.target}-${tgtHandle}-${Date.now()}`,
        source: connection.source!,
        target: connection.target!,
        sourceHandle: srcHandle,
        targetHandle: tgtHandle,
        type: 'labeled',
        data: { label: '', edgeType: 'bezier' },
        markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#6b7280' },
        style: { stroke: '#6b7280', strokeWidth: 2 },
      };
      setEdges((eds) => {
        const updated = addEdge(newEdge, eds);
        scheduleSave(nodes, updated);
        return updated;
      });
    },
    [setEdges, nodes, scheduleSave],
  );

  const handleNodeDragStop = useCallback(() => {
    scheduleSave(nodes, edges);
  }, [nodes, edges, scheduleSave]);

  // ── Drag & drop from palette ──
  const onDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const shapeType = e.dataTransfer.getData('application/flowchart-shape') as ShapeType;
      if (!shapeType || !rfRef.current) return;

      const def = SHAPES.find((s) => s.type === shapeType);
      if (!def) return;

      const reactFlowBounds = wrapperRef.current?.getBoundingClientRect();
      if (!reactFlowBounds) return;

      const position = rfRef.current.screenToFlowPosition({
        x: e.clientX,
        y: e.clientY,
      });

      const ts = Date.now();
      nodeCounter.current += 1;
      const newNode: Node = {
        id: `fc-${nodeCounter.current}-${ts}`,
        type: 'flowchartNode',
        position: { x: position.x - def.defaultW / 2, y: position.y - def.defaultH / 2 },
        data: {
          shape: shapeType,
          label: def.defaultLabel,
          colorIdx: def.defaultColorIdx,
          w: def.defaultW,
          h: def.defaultH,
        },
      };

      if (shapeType === 'decision') {
        const procDef = SHAPES.find((s) => s.type === 'process')!;
        const cx = position.x - def.defaultW / 2;
        const cy = position.y - def.defaultH / 2;

        nodeCounter.current += 1;
        const yesId = `fc-${nodeCounter.current}-${ts + 1}`;
        const yesNode: Node = {
          id: yesId,
          type: 'flowchartNode',
          position: { x: cx + def.defaultW + 80, y: cy + (def.defaultH - procDef.defaultH) / 2 },
          data: { shape: 'process', label: '', colorIdx: 0, w: procDef.defaultW, h: procDef.defaultH },
        };

        nodeCounter.current += 1;
        const noId = `fc-${nodeCounter.current}-${ts + 2}`;
        const noNode: Node = {
          id: noId,
          type: 'flowchartNode',
          position: { x: cx + (def.defaultW - procDef.defaultW) / 2, y: cy + def.defaultH + 80 },
          data: { shape: 'process', label: '', colorIdx: 0, w: procDef.defaultW, h: procDef.defaultH },
        };

        const makeEdge = (src: string, srcH: string, tgt: string, tgtH: string, label: string): Edge => ({
          id: `e-${src}-${srcH}-${tgt}-${tgtH}-${ts}`,
          source: src,
          target: tgt,
          sourceHandle: srcH,
          targetHandle: tgtH,
          type: 'labeled',
          data: { label, edgeType: 'bezier' },
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#6b7280' },
          style: { stroke: '#6b7280', strokeWidth: 2 },
        });

        const yesEdge = makeEdge(newNode.id, 'right', yesId, 'left', 'Yes');
        const noEdge = makeEdge(newNode.id, 'bottom', noId, 'top', 'No');

        const updatedNodes = [...nodes, newNode, yesNode, noNode];
        const updatedEdges = [...edges, yesEdge, noEdge];
        setNodes(updatedNodes);
        setEdges(updatedEdges);
        scheduleSave(updatedNodes, updatedEdges);
      } else {
        const updatedNodes = [...nodes, newNode];
        setNodes(updatedNodes);
        scheduleSave(updatedNodes, edges);
      }
    },
    [nodes, edges, setNodes, setEdges, scheduleSave],
  );

  // ── Reverse edge direction ──
  const onReverseEdge = useCallback(
    (edgeId: string) => {
      setEdges((eds) => {
        const updated = eds.map((e) => {
          if (e.id !== edgeId) return e;

          const newSrc = nodes.find((n) => n.id === e.target);
          const newTgt = nodes.find((n) => n.id === e.source);

          let srcHandle = e.targetHandle;
          let tgtHandle = e.sourceHandle;

          if (newSrc && newTgt) {
            const handles = getOptimalHandles(
              newSrc.position,
              newTgt.position,
              { w: (newSrc.data.w as number) ?? 160, h: (newSrc.data.h as number) ?? 64 },
              { w: (newTgt.data.w as number) ?? 160, h: (newTgt.data.h as number) ?? 64 },
            );
            srcHandle = handles.sourceHandle;
            tgtHandle = handles.targetHandle;
          }

          return {
            ...e,
            source: e.target,
            target: e.source,
            sourceHandle: srcHandle,
            targetHandle: tgtHandle,
          };
        });
        scheduleSave(nodes, updated);
        return updated;
      });
    },
    [setEdges, nodes, scheduleSave],
  );

  // ── Display nodes with callbacks ──
  const displayNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        data: {
          ...n.data,
          onLabelChange,
          onColorChange,
          onDeleteNode,
        },
      })),
    [nodes, onLabelChange, onColorChange, onDeleteNode],
  );

  const displayEdges = useMemo(
    () =>
      edges.map((e) => ({
        ...e,
        data: { ...((e.data ?? {}) as object), onEdgeLabelChange, onReverseEdge },
      })),
    [edges, onEdgeLabelChange, onReverseEdge],
  );

  // ── Render ──
  return (
    <div
      ref={wrapperRef}
      className={isFullscreen ? 'fixed inset-0 z-50 flex bg-white' : 'relative flex h-full w-full'}
      style={isFullscreen ? undefined : { minHeight: '500px' }}
    >
      <ShapePalette isFullscreen={isFullscreen} />

      <div className="relative flex-1">
        <div className="absolute top-4 right-4 z-10">
          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-md ring-1 ring-gray-200 transition-colors hover:bg-gray-50 hover:text-gray-900"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <><Minimize2 className="h-3.5 w-3.5" /> Exit</>
            ) : (
              <><Maximize2 className="h-3.5 w-3.5" /> Fullscreen</>
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
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={flowchartNodeTypes}
          edgeTypes={flowchartEdgeTypes}
          defaultEdgeOptions={{
            type: 'labeled',
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: '#6b7280' },
            style: { stroke: '#6b7280', strokeWidth: 2 },
          }}
          connectionMode={ConnectionMode.Loose}
          onInit={(instance) => { rfRef.current = instance; }}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          deleteKeyCode="Delete"
          proOptions={{ hideAttribution: true }}
          minZoom={0.2}
          maxZoom={3}
          snapToGrid
          snapGrid={[10, 10]}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#d1d5db" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
