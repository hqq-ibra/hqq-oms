import { segmentCustomers } from '../customers';

const NOW = new Date('2026-07-26T00:00:00.000Z');
const base = { customerId: 'c1', customerCode: 'C-001', name: 'Acme' };

describe('segmentCustomers', () => {
  it('marks a customer who ordered 10 days ago as ACTIVE', () => {
    const [row] = segmentCustomers([{ ...base, lastOrderAt: '2026-07-16T00:00:00.000Z' }], NOW);
    expect(row.segment).toBe('ACTIVE');
    expect(row.daysSinceLastOrder).toBe(10);
  });

  it('marks 120 days as AT_RISK', () => {
    const [row] = segmentCustomers([{ ...base, lastOrderAt: '2026-03-28T00:00:00.000Z' }], NOW);
    expect(row.segment).toBe('AT_RISK');
  });

  it('marks 300 days as DORMANT', () => {
    const [row] = segmentCustomers([{ ...base, lastOrderAt: '2025-09-29T00:00:00.000Z' }], NOW);
    expect(row.segment).toBe('DORMANT');
  });

  it('marks a customer with no orders as NEVER_ORDERED with null days', () => {
    const [row] = segmentCustomers([{ ...base, lastOrderAt: null }], NOW);
    expect(row.segment).toBe('NEVER_ORDERED');
    expect(row.daysSinceLastOrder).toBeNull();
  });

  it('handles a Date object input the same as the equivalent ISO string', () => {
    const iso = '2026-03-28T00:00:00.000Z';
    const [fromString] = segmentCustomers([{ ...base, lastOrderAt: iso }], NOW);
    const [fromDate] = segmentCustomers([{ ...base, lastOrderAt: new Date(iso) }], NOW);
    expect(fromDate.daysSinceLastOrder).toBe(fromString.daysSinceLastOrder);
    expect(fromDate.segment).toBe(fromString.segment);
  });

  it('returns lastOrderAt as a string, not a Date, when a Date object went in', () => {
    const [row] = segmentCustomers([{ ...base, lastOrderAt: new Date('2026-03-28T00:00:00.000Z') }], NOW);
    expect(typeof row.lastOrderAt).toBe('string');
    expect(row.lastOrderAt).toBe('2026-03-28T00:00:00.000Z');
  });

  it('marks exactly 90 days as ACTIVE (boundary)', () => {
    const [row] = segmentCustomers([{ ...base, lastOrderAt: '2026-04-27T00:00:00.000Z' }], NOW);
    expect(row.daysSinceLastOrder).toBe(90);
    expect(row.segment).toBe('ACTIVE');
  });

  it('marks exactly 91 days as AT_RISK (boundary)', () => {
    const [row] = segmentCustomers([{ ...base, lastOrderAt: '2026-04-26T00:00:00.000Z' }], NOW);
    expect(row.daysSinceLastOrder).toBe(91);
    expect(row.segment).toBe('AT_RISK');
  });

  it('marks exactly 180 days as AT_RISK (boundary)', () => {
    const [row] = segmentCustomers([{ ...base, lastOrderAt: '2026-01-27T00:00:00.000Z' }], NOW);
    expect(row.daysSinceLastOrder).toBe(180);
    expect(row.segment).toBe('AT_RISK');
  });

  it('marks exactly 181 days as DORMANT (boundary)', () => {
    const [row] = segmentCustomers([{ ...base, lastOrderAt: '2026-01-26T00:00:00.000Z' }], NOW);
    expect(row.daysSinceLastOrder).toBe(181);
    expect(row.segment).toBe('DORMANT');
  });
});
