'use client';

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import { motion, useMotionValue, animate, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Volume2,
  VolumeX,
  Undo2,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  Trash2,
  X,
  Zap,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useScoopyStore, generateUnexpectedIdea } from './store';
import { ZONE_CONFIG, ZONES, BUBBLE_PALETTE, getBubbleSize, type Zone, type Idea } from './types';
import { getRingRadius, getZoneByDistance, dist } from './geometry';
import { soundManager } from './sound';

/* ================================================================
   Helpers
   ================================================================ */

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function getEvolution(idea: Idea): number {
  return Math.max(
    0,
    Math.min(3, idea.impact - idea.effort + ZONE_CONFIG[idea.zone].ringBonus),
  );
}

/** عرض اسم الفكرة على الكرة (بدون اقتطاع قاسي، مع دعم سطرين) */
function displayTitle(text: string): string {
  return text?.trim() || '';
}

/* ================================================================
   IdeaBubble
   ================================================================ */

interface BubbleProps {
  idea: Idea;
  cx: number;
  cy: number;
  isSelected: boolean;
  isMergeTarget: boolean;
  mergeReady: boolean;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, x: number, y: number, vel: number) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onClick: (id: string, shift: boolean) => void;
}

const IdeaBubble = React.memo(function IdeaBubble(props: BubbleProps) {
  const {
    idea,
    cx,
    cy,
    isSelected,
    isMergeTarget,
    mergeReady,
    onDragStart,
    onDragMove,
    onDragEnd,
    onClick,
  } = props;

  const size = getBubbleSize(idea);
  const evolution = getEvolution(idea);
  const [r, g, b] = hexToRgb(idea.color);
  const glowAlpha = 0.3 + evolution * 0.1;
  const glowSize = 12 + evolution * 6;

  const [isDragging, setIsDragging] = useState(false);
  const [hovered, setHovered] = useState(false);

  const mx = useMotionValue(idea.x);
  const my = useMotionValue(idea.y);

  const drag = useRef({
    startPtrX: 0,
    startPtrY: 0,
    startIdX: 0,
    startIdY: 0,
    prevPtrX: 0,
    prevPtrY: 0,
    prevTime: 0,
    didDrag: false,
    pid: -1,
  });

  useEffect(() => {
    if (!isDragging) {
      animate(mx, idea.x, { type: 'spring', stiffness: 400, damping: 30 });
      animate(my, idea.y, { type: 'spring', stiffness: 400, damping: 30 });
    }
  }, [idea.x, idea.y, isDragging, mx, my]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      drag.current = {
        startPtrX: e.clientX,
        startPtrY: e.clientY,
        startIdX: mx.get(),
        startIdY: my.get(),
        prevPtrX: e.clientX,
        prevPtrY: e.clientY,
        prevTime: Date.now(),
        didDrag: false,
        pid: e.pointerId,
      };
      setIsDragging(true);
      onDragStart(idea.id);
    },
    [idea.id, mx, my, onDragStart],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerId !== drag.current.pid || !isDragging) return;
      e.preventDefault();
      const d = drag.current;
      const dx = e.clientX - d.startPtrX;
      const dy = e.clientY - d.startPtrY;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.didDrag = true;

      const newX = d.startIdX + dx;
      const newY = d.startIdY + dy;
      mx.set(newX);
      my.set(newY);

      const now = Date.now();
      const dt = Math.max(1, now - d.prevTime);
      const vel = Math.sqrt(
        ((e.clientX - d.prevPtrX) / dt) ** 2 +
          ((e.clientY - d.prevPtrY) / dt) ** 2,
      );
      d.prevPtrX = e.clientX;
      d.prevPtrY = e.clientY;
      d.prevTime = now;
      onDragMove(idea.id, newX, newY, vel);
    },
    [isDragging, idea.id, mx, my, onDragMove],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerId !== drag.current.pid) return;
      setIsDragging(false);
      if (!drag.current.didDrag) {
        onClick(idea.id, e.shiftKey);
      } else {
        onDragEnd(idea.id, mx.get(), my.get());
      }
      drag.current.pid = -1;
    },
    [idea.id, mx, my, onClick, onDragEnd],
  );

  const handleLostCapture = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);
      onDragEnd(idea.id, mx.get(), my.get());
    }
  }, [isDragging, idea.id, mx, my, onDragEnd]);

  const floatDur = 2.5 + (idea.createdAt % 15) * 0.1;

  return (
    <motion.div
      style={{
        position: 'absolute',
        left: cx - size / 2,
        top: cy - size / 2,
        x: mx,
        y: my,
        zIndex: isDragging ? 100 : isSelected ? 50 : 10,
        touchAction: 'none',
        cursor: isDragging ? 'grabbing' : 'grab',
        width: size,
        height: size,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onLostPointerCapture={handleLostCapture}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Float wrapper */}
      <div
        className={isDragging ? '' : 'scoopy-float'}
        style={
          {
            width: size,
            height: size,
            '--float-dur': `${floatDur}s`,
          } as React.CSSProperties
        }
      >
        {/* Scale wrapper */}
        <motion.div
          className="relative h-full w-full rounded-full flex items-center justify-center select-none"
          animate={{
            scale: isDragging ? 1.08 : hovered || isSelected ? 1.04 : 1,
          }}
          transition={{ type: 'spring', stiffness: 400, damping: 25 }}
          style={{
            background: `radial-gradient(circle at 35% 35%, rgba(${r},${g},${b},0.25), rgba(${r},${g},${b},0.08))`,
            border: `1.5px solid rgba(${r},${g},${b},0.3)`,
            boxShadow: `0 0 ${glowSize}px rgba(${r},${g},${b},${glowAlpha}), inset 0 0 ${6 + evolution * 3}px rgba(${r},${g},${b},0.12)`,
          }}
        >
          {/* Evolution halo */}
          {evolution >= 2 && (
            <div
              className="absolute rounded-full pointer-events-none"
              style={{
                inset: -3,
                border: `1px solid rgba(${r},${g},${b},0.25)`,
                boxShadow: `0 0 ${4 + evolution * 2}px rgba(${r},${g},${b},0.15)`,
                borderRadius: '50%',
              }}
            />
          )}

          {/* Selected ring */}
          {isSelected && !isDragging && (
            <motion.div
              className="absolute rounded-full pointer-events-none"
              style={{
                inset: -4,
                border: '1.5px solid rgba(255,255,255,0.4)',
                borderRadius: '50%',
              }}
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          )}

          {/* اسم الفكرة — واضح وكبير، يتكيف مع حجم الكرة */}
          <span
            className="relative z-10 text-center text-white font-medium leading-snug px-3 py-1 pointer-events-none block max-w-full line-clamp-2 break-words"
            style={{
              fontSize: Math.max(14, Math.min(20, 10 + size / 8)),
              textShadow: '0 0 12px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)',
            }}
            dir="auto"
          >
            {displayTitle(idea.text)}
          </span>

          {/* Merge target overlay */}
          {isMergeTarget && (
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-white/40 flex items-center justify-center"
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 0.6, repeat: Infinity }}
            >
              {mergeReady && (
                <span className="text-white text-[10px] font-bold bg-black/70 px-2 py-0.5 rounded-full">
                  Merge
                </span>
              )}
            </motion.div>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
});

