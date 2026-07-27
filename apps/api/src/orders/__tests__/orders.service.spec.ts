import { OrdersService } from '../orders.service';

type Mock = jest.Mock;

function createPrismaMock() {
  const mock: Record<string, any> = {
    customer: { findUnique: jest.fn() },
    order: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    orderItem: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    orderCost: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
    orderQuotation: { findUnique: jest.fn(), update: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
    product: { findUnique: jest.fn(), update: jest.fn() },
    customerProduct: { upsert: jest.fn() },
    file: { findMany: jest.fn().mockResolvedValue([]) },
  };
  // Supports both the array form and the callback form of $transaction.
  mock.$transaction = jest.fn((arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(mock),
  );
  return mock;
}

function createService(prisma: Record<string, any>) {
  const ws = { emit: jest.fn() };
  return {
    service: new OrdersService(prisma as never, ws as never),
    ws,
  };
}

describe('OrdersService.create', () => {
  it('creates an unconfirmed quotation without burning order numbers or stock', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1',
      customerCode: 'ACME',
      name: 'Acme Dates',
      city: 'Dammam',
      contacts: [{ name: 'Khaled', phone: '0500000000' }],
    });
    prisma.order.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'o1', ...data }),
    );
    const { service } = createService(prisma);

    await service.create(
      {
        orderType: 'NEW_MOLD',
        customerId: 'c1',
        items: [{ productId: 'p1', quantity: 2, unitPrice: 10 }],
      },
      'u1',
    );

    const data = (prisma.order.create as Mock).mock.calls[0][0].data;
    expect(data.status).toBe('QUOTATION');
    expect(data.quoteNumber).toMatch(/^QT-\d{4}-0001$/);
    expect(data.orderNumber).toBeUndefined();
    expect(data.factoryOrderNumber).toBeUndefined();

    // A quotation is not a commitment: stock must not move.
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('links every ordered product to the customer automatically', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1', customerCode: 'ACME', name: 'Acme', city: null, contacts: [],
    });
    prisma.order.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'o1', ...data }),
    );
    const { service } = createService(prisma);

    await service.create(
      {
        orderType: 'REPEAT',
        customerId: 'c1',
        items: [
          { productId: 'p1', quantity: 1, unitPrice: 5 },
          { productId: 'p2', quantity: 3, unitPrice: 7 },
        ],
      },
      'u1',
    );

    expect(prisma.customerProduct.upsert).toHaveBeenCalledTimes(2);
    const linked = (prisma.customerProduct.upsert as Mock).mock.calls.map(
      (c) => c[0].create.productId,
    );
    expect(linked.sort()).toEqual(['p1', 'p2']);
  });

  it('stores the per-line price, unit and description', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1', customerCode: 'ACME', name: 'Acme', city: null, contacts: [],
    });
    prisma.order.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'o1', ...data }),
    );
    const { service } = createService(prisma);

    await service.create(
      {
        orderType: 'REPEAT',
        customerId: 'c1',
        items: [
          { productId: 'p1', quantity: 4, unitPrice: 12.5, unitLabel: 'كرتون', description: 'Custom tray' },
        ],
      },
      'u1',
    );

    const [line] = (prisma.order.create as Mock).mock.calls[0][0].data.items.create;
    expect(line.unitPrice).toBe(12.5);
    expect(line.unitLabel).toBe('كرتون');
    expect(line.description).toBe('Custom tray');
    expect(line.orderIndex).toBe(0);
  });

  it('stores per-line mold specs and allows the same product on several lines', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1', customerCode: 'ACME', name: 'Acme', city: null, contacts: [],
    });
    prisma.order.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'o1', ...data }),
    );
    const { service } = createService(prisma);

    await service.create(
      {
        orderType: 'NEW_MOLD',
        customerId: 'c1',
        items: [
          { productId: 'mold', quantity: 1, unitPrice: 900, specs: { machine: 'MV', capacity: '6K', grams: '250', pattern: 'Rose' } },
          { productId: 'mold', quantity: 1, unitPrice: 950, specs: { machine: 'HI', capacity: '4K', grams: '500', pattern: 'Star' } },
        ],
      },
      'u1',
    );

    const lines = (prisma.order.create as Mock).mock.calls[0][0].data.items.create;
    expect(lines).toHaveLength(2);
    expect(lines[0].specs).toEqual({ machine: 'MV', capacity: '6K', grams: '250', pattern: 'Rose' });
    expect(lines[1].specs.pattern).toBe('Star');
    expect(lines[0].orderIndex).toBe(0);
    expect(lines[1].orderIndex).toBe(1);
  });

  it('refuses a non-positive quantity or a negative price', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1', customerCode: 'ACME', name: 'Acme', city: null, contacts: [],
    });
    const { service } = createService(prisma);

    await expect(
      service.create(
        { orderType: 'REPEAT', customerId: 'c1', items: [{ productId: 'p1', quantity: 0, unitPrice: 5 }] },
        'u1',
      ),
    ).rejects.toThrow(/at least 1/i);

    await expect(
      service.create(
        { orderType: 'REPEAT', customerId: 'c1', items: [{ productId: 'p1', quantity: 1, unitPrice: -5 }] },
        'u1',
      ),
    ).rejects.toThrow(/negative/i);

    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('seeds the quotation header from the customer', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1',
      customerCode: 'ACME',
      name: 'Acme Dates',
      city: 'Dammam',
      contacts: [{ name: 'Khaled', phone: '0500000000' }],
    });
    prisma.order.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'o1', ...data }),
    );
    const { service } = createService(prisma);

    await service.create(
      { orderType: 'REPEAT', customerId: 'c1', items: [{ productId: 'p1', quantity: 1, unitPrice: 1 }] },
      'u1',
    );

    const quote = (prisma.order.create as Mock).mock.calls[0][0].data.quotation.create;
    expect(quote.clientBlock).toBe('Acme Dates\nDammam');
    expect(quote.contact).toBe('0500000000');
    expect(quote.attn).toBe('Khaled');
    expect(quote.validUntil).toBeInstanceOf(Date);
  });
});
