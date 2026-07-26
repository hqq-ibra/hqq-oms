import type { StatusDwellRow } from '../types';

export interface RawStatusEntry {
  orderId: string;
  newStatus: string;
  changedAt: string;
}

const MS_PER_DAY = 86_400_000;

export function averageStatusDwell(entries: RawStatusEntry[]): StatusDwellRow[] {
  const byOrder = new Map<string, RawStatusEntry[]>();
  for (const entry of entries) {
    const list = byOrder.get(entry.orderId) ?? [];
    list.push(entry);
    byOrder.set(entry.orderId, list);
  }

  const totals = new Map<string, { days: number; samples: number }>();

  for (const list of byOrder.values()) {
    list.sort((a, b) => a.changedAt.localeCompare(b.changedAt));
    for (let i = 0; i < list.length - 1; i++) {
      const days =
        (new Date(list[i + 1].changedAt).getTime() - new Date(list[i].changedAt).getTime()) /
        MS_PER_DAY;
      const bucket = totals.get(list[i].newStatus) ?? { days: 0, samples: 0 };
      bucket.days += days;
      bucket.samples += 1;
      totals.set(list[i].newStatus, bucket);
    }
  }

  return [...totals.entries()]
    .map(([status, { days, samples }]) => ({
      status,
      averageDays: Math.round((days / samples) * 100) / 100,
      samples,
    }))
    .sort((a, b) => b.averageDays - a.averageDays);
}
