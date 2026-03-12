import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Idea, Connection, Zone } from './types';
import { ZONE_CONFIG, BUBBLE_PALETTE } from './types';
import {
  getZoneByDistance,
  dist,
  randomPositionInZone,
  innerOfTwoZones,
  getInnerZone,
  getOuterZone,
} from './geometry';

let _seq = 0;
function uid(): string {
  return `s${Date.now().toString(36)}_${(_seq++).toString(36)}`;
}

function mergeText(a: string, b: string): string {
  if (a.length + b.length < 40) return `${a} + ${b}`;
  const wa = a.split(/\s+/).slice(0, 3).join(' ');
  const wb = b.split(/\s+/).slice(0, 3).join(' ');
  return `${wa} + ${wb}`;
}

const TEMPLATES = [
  'What if we {b} the {a}?',
  'Consider a {a} layer that {b}s',
  '{a} meets {b}',
  'Reimagine {a} via {b}',
  'Auto-{b} for {a}',
  '{a} as a service',
  'Micro-{b} {a}',
  'Smart {a} engine',
  '{b} + {a} fusion',
  'Next-gen {a} system',
];

function keyword(text: string): string {
  const w = text.split(/\s+/).filter((s) => s.length > 2);
  return (
    w[Math.floor(Math.random() * w.length)] ||
    text.split(/\s+/)[0] ||
    'idea'
  );
}

export function generateUnexpectedIdea(tA: string, tB: string): string {
  const t = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  return t
    .replace(/\{a\}/g, keyword(tA))
    .replace(/\{b\}/g, keyword(tB).toLowerCase());
}

interface Snapshot {
  ideas: Idea[];
  connections: Connection[];
}

export interface ScoopyStore {
  ideas: Idea[];
  connections: Connection[];
  selectedIdeaId: string | null;
  soundEnabled: boolean;
  collapsed: boolean;
  snapshot: Snapshot | null;
  undoStack: Snapshot[];
  containerSize: number;

  setContainerSize: (s: number) => void;
  addIdea: (text: string, impact?: number, effort?: number) => void;
  updateIdea: (
    id: string,
    u: Partial<Omit<Idea, 'id' | 'createdAt'>>,
  ) => void;
  deleteIdea: (id: string) => void;
  selectIdea: (id: string | null) => void;
  mergeIdeas: (id1: string, id2: string) => Idea | null;
  addConnection: (fromId: string, toId: string, label?: string) => void;
  removeConnection: (id: string) => void;
  toggleSound: () => void;
  collapseScope: () => string[];
  restoreScope: () => void;
  moveInward: (id: string) => void;
  moveOutward: (id: string) => void;
  applyGravity: () => void;
  undo: () => void;
  reset: () => void;
}

function pushUndo(state: ScoopyStore): Snapshot[] {
  const snap: Snapshot = {
    ideas: structuredClone(state.ideas),
    connections: structuredClone(state.connections),
  };
  return [...state.undoStack.slice(-19), snap];
}

