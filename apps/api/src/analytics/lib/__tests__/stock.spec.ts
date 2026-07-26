import { flagStockGaps } from '../stock';

describe('flagStockGaps', () => {
  const base = { productId: 'p1', sku: 'SKU-1', nameEn: 'One' };

  it('flags a product wanted by 2+ customers with zero inventory', () => {
    const [row] = flagStockGaps([{ ...base, customers: 3, inventory: 0 }]);
    expect(row.stockGap).toBe(true);
  });

  it('does not flag when inventory exists', () => {
    const [row] = flagStockGaps([{ ...base, customers: 9, inventory: 36 }]);
    expect(row.stockGap).toBe(false);
  });

  it('does not flag a single-customer product with no stock', () => {
    const [row] = flagStockGaps([{ ...base, customers: 1, inventory: 0 }]);
    expect(row.stockGap).toBe(false);
  });

  it('returns an empty array unchanged', () => {
    expect(flagStockGaps([])).toEqual([]);
  });
});
