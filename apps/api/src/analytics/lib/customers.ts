import type { CustomerSegment, CustomerSegmentRow } from '../types';

export interface RawCustomerRecency {
  customerId: string;
  customerCode: string;
  name: string;
  lastOrderAt: string | null;
}

export const ACTIVE_MAX_DAYS = 90;
export const AT_RISK_MAX_DAYS = 180;

const MS_PER_DAY = 86_400_000;

function classify(days: number | null): CustomerSegment {
  if (days === null) return 'NEVER_ORDERED';
  if (days <= ACTIVE_MAX_DAYS) return 'ACTIVE';
  if (days <= AT_RISK_MAX_DAYS) return 'AT_RISK';
  return 'DORMANT';
}

export function segmentCustomers(
  rows: RawCustomerRecency[],
  now: Date,
): CustomerSegmentRow[] {
  return rows.map((row) => {
    const days = row.lastOrderAt
      ? Math.floor((now.getTime() - new Date(row.lastOrderAt).getTime()) / MS_PER_DAY)
      : null;
    return { ...row, daysSinceLastOrder: days, segment: classify(days) };
  });
}
