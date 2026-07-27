import { averageStatusDwell } from '../operations';

describe('averageStatusDwell', () => {
  it('averages the days an order spent in each status', () => {
    const result = averageStatusDwell([
      { orderId: 'o1', newStatus: 'CONFIRMED', changedAt: '2026-01-01T00:00:00.000Z' },
      { orderId: 'o1', newStatus: 'MOLD_READY', changedAt: '2026-01-03T00:00:00.000Z' },
      { orderId: 'o1', newStatus: 'COMPLETED', changedAt: '2026-01-08T00:00:00.000Z' },
    ]);
    const confirmed = result.find((r) => r.status === 'CONFIRMED')!;
    const mold = result.find((r) => r.status === 'MOLD_READY')!;
    expect(confirmed.averageDays).toBe(2);
    expect(mold.averageDays).toBe(5);
  });

  it('ignores the final status of an order, which has no successor', () => {
    const result = averageStatusDwell([
      { orderId: 'o1', newStatus: 'CONFIRMED', changedAt: '2026-01-01T00:00:00.000Z' },
      { orderId: 'o1', newStatus: 'COMPLETED', changedAt: '2026-01-02T00:00:00.000Z' },
    ]);
    expect(result.find((r) => r.status === 'COMPLETED')).toBeUndefined();
  });

  it('does not bridge across different orders', () => {
    const result = averageStatusDwell([
      { orderId: 'o1', newStatus: 'CONFIRMED', changedAt: '2026-01-01T00:00:00.000Z' },
      { orderId: 'o2', newStatus: 'CONFIRMED', changedAt: '2026-06-01T00:00:00.000Z' },
    ]);
    expect(result).toEqual([]);
  });

  it('returns an empty array for no history', () => {
    expect(averageStatusDwell([])).toEqual([]);
  });
});
