/**
 * Display-only copy of apps/api/src/orders/quotation-totals.ts (which is the
 * tested, authoritative version — apps/web has no test runner).
 * Used for optimistic totals while typing; every server response overwrites
 * these numbers, so a divergent copy self-corrects within one save.
 */

export interface QuotationLineInput {
  quantity: number;
  unitPrice: number | null;
}

export interface QuotationTotalsInput {
  lines: QuotationLineInput[];
  discountAmount: number;
  vatEnabled: boolean;
  vatPercent: number;
}

export interface QuotationTotals {
  lineTotals: number[];
  subtotal: number;
  discount: number;
  discountPercent: number;
  net: number;
  vat: number;
  grandTotal: number;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeQuotationTotals(
  input: QuotationTotalsInput,
): QuotationTotals {
  const lineTotals = input.lines.map((l) =>
    round2((l.quantity || 0) * (l.unitPrice ?? 0)),
  );
  const subtotal = round2(lineTotals.reduce((sum, t) => sum + t, 0));

  const discount = round2(
    Math.min(Math.max(input.discountAmount || 0, 0), subtotal),
  );
  const discountPercent =
    subtotal > 0 ? round2((discount / subtotal) * 100) : 0;

  const net = round2(subtotal - discount);
  const vat = input.vatEnabled
    ? round2((net * (input.vatPercent || 0)) / 100)
    : 0;
  const grandTotal = round2(net + vat);

  return { lineTotals, subtotal, discount, discountPercent, net, vat, grandTotal };
}