/* ================================================================
   Board Rings (SVG)
   ================================================================ */

function BoardRings({
  width,
  height,
  containerSize,
  pulsingZone,
}: {
  width: number;
  height: number;
  containerSize: number;
  pulsingZone: Zone | null;
}) {
  const cx = width / 2;
  const cy = height / 2;

  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 1 }}
    >
      <defs>
        {ZONES.map((zone) => (
          <filter
            key={zone}
            id={`glow-${zone}`}
            x="-50%"
            y="-50%"
            width="200%"
            height="200%"
          >
            <feGaussianBlur
              stdDeviation={zone === 'core' ? 4 : 3}
              result="blur"
            />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        ))}
      </defs>

      {ZONES.map((zone) => {
        const radius = getRingRadius(zone, containerSize);
        const cfg = ZONE_CONFIG[zone];
        const pulsing = pulsingZone === zone;
        return (
          <g key={zone}>
            <circle
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={cfg.stroke}
              strokeWidth={pulsing ? 2.5 : 1.5}
              opacity={pulsing ? 0.8 : 0.5}
              filter={`url(#glow-${zone})`}
              style={{
                transition: 'stroke-width 0.25s, opacity 0.25s',
              }}
            />
            <text
              x={cx}
              y={cy - radius - 8}
              textAnchor="middle"
              fill="rgba(255,255,255,0.45)"
              fontSize={10}
              fontWeight={500}
              fontFamily="system-ui, sans-serif"
              letterSpacing={1.5}
            >
              {cfg.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ================================================================
   Connection Lines (SVG)
   ================================================================ */

function ConnectionLines({
  width,
  height,
  cx,
  cy,
}: {
  width: number;
  height: number;
  cx: number;
  cy: number;
}) {
  const connections = useScoopyStore((s) => s.connections);
  const ideas = useScoopyStore((s) => s.ideas);

  return (
    <svg
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 2, width, height }}
    >
      {connections.map((conn) => {
        const from = ideas.find((i) => i.id === conn.fromId);
        const to = ideas.find((i) => i.id === conn.toId);
        if (!from || !to) return null;

        const x1 = cx + from.x;
        const y1 = cy + from.y;
        const x2 = cx + to.x;
        const y2 = cy + to.y;

        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;
        const dx = x2 - x1;
        const dy = y2 - y1;
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const offset = Math.min(30, len * 0.15);
        const ctrlX = midX + (-dy / len) * offset;
        const ctrlY = midY + (dx / len) * offset;

        return (
          <g key={conn.id}>
            <path
              d={`M ${x1} ${y1} Q ${ctrlX} ${ctrlY} ${x2} ${y2}`}
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            {conn.label && (
              <text
                x={ctrlX}
                y={ctrlY - 6}
                textAnchor="middle"
                fill="rgba(255,255,255,0.35)"
                fontSize={9}
                fontFamily="system-ui, sans-serif"
              >
                {conn.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ================================================================
   Edit Side Panel
   ================================================================ */

function EditSidePanel({
  idea,
  onClose,
}: {
  idea: Idea;
  onClose: () => void;
}) {
  const updateIdea = useScoopyStore((s) => s.updateIdea);
  const deleteIdea = useScoopyStore((s) => s.deleteIdea);
  const moveInward = useScoopyStore((s) => s.moveInward);
  const moveOutward = useScoopyStore((s) => s.moveOutward);

  const [text, setText] = useState(idea.text);
  const [description, setDescription] = useState(idea.description ?? '');
  const [impact, setImpact] = useState(idea.impact);
  const [effort, setEffort] = useState(idea.effort);

  useEffect(() => {
    setText(idea.text);
    setDescription(idea.description ?? '');
    setImpact(idea.impact);
    setEffort(idea.effort);
  }, [idea.id, idea.text, idea.description, idea.impact, idea.effort]);

  const save = () => updateIdea(idea.id, { text, description: description || undefined, impact, effort });

  return (
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
      className="absolute top-0 right-0 h-full w-72 bg-black/80 backdrop-blur-xl border-l border-white/10 z-[200] flex flex-col"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <h3 className="text-white/90 text-sm font-semibold">تعديل الفكرة</h3>
        <button
          onClick={onClose}
          className="text-white/40 hover:text-white/70 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div>
          <label className="block text-white/50 text-[10px] uppercase tracking-wider mb-1.5">
            اسم الفكرة
          </label>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={save}
            rows={2}
            dir="auto"
            placeholder="اسم الفكرة يظهر على الكرة"
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:border-white/25 resize-none"
          />
        </div>

        <div>
          <label className="block text-white/50 text-[10px] uppercase tracking-wider mb-1.5">
            شرح الفكرة
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={save}
            rows={6}
            dir="auto"
            placeholder="اكتب شرح الفكرة هنا. يظهر عند الضغط على الفكرة."
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:border-white/25 resize-y min-h-[120px]"
          />
        </div>

        <div>
          <label className="block text-white/50 text-[10px] uppercase tracking-wider mb-1.5">
            Impact <span className="text-white/80">{impact}</span>
          </label>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={impact}
            onChange={(e) => setImpact(Number(e.target.value))}
            onMouseUp={save}
            onTouchEnd={save}
            className="w-full accent-cyan-400"
          />
          <div className="flex justify-between text-[9px] text-white/30 mt-0.5">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>

        <div>
          <label className="block text-white/50 text-[10px] uppercase tracking-wider mb-1.5">
            Effort <span className="text-white/80">{effort}</span>
          </label>
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={effort}
            onChange={(e) => setEffort(Number(e.target.value))}
            onMouseUp={save}
            onTouchEnd={save}
            className="w-full accent-violet-400"
          />
          <div className="flex justify-between text-[9px] text-white/30 mt-0.5">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>

        <div>
          <label className="block text-white/50 text-[10px] uppercase tracking-wider mb-1.5">
            Color
          </label>
          <div className="flex gap-2 flex-wrap">
            {BUBBLE_PALETTE.map((color) => (
              <button
                key={color}
                onClick={() => updateIdea(idea.id, { color })}
                className="w-6 h-6 rounded-full transition-transform hover:scale-110"
                style={{
                  background: color,
                  boxShadow:
                    idea.color === color
                      ? `0 0 0 2px #000, 0 0 0 3.5px ${color}`
                      : 'none',
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <label className="block text-white/50 text-[10px] uppercase tracking-wider mb-1.5">
            Zone
          </label>
          <span
            className="text-sm font-medium"
            style={{ color: ZONE_CONFIG[idea.zone].stroke }}
          >
            {ZONE_CONFIG[idea.zone].label}
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-white/10 space-y-2">
        <div className="flex gap-2">
          <button
            onClick={() => {
              moveInward(idea.id);
              soundManager.chime();
            }}
            disabled={idea.zone === 'core'}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs py-2 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <ArrowUp size={14} /> Promote
          </button>
          <button
            onClick={() => {
              moveOutward(idea.id);
              soundManager.pop();
            }}
            disabled={idea.zone === 'brainstorm'}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs py-2 transition-colors disabled:opacity-30 disabled:pointer-events-none"
          >
            <ArrowDown size={14} /> Send Out
          </button>
        </div>
        <button
          onClick={() => {
            deleteIdea(idea.id);
            onClose();
          }}
          className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs py-2 transition-colors"
        >
          <Trash2 size={14} /> Delete Idea
        </button>
      </div>
    </motion.div>
  );
}

/* ================================================================
   Main ScoopyPanel
   ================================================================ */

export default function ScoopyPanel() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  const [isFullscreen, setIsFullscreen] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState('');
  const [addImpact, setAddImpact] = useState(3);
  const [addEffort, setAddEffort] = useState(3);

  const [pulsingZone, setPulsingZone] = useState<Zone | null>(null);
  const [collapseTopIds, setCollapseTopIds] = useState<string[] | null>(null);
  const [connectionSourceId, setConnectionSourceId] = useState<string | null>(
    null,
  );

  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [mergeReady, setMergeReady] = useState(false);
  const mergeTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mergeTargetRef = useRef<string | null>(null);
  const mergeReadyRef = useRef(false);

  const [unexpectedPrompt, setUnexpectedPrompt] = useState<{
    x: number;
    y: number;
    textA: string;
    textB: string;
  } | null>(null);
  const unexpectedRef = useRef(unexpectedPrompt);
  unexpectedRef.current = unexpectedPrompt;

  const isDraggingRef = useRef(false);
  const containerSizeRef = useRef(0);

  const ideas = useScoopyStore((s) => s.ideas);
  const selectedIdeaId = useScoopyStore((s) => s.selectedIdeaId);
  const soundEnabled = useScoopyStore((s) => s.soundEnabled);
  const collapsed = useScoopyStore((s) => s.collapsed);

  const cx = dims.w / 2;
  const cy = dims.h / 2;
  const containerSize = Math.min(dims.w, dims.h);
  containerSizeRef.current = containerSize;

  const cxRef = useRef(cx);
  const cyRef = useRef(cy);
  cxRef.current = cx;
  cyRef.current = cy;

  const ideasRef = useRef(ideas);
  ideasRef.current = ideas;

  /* ── Resize ── */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDims({ w: width, h: height });
      useScoopyStore.getState().setContainerSize(Math.min(width, height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── Sound sync ── */
  useEffect(() => {
    soundManager.setEnabled(soundEnabled);
  }, [soundEnabled]);

  const unlockSound = useCallback(() => soundManager.unlock(), []);

  /* ── Fullscreen ── */
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  /* ── Gravity ── */
  useEffect(() => {
    const iv = setInterval(() => {
      if (!isDraggingRef.current) {
        useScoopyStore.getState().applyGravity();
      }
    }, 2000);
    return () => clearInterval(iv);
  }, []);

  /* ── Keyboard ── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setAddOpen(true);
      }
      if (e.key === 'Delete') {
        const sel = useScoopyStore.getState().selectedIdeaId;
        if (sel) {
          e.preventDefault();
          useScoopyStore.getState().deleteIdea(sel);
        }
      }
      if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        useScoopyStore.getState().undo();
      }
      if (e.key === 'Escape') {
        useScoopyStore.getState().selectIdea(null);
        setConnectionSourceId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  /* ── Drag callbacks (stable via refs) ── */

  const handleDragStart = useCallback((id: string) => {
    isDraggingRef.current = true;
    soundManager.woosh();
    setUnexpectedPrompt(null);
  }, []);

  const handleDragMove = useCallback(
    (id: string, x: number, y: number, vel: number) => {
      const currentIdeas = ideasRef.current;
      const dragged = currentIdeas.find((i) => i.id === id);
      if (!dragged) return;

      let foundId: string | null = null;
      let foundIdea: Idea | null = null;

      for (const other of currentIdeas) {
        if (other.id === id) continue;
        const dx = x - other.x;
        const dy = y - other.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        const threshold =
          (getBubbleSize(dragged) + getBubbleSize(other)) / 2;
        if (d < threshold) {
          foundId = other.id;
          foundIdea = other;
          break;
        }
      }

      if (foundId && mergeTargetRef.current !== foundId) {
        mergeTargetRef.current = foundId;
        setMergeTargetId(foundId);
        mergeReadyRef.current = false;
        setMergeReady(false);
        clearTimeout(mergeTimerRef.current);
        mergeTimerRef.current = setTimeout(() => {
          mergeReadyRef.current = true;
          setMergeReady(true);
        }, 800);
      } else if (!foundId && mergeTargetRef.current) {
        mergeTargetRef.current = null;
        setMergeTargetId(null);
        mergeReadyRef.current = false;
        setMergeReady(false);
        clearTimeout(mergeTimerRef.current);
      }

      if (foundIdea && vel > 0.8 && !unexpectedRef.current) {
        setUnexpectedPrompt({
          x: cxRef.current + (x + foundIdea.x) / 2,
          y: cyRef.current + (y + foundIdea.y) / 2 - 40,
          textA: dragged.text,
          textB: foundIdea.text,
        });
      }
    },
    [],
  );

  const handleDragEnd = useCallback((id: string, x: number, y: number) => {
    isDraggingRef.current = false;

    if (mergeReadyRef.current && mergeTargetRef.current) {
      useScoopyStore.getState().mergeIdeas(id, mergeTargetRef.current);
      soundManager.sparkle();
      mergeTargetRef.current = null;
      setMergeTargetId(null);
      mergeReadyRef.current = false;
      setMergeReady(false);
      clearTimeout(mergeTimerRef.current);
      return;
    }

    mergeTargetRef.current = null;
    setMergeTargetId(null);
    mergeReadyRef.current = false;
    setMergeReady(false);
    clearTimeout(mergeTimerRef.current);

    const cs = containerSizeRef.current;
    const newZone = getZoneByDistance(dist(x, y), cs);
    useScoopyStore.getState().updateIdea(id, { x, y, zone: newZone });

    setPulsingZone(newZone);
    setTimeout(() => setPulsingZone(null), 250);

    if (newZone === 'core') soundManager.chime();
    else soundManager.plop();
  }, []);

  /* ── Bubble click / shift-click ── */

  const connectionSourceRef = useRef<string | null>(null);
  connectionSourceRef.current = connectionSourceId;
  const selectedRef = useRef(selectedIdeaId);
  selectedRef.current = selectedIdeaId;

  const handleBubbleClick = useCallback(
    (id: string, shift: boolean) => {
      soundManager.unlock();
      if (shift) {
        if (connectionSourceRef.current === null) {
          connectionSourceRef.current = id;
          setConnectionSourceId(id);
        } else if (connectionSourceRef.current !== id) {
          const label =
            window.prompt('Connection label (optional):') ?? undefined;
          useScoopyStore
            .getState()
            .addConnection(connectionSourceRef.current, id, label || undefined);
          connectionSourceRef.current = null;
          setConnectionSourceId(null);
        } else {
          connectionSourceRef.current = null;
          setConnectionSourceId(null);
        }
      } else {
        const next = selectedRef.current === id ? null : id;
        useScoopyStore.getState().selectIdea(next);
      }
    },
    [],
  );

  /* ── Add idea ── */
  const handleAddIdea = useCallback(() => {
    if (!addText.trim()) return;
    soundManager.unlock();
    useScoopyStore.getState().addIdea(addText.trim(), addImpact, addEffort);
    soundManager.pop();
    setAddText('');
    setAddImpact(3);
    setAddEffort(3);
    setAddOpen(false);
  }, [addText, addImpact, addEffort]);

  /* ── Collapse ── */
  const handleCollapse = useCallback(() => {
    soundManager.unlock();
    const topIds = useScoopyStore.getState().collapseScope();
    setCollapseTopIds(topIds);
    soundManager.focus();
  }, []);

  const handleRestore = useCallback(() => {
    useScoopyStore.getState().restoreScope();
    setCollapseTopIds(null);
  }, []);

  /* ── Unexpected idea ── */
  const handleUnexpectedIdea = useCallback(() => {
    if (!unexpectedPrompt) return;
    const text = generateUnexpectedIdea(
      unexpectedPrompt.textA,
      unexpectedPrompt.textB,
    );
    useScoopyStore.getState().addIdea(text, 3, 2);
    soundManager.sparkle();
    setUnexpectedPrompt(null);
  }, [unexpectedPrompt]);

  /* ── Selected idea object ── */
  const selectedIdea = useMemo(
    () => ideas.find((i) => i.id === selectedIdeaId) ?? null,
    [ideas, selectedIdeaId],
  );

  /* ── Background click ── */
  const handleBgClick = useCallback(() => {
    useScoopyStore.getState().selectIdea(null);
    setConnectionSourceId(null);
    soundManager.unlock();
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black overflow-hidden select-none"
      style={{ minHeight: 400 }}
      onClick={handleBgClick}
    >
      {/* Float keyframes */}
      <style>{`
        @keyframes scoopy-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }
        .scoopy-float {
          animation: scoopy-float var(--float-dur, 3s) ease-in-out infinite;
        }
      `}</style>

      {/* SVG Rings */}
      {containerSize > 0 && (
        <BoardRings
          width={dims.w}
          height={dims.h}
          containerSize={containerSize}
          pulsingZone={pulsingZone}
        />
      )}

      {/* SVG Connections */}
      {containerSize > 0 && (
        <ConnectionLines
          width={dims.w}
          height={dims.h}
          cx={cx}
          cy={cy}
        />
      )}

      {/* Idea Bubbles */}
      <div className="absolute inset-0" style={{ zIndex: 5 }}>
        <AnimatePresence>
          {ideas.map((idea) => {
            const isCollapsedOut =
              collapsed &&
              collapseTopIds != null &&
              !collapseTopIds.includes(idea.id);
            return (
              <motion.div
                key={idea.id}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{
                  opacity: isCollapsedOut ? 0.15 : 1,
                  scale: isCollapsedOut ? 0.9 : 1,
                }}
                exit={{ opacity: 0, scale: 0.3 }}
                transition={{ duration: 0.3 }}
              >
                <IdeaBubble
                  idea={idea}
                  cx={cx}
                  cy={cy}
                  isSelected={selectedIdeaId === idea.id}
                  isMergeTarget={mergeTargetId === idea.id}
                  mergeReady={mergeReady && mergeTargetId === idea.id}
                  onDragStart={handleDragStart}
                  onDragMove={handleDragMove}
                  onDragEnd={handleDragEnd}
                  onClick={handleBubbleClick}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* ── Top-Left Legend ── */}
      <div className="absolute top-3 left-3 z-[150] flex flex-col gap-2">
        <div className="bg-black/60 backdrop-blur-sm rounded-lg border border-white/10 px-3 py-2">
          <div className="space-y-1.5">
            {ZONES.map((zone) => (
              <div key={zone} className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    background: ZONE_CONFIG[zone].stroke,
                    opacity: 0.7,
                  }}
                />
                <span className="text-[10px] text-white/50 uppercase tracking-wider">
                  {ZONE_CONFIG[zone].label}
                </span>
              </div>
            ))}
          </div>
        </div>
        {connectionSourceId && (
          <div className="bg-cyan-500/20 backdrop-blur-sm rounded-lg border border-cyan-500/30 px-3 py-1.5">
            <span className="text-[10px] text-cyan-300">
              Shift+Click another bubble to connect
            </span>
          </div>
        )}
      </div>

      {/* ── Top-Right Controls ── */}
      <div className="absolute top-3 right-3 z-[150] flex gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation();
            useScoopyStore.getState().undo();
          }}
          className="w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={14} />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            useScoopyStore.getState().toggleSound();
            unlockSound();
          }}
          className="w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
          title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
        >
          {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFullscreen();
          }}
          className="w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
          title={isFullscreen ? 'Exit Fullscreen (Esc)' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm('Reset all ideas?'))
              useScoopyStore.getState().reset();
          }}
          className="w-8 h-8 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center text-white/40 hover:text-red-400/70 transition-colors"
          title="Reset"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* ── Bottom Bar ── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-[150] flex items-center gap-3">
        {!collapsed && ideas.length >= 3 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleCollapse();
            }}
            className="px-4 py-2 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 text-white/60 hover:text-white/90 hover:bg-white/10 text-xs font-medium transition-all"
          >
            <Zap size={12} className="inline mr-1.5" />
            Collapse the Scope
          </button>
        )}
        {collapsed && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleRestore();
            }}
            className="px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm border border-white/[0.15] text-white/80 hover:text-white hover:bg-white/15 text-xs font-medium transition-all"
          >
            Restore All
          </button>
        )}
      </div>

      {/* ── Add Button ── */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setAddOpen(true);
          unlockSound();
        }}
        className="absolute bottom-4 right-4 z-[150] w-12 h-12 rounded-full bg-white/10 backdrop-blur-sm border border-white/[0.15] flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 transition-all shadow-lg"
        title="Add Idea (N)"
      >
        <Plus size={20} />
      </button>

      {/* ── Side Panel ── */}
      <AnimatePresence>
        {selectedIdea && !collapsed && (
          <EditSidePanel
            key={selectedIdea.id}
            idea={selectedIdea}
            onClose={() => useScoopyStore.getState().selectIdea(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Add Idea Modal ── */}
      <AnimatePresence>
        {addOpen && (
          <motion.div
            className="absolute inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              e.stopPropagation();
              setAddOpen(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="bg-gray-900/95 backdrop-blur-xl border border-white/10 rounded-2xl p-6 w-80 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-white/90 font-semibold mb-4">New Idea</h3>

              <input
                type="text"
                value={addText}
                onChange={(e) => setAddText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddIdea();
                }}
                placeholder="Describe your idea..."
                autoFocus
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white/90 placeholder-white/30 focus:outline-none focus:border-white/25 mb-4"
              />

              <div className="space-y-3 mb-5">
                <div>
                  <label className="text-white/50 text-[10px] uppercase tracking-wider">
                    Impact: {addImpact}
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={addImpact}
                    onChange={(e) => setAddImpact(Number(e.target.value))}
                    className="w-full accent-cyan-400 mt-1"
                  />
                </div>
                <div>
                  <label className="text-white/50 text-[10px] uppercase tracking-wider">
                    Effort: {addEffort}
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={5}
                    step={1}
                    value={addEffort}
                    onChange={(e) => setAddEffort(Number(e.target.value))}
                    className="w-full accent-violet-400 mt-1"
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setAddOpen(false)}
                  className="flex-1 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddIdea}
                  disabled={!addText.trim()}
                  className="flex-1 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white/90 text-sm font-medium transition-colors disabled:opacity-30"
                >
                  Add to Brainstorm
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Collapse Overlay ── */}
      <AnimatePresence>
        {collapsed && collapseTopIds && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="absolute bottom-16 left-1/2 -translate-x-1/2 z-[200] bg-black/80 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-4 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-white/90 text-sm font-semibold mb-3 flex items-center gap-2">
              <Zap size={14} className="text-amber-400" /> Top 5 Core Ideas
            </h4>
            <div className="space-y-2">
              {collapseTopIds.map((id, i) => {
                const idea = ideas.find((ii) => ii.id === id);
                if (!idea) return null;
                return (
                  <div key={id} className="flex items-start gap-2">
                    <span className="text-white/30 text-xs font-mono mt-0.5">
                      {i + 1}.
                    </span>
                    <span className="text-white/80 text-sm">{idea.text}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Unexpected Idea Prompt ── */}
      <AnimatePresence>
        {unexpectedPrompt && (
          <motion.div
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            className="absolute z-[250]"
            style={{
              left: unexpectedPrompt.x - 60,
              top: unexpectedPrompt.y,
            }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleUnexpectedIdea();
              }}
              className="px-3 py-1.5 rounded-full bg-amber-500/20 backdrop-blur-sm border border-amber-500/30 text-amber-300 text-[11px] font-medium hover:bg-amber-500/30 transition-colors whitespace-nowrap"
            >
              ✨ Unexpected Idea?
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