export const useScoopyStore = create<ScoopyStore>()(
  persist(
    (set, get) => ({
      ideas: [],
      connections: [],
      selectedIdeaId: null,
      soundEnabled: true,
      collapsed: false,
      snapshot: null,
      undoStack: [],
      containerSize: 0,

      setContainerSize: (s) => set({ containerSize: s }),

      addIdea: (text, impact = 3, effort = 3) => {
        const state = get();
        const cs = state.containerSize;
        const pos =
          cs > 0
            ? randomPositionInZone('brainstorm', cs)
            : { x: 0, y: 0 };
        const idea: Idea = {
          id: uid(),
          text,
          description: '',
          zone: 'brainstorm',
          x: pos.x,
          y: pos.y,
          color: BUBBLE_PALETTE[state.ideas.length % BUBBLE_PALETTE.length],
          impact,
          effort,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set({
          ideas: [...state.ideas, idea],
          undoStack: pushUndo(state),
        });
      },

      updateIdea: (id, updates) => {
        const state = get();
        set({
          ideas: state.ideas.map((i) =>
            i.id === id ? { ...i, ...updates, updatedAt: Date.now() } : i,
          ),
        });
      },

      deleteIdea: (id) => {
        const state = get();
        set({
          ideas: state.ideas.filter((i) => i.id !== id),
          connections: state.connections.filter(
            (c) => c.fromId !== id && c.toId !== id,
          ),
          selectedIdeaId:
            state.selectedIdeaId === id ? null : state.selectedIdeaId,
          undoStack: pushUndo(state),
        });
      },

      selectIdea: (id) => set({ selectedIdeaId: id }),

      mergeIdeas: (id1, id2) => {
        const state = get();
        const a = state.ideas.find((i) => i.id === id1);
        const b = state.ideas.find((i) => i.id === id2);
        if (!a || !b) return null;

        const zone = innerOfTwoZones(a.zone, b.zone);
        const cs = state.containerSize;
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const pos =
          cs > 0
            ? randomPositionInZone(zone, cs)
            : { x: mx, y: my };

        const merged: Idea = {
          id: uid(),
          text: mergeText(a.text, b.text),
          description: '',
          zone,
          x: pos.x,
          y: pos.y,
          color: a.color,
          impact: Math.max(a.impact, b.impact),
          effort: Math.round((a.effort + b.effort) / 2),
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };

        const now = Date.now();
        set({
          ideas: [...state.ideas, merged],
          connections: [
            ...state.connections,
            { id: uid(), fromId: a.id, toId: merged.id, label: 'parent', createdAt: now },
            { id: uid(), fromId: b.id, toId: merged.id, label: 'parent', createdAt: now },
          ],
          selectedIdeaId: merged.id,
          undoStack: pushUndo(state),
        });
        return merged;
      },

      addConnection: (fromId, toId, label) => {
        const state = get();
        const exists = state.connections.some(
          (c) =>
            (c.fromId === fromId && c.toId === toId) ||
            (c.fromId === toId && c.toId === fromId),
        );
        if (exists) return;
        set({
          connections: [
            ...state.connections,
            { id: uid(), fromId, toId, label, createdAt: Date.now() },
          ],
        });
      },

      removeConnection: (id) =>
        set((s) => ({
          connections: s.connections.filter((c) => c.id !== id),
        })),

      toggleSound: () => set((s) => ({ soundEnabled: !s.soundEnabled })),

      collapseScope: () => {
        const state = get();
        const snapshotData: Snapshot = {
          ideas: structuredClone(state.ideas),
          connections: structuredClone(state.connections),
        };

        const sorted = [...state.ideas].sort((ia, ib) => {
          const pa =
            ia.impact * 3 - ia.effort + ZONE_CONFIG[ia.zone].zoneWeight;
          const pb =
            ib.impact * 3 - ib.effort + ZONE_CONFIG[ib.zone].zoneWeight;
          return pb - pa;
        });
        const topIds = sorted.slice(0, 5).map((i) => i.id);
        const cs = state.containerSize;

        const updated = state.ideas.map((idea) => {
          if (!topIds.includes(idea.id)) return idea;
          const pos =
            cs > 0
              ? randomPositionInZone('core', cs)
              : { x: idea.x * 0.3, y: idea.y * 0.3 };
          return {
            ...idea,
            ...pos,
            zone: 'core' as Zone,
            updatedAt: Date.now(),
          };
        });

        set({ ideas: updated, collapsed: true, snapshot: snapshotData });
        return topIds;
      },

      restoreScope: () => {
        const state = get();
        if (state.snapshot) {
          set({
            ideas: state.snapshot.ideas,
            connections: state.snapshot.connections,
            collapsed: false,
            snapshot: null,
          });
        } else {
          set({ collapsed: false });
        }
      },

      moveInward: (id) => {
        const state = get();
        const idea = state.ideas.find((i) => i.id === id);
        if (!idea) return;
        const inner = getInnerZone(idea.zone);
        if (!inner) return;
        const cs = state.containerSize;
        const pos =
          cs > 0
            ? randomPositionInZone(inner, cs)
            : { x: idea.x * 0.7, y: idea.y * 0.7 };
        set({
          ideas: state.ideas.map((i) =>
            i.id === id
              ? { ...i, zone: inner, ...pos, updatedAt: Date.now() }
              : i,
          ),
          undoStack: pushUndo(state),
        });
      },

      moveOutward: (id) => {
        const state = get();
        const idea = state.ideas.find((i) => i.id === id);
        if (!idea) return;
        const outer = getOuterZone(idea.zone);
        if (!outer) return;
        const cs = state.containerSize;
        const pos =
          cs > 0
            ? randomPositionInZone(outer, cs)
            : { x: idea.x * 1.3, y: idea.y * 1.3 };
        set({
          ideas: state.ideas.map((i) =>
            i.id === id
              ? { ...i, zone: outer, ...pos, updatedAt: Date.now() }
              : i,
          ),
          undoStack: pushUndo(state),
        });
      },

      applyGravity: () => {
        const state = get();
        if (state.containerSize === 0 || state.collapsed) return;
        let changed = false;
        const updated = state.ideas.map((idea) => {
          if (idea.zone === 'core') return idea;
          const score = idea.impact * 2 - idea.effort;
          if (score < 6) return idea;
          const d = dist(idea.x, idea.y);
          if (d < 10) return idea;
          const move = 8 + Math.random() * 8;
          const scale = Math.max(0, 1 - move / d);
          const nx = idea.x * scale;
          const ny = idea.y * scale;
          const nz = getZoneByDistance(
            dist(nx, ny),
            state.containerSize,
          );
          changed = true;
          return { ...idea, x: nx, y: ny, zone: nz, updatedAt: Date.now() };
        });
        if (changed) set({ ideas: updated });
      },

      undo: () => {
        const state = get();
        if (state.undoStack.length === 0) return;
        const last = state.undoStack[state.undoStack.length - 1];
        set({
          ideas: last.ideas,
          connections: last.connections,
          undoStack: state.undoStack.slice(0, -1),
        });
      },

      reset: () =>
        set({
          ideas: [],
          connections: [],
          selectedIdeaId: null,
          collapsed: false,
          snapshot: null,
          undoStack: [],
        }),
    }),
    {
      name: 'scoopy_state_v1',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        ideas: state.ideas,
        connections: state.connections,
        soundEnabled: state.soundEnabled,
      }),
    },
  ),
);
