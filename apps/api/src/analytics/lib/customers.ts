import type { CustomerSegment, CustomerSegmentRow } from '../types';

export interface RawCustomerRecency {
  customerId: string;
  customerCode: string;
  name: string;
  // Prisma's $queryRaw returns a native Date for a `MAX(timestamp)` column in
  // production, while unit tests (and any pre-serialized source) feed ISO
  // strings. Accept both here; segmentCustomers() normalizes the output back
  // to the string | null wire contract declared by CustomerSegmentRow.
  lastOrderAt: string | Date | null;
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
    // new Date(x) accepts both a Date and an ISO string and yields an
    // equivalent Date either way, so the day math is identical regardless of
    // which shape Prisma or the caller handed us.
    const lastOrderDate = row.lastOrderAt ? new Date(row.lastOrderAt) : null;
    const days = lastOrderDate
      ? Math.floor((now.getTime() - lastOrderDate.getTime()) / MS_PER_DAY)
      : null;
    return {
      ...row,
      // Normalize to the string | null wire contract CustomerSegmentRow
      // declares — never pass a raw Date object through.
      lastOrderAt: lastOrderDate ? lastOrderDate.toISOString() : null,
      daysSinceLastOrder: days,
      segment: classify(days),
    };
  });
}
