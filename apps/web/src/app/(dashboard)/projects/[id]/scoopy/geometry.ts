import type { Zone } from './types';

export const RING_RATIOS: Record<Zone, number> = {
  core: 0.12,
  essentials: 0.22,
  optional: 0.32,
  brainstorm: 0.42,
};

const ZONE_ORDER: Zone[] = ['core', 'essentials', 'optional', 'brainstorm'];

export function getRingRadius(zone: Zone, containerSize: number): number {
  return containerSize * RING_RATIOS[zone];
}

export function getZoneByDistance(dist: number, containerSize: number): Zone {
  for (const zone of ZONE_ORDER) {
    if (dist <= getRingRadius(zone, containerSize)) return zone;
  }
  return 'brainstorm';
}

export function dist(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

export function getInnerZone(zone: Zone): Zone | null {
  const idx = ZONE_ORDER.indexOf(zone);
  return idx > 0 ? ZONE_ORDER[idx - 1] : null;
}

export function getOuterZone(zone: Zone): Zone | null {
  const idx = ZONE_ORDER.indexOf(zone);
  return idx < ZONE_ORDER.length - 1 ? ZONE_ORDER[idx + 1] : null;
}

export function randomPositionInZone(
  zone: Zone,
  containerSize: number,
): { x: number; y: number } {
  const maxR = getRingRadius(zone, containerSize) - 20;
  const prev = getInnerZone(zone);
  const minR = prev ? getRingRadius(prev, containerSize) + 10 : 10;
  const r = minR + Math.random() * Math.max(0, maxR - minR);
  const angle = Math.random() * Math.PI * 2;
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

export function snapPositionToZone(
  x: number,
  y: number,
  zone: Zone,
  containerSize: number,
): { x: number; y: number } {
  const d = dist(x, y);
  const maxR = getRingRadius(zone, containerSize);
  const prev = getInnerZone(zone);
  const minR = prev ? getRingRadius(prev, containerSize) : 0;
  const targetR = (maxR + minR) / 2;

  if (d === 0) {
    const angle = Math.random() * Math.PI * 2;
    return { x: Math.cos(angle) * targetR, y: Math.sin(angle) * targetR };
  }
  if (d > maxR || d < minR) {
    const scale = targetR / d;
    return { x: x * scale, y: y * scale };
  }
  return { x, y };
}

export function innerOfTwoZones(a: Zone, b: Zone): Zone {
  return ZONE_ORDER.indexOf(a) <= ZONE_ORDER.indexOf(b) ? a : b;
}
