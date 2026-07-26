import { buildMonthlyMoney } from '../sales';

describe('buildMonthlyMoney', () => {
  it('returns null margin when no selling price exists', () => {
    const [row] = buildMonthlyMoney([
      { month: '2026-03', costType: 'FACTORY', currency: 'SAR', total: 930, count: 1 },
    ]);
    expect(row.cost).toBe(930);
    expect(row.revenue).toBe(0);
    expect(row.margin).toBeNull();
    expect(row.marginPct).toBeNull();
  });

  it('computes margin when a selling price exists', () => {
    const [row] = buildMonthlyMoney([
      { month: '2026-03', costType: 'SELLING_PRICE', currency: 'SAR', total: 1500, count: 1 },
      { month: '2026-03', costType: 'FACTORY', currency: 'SAR', total: 900, count: 1 },
    ]);
    expect(row.revenue).toBe(1500);
    expect(row.cost).toBe(900);
    expect(row.margin).toBe(600);
    expect(row.marginPct).toBe(40);
  });

  it('never sums across currencies', () => {
    const rows = buildMonthlyMoney([
      { month: '2026-03', costType: 'FACTORY', currency: 'SAR', total: 100, count: 1 },
      { month: '2026-03', costType: 'FACTORY', currency: 'USD', total: 50, count: 1 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.currency).sort()).toEqual(['SAR', 'USD']);
    expect(rows.find((r) => r.currency === 'SAR')!.cost).toBe(100);
    expect(rows.find((r) => r.currency === 'USD')!.cost).toBe(50);
  });

  it('returns an empty array for no data', () => {
    expect(buildMonthlyMoney([])).toEqual([]);
  });
});
