export type Zone = 'core' | 'essentials' | 'optional' | 'brainstorm';

export interface Idea {
  id: string;
  /** اسم الفكرة (يظهر على الكرة) */
  text: string;
  /** شرح الفكرة (يظهر عند الضغط على الفكرة في اللوحة الجانبية) */
  description?: string;
  zone: Zone;
  x: number;
  y: number;
  color: string;
  impact: number;
  effort: number;
  createdAt: number;
  updatedAt: number;
}

/** حجم الكرة حسب المنطقة + طول اسم الفكرة (يكبر مع النص) */
export function getBubbleSize(idea: Idea): number {
  const base = ZONE_CONFIG[idea.zone].bubbleSize;
  const textLen = (idea.text?.length ?? 0);
  const extra = Math.min(100, textLen * 6);
  return Math.min(220, Math.max(base, base + extra));
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
  label?: string;
  createdAt: number;
}

export const ZONES: Zone[] = ['core', 'essentials', 'optional', 'brainstorm'];

export const ZONE_CONFIG: Record<
  Zone,
  {
    stroke: string;
    glow: string;
    label: string;
    bubbleSize: number;
    zoneWeight: number;
    ringBonus: number;
  }
> = {
  core: {
    stroke: '#D4A843',
    glow: 'rgba(212,168,67,0.35)',
    label: 'CORE',
    bubbleSize: 86,
    zoneWeight: 3,
    ringBonus: 2,
  },
  essentials: {
    stroke: '#22D3EE',
    glow: 'rgba(34,211,238,0.25)',
    label: 'ESSENTIALS',
    bubbleSize: 70,
    zoneWeight: 2,
    ringBonus: 1,
  },
  optional: {
    stroke: '#A78BFA',
    glow: 'rgba(167,139,250,0.25)',
    label: 'OPTIONAL',
    bubbleSize: 60,
    zoneWeight: 1,
    ringBonus: 0,
  },
  brainstorm: {
    stroke: '#6B7280',
    glow: 'rgba(107,114,128,0.2)',
    label: 'BRAINSTORM',
    bubbleSize: 52,
    zoneWeight: 0,
    ringBonus: -1,
  },
};

export const BUBBLE_PALETTE = [
  '#60A5FA',
  '#34D399',
  '#F472B6',
  '#FBBF24',
  '#A78BFA',
  '#F87171',
  '#2DD4BF',
  '#FB923C',
  '#818CF8',
  '#4ADE80',
];
