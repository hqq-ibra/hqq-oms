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
});
