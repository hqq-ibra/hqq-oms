import type { CostBreakdownRow, MonthlyMoneyRow } from '../types';

export const REVENUE_COST_TYPE = 'SELLING_PRICE';

export function buildMonthlyMoney(rows: CostBreakdownRow[]): MonthlyMoneyRow[] {
  const buckets = new Map<string, MonthlyMoneyRow>();

  for (const row of rows) {
    const key = `${row.month}|${row.currency}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        month: row.month,
        currency: row.currency,
        revenue: 0,
        cost: 0,
        margin: null,
        marginPct: null,
      };
      buckets.set(key, bucket);
    }
    if (row.costType === REVENUE_COST_TYPE) bucket.revenue += row.total;
    else bucket.cost += row.total;
  }

  for (const bucket of buckets.values()) {
    if (bucket.revenue > 0) {
      bucket.margin = bucket.revenue - bucket.cost;
      bucket.marginPct = Math.round((bucket.margin / bucket.revenue) * 10000) / 100;
    }
  }

  return [...buckets.values()].sort(
    (a, b) => a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency),
  );
}
