import { OperationsService } from '../operations.service';

/**
 * getOverdue() is raw SQL with no pure-function seam, so the only honest thing
 * a unit test can assert is the statement text itself: that the status
 * predicate is present in the query the service hands to Prisma. It cannot
 * prove Postgres filters the rows — that needs a live database — but it does
 * pin the predicate against silent removal, which is exactly the regression
 * being guarded (quotations and rejections leaking into "Overdue Orders").
 * Same technique the orders spec uses for the stock-decrement $executeRaw.
 */
function queryText(call: unknown[]): string {
  const [strings] = call;
  return Array.isArray(strings) ? strings.join(' ? ') : String(strings);
}

function createPrismaMock() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

describe('OperationsService.getOverdue', () => {
  it('excludes quotations and rejected quotes from the overdue report', async () => {
    const prisma = createPrismaMock();
    const service = new OperationsService(prisma as never);

    await service.getOverdue();

    const sql = queryText((prisma.$queryRaw as jest.Mock).mock.calls[0]);
    // The new-order wizard sets expected_delivery_date on step 3, so every
    // quotation carries one. Without this predicate a quote the customer
    // declined would sit in "Overdue Orders" forever as late business.
    expect(sql).toContain("o.status NOT IN ('QUOTATION', 'REJECTED')");
  });

  it('still restricts the report to unfinished orders past their promised date', async () => {
    const prisma = createPrismaMock();
    const service = new OperationsService(prisma as never);

    await service.getOverdue();

    const sql = queryText((prisma.$queryRaw as jest.Mock).mock.calls[0]);
    expect(sql).toContain('o.completed_at IS NULL');
    expect(sql).toContain('o.expected_delivery_date < NOW()');
  });

  it('normalizes the delivery date to an ISO string for the wire contract', async () => {
    const prisma = createPrismaMock();
    prisma.$queryRaw.mockResolvedValue([
      {
        orderId: 'o1',
        orderNumber: 'ORD-2026-0001',
        quoteNumber: null,
        customerName: 'Acme Dates',
        expectedDeliveryDate: new Date('2026-01-01T00:00:00.000Z'),
        daysOverdue: 5,
      },
    ]);
    const service = new OperationsService(prisma as never);

    const rows = await service.getOverdue();

    expect(rows[0].expectedDeliveryDate).toBe('2026-01-01T00:00:00.000Z');
  });
});
