import { computeQuotationTotals } from '../quotation-totals';

const base = { discountAmount: 0, vatEnabled: true, vatPercent: 15 };

describe('computeQuotationTotals', () => {
  it('multiplies each line and sums the subtotal', () => {
    const t = computeQuotationTotals({
      ...base,
      lines: [
        { quantity: 3, unitPrice: 10.5 },
        { quantity: 1, unitPrice: 100 },
      ],
    });
    expect(t.lineTotals).toEqual([31.5, 100]);
    expect(t.subtotal).toBe(131.5);
  });

  it('applies VAT to the net, not the subtotal', () => {
    const t = computeQuotationTotals({
      ...base,
      discountAmount: 10,
      lines: [{ quantity: 1, unitPrice: 100 }],
    });
    expect(t.net).toBe(90);
    expect(t.vat).toBe(13.5);
    expect(t.grandTotal).toBe(103.5);
  });

  it('clamps the discount to the subtotal', () => {
    const t = computeQuotationTotals({
      ...base,
      discountAmount: 500,
      lines: [{ quantity: 1, unitPrice: 100 }],
    });
    expect(t.discount).toBe(100);
    expect(t.net).toBe(0);
    expect(t.vat).toBe(0);
    expect(t.grandTotal).toBe(0);
  });

  it('clamps a negative discount to zero', () => {
    const t = computeQuotationTotals({
      ...base,
      discountAmount: -50,
      lines: [{ quantity: 1, unitPrice: 100 }],
    });
    expect(t.discount).toBe(0);
    expect(t.net).toBe(100);
  });

  it('derives the discount percentage', () => {
    const t = computeQuotationTotals({
      ...base,
      discountAmount: 25,
      lines: [{ quantity: 1, unitPrice: 100 }],
    });
    expect(t.discountPercent).toBe(25);
  });

  it('drops VAT entirely when disabled', () => {
    const t = computeQuotationTotals({
      ...base,
      vatEnabled: false,
      lines: [{ quantity: 2, unitPrice: 50 }],
    });
    expect(t.vat).toBe(0);
    expect(t.grandTotal).toBe(100);
  });

  it('treats a missing unit price as zero', () => {
    const t = computeQuotationTotals({
      ...base,
      lines: [{ quantity: 5, unitPrice: null }],
    });
    expect(t.lineTotals).toEqual([0]);
    expect(t.subtotal).toBe(0);
  });

  it('returns zeros for an empty quote without dividing by zero', () => {
    const t = computeQuotationTotals({ ...base, lines: [] });
    expect(t.subtotal).toBe(0);
    expect(t.discountPercent).toBe(0);
    expect(t.grandTotal).toBe(0);
    expect(Number.isNaN(t.discountPercent)).toBe(false);
  });

  it('rounds to two decimals rather than leaking float noise', () => {
    const t = computeQuotationTotals({
      ...base,
      lines: [{ quantity: 3, unitPrice: 0.1 }],
    });
    expect(t.subtotal).toBe(0.3);
  });
});
