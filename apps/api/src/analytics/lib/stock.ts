import type { ProductDemandRow } from '../types';

export interface RawDemandRow {
  productId: string;
  sku: string;
  nameEn: string;
  inventory: number;
  customers: number;
}

export const STOCK_GAP_MIN_CUSTOMERS = 2;

export function flagStockGaps(rows: RawDemandRow[]): ProductDemandRow[] {
  return rows.map((row) => ({
    ...row,
    stockGap: row.customers >= STOCK_GAP_MIN_CUSTOMERS && row.inventory === 0,
  }));
}
