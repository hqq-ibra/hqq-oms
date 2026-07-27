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
  // Tagged-template call: invoked as mock.$executeRaw`...${a}...${b}`, so each
  // recorded call is [stringsArray, ...substitutions].
  mock.$executeRaw = jest.fn().mockResolvedValue(1);
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

function quotationOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    orderType: 'NEW_MOLD',
    status: 'QUOTATION',
    customerId: 'c1',
    orderNumber: null,
    factoryOrderNumber: null,
    customer: { id: 'c1', customerCode: 'ACME', name: 'Acme' },
    items: [
      {
        id: 'i1',
        productId: 'p1',
        quantity: 2,
        unitPrice: 100,
        specs: null,
        product: { nameEn: 'Tray 500g', requiresLineSpecs: false },
      },
    ],
    quotation: {
      discountAmount: 0,
      vatEnabled: true,
      vatPercent: 15,
    },
    ...overrides,
  };
}

const moldLine = (specs: unknown, id = 'm1') => ({
  id,
  productId: 'mold',
  quantity: 1,
  unitPrice: 900,
  specs,
  product: { nameEn: 'New Mold — Silicone Thermoforming', requiresLineSpecs: true },
});

describe('OrdersService.changeStatus — confirming', () => {
  function setup(order = quotationOrder()) {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(order);
    prisma.order.update.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ ...order, ...data }),
    );
    return { prisma, ...createService(prisma) };
  }

  it('assigns the order and factory numbers on confirmation', async () => {
    const { prisma, service } = setup();

    await service.changeStatus('o1', 'CONFIRMED', 'u1');

    const data = (prisma.order.update as Mock).mock.calls[0][0].data;
    expect(data.orderNumber).toMatch(/^ORD-\d{4}-0001$/);
    expect(data.factoryOrderNumber).toMatch(/^FO-\d{4}-ACME-0001$/);
    expect(data.confirmedAt).toBeInstanceOf(Date);
  });

  it('decrements stock only once the customer commits, via one atomic statement per line', async () => {
    const { prisma, service } = setup();

    await service.changeStatus('o1', 'CONFIRMED', 'u1');

    // The decrement-and-floor happens in a single UPDATE (see below), not a
    // read followed by a separate write, so there is no gap for a concurrent
    // confirmation to read a stale value.
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const [sql, quantity, productId] = (prisma.$executeRaw as Mock).mock.calls[0];
    expect(Array.isArray(sql) ? sql.join('') : String(sql)).toContain(
      'UPDATE products SET inventory = GREATEST(inventory -',
    );
    expect(quantity).toBe(2);
    expect(productId).toBe('p1');
  });

  it('floors the decrement at zero inside the SQL statement itself', async () => {
    // This only proves the statement text asks the database to floor the
    // result at zero (`GREATEST(inventory - N, 0)`) — a mock cannot exercise
    // concurrent transactions, so it cannot prove the invariant holds under
    // real concurrent load. That guarantee now comes from the single UPDATE
    // being one atomic, row-locking statement, not from anything assertable
    // here.
    const { prisma, service } = setup();

    await service.changeStatus('o1', 'CONFIRMED', 'u1');

    const [sql] = (prisma.$executeRaw as Mock).mock.calls[0];
    const text = Array.isArray(sql) ? sql.join('') : String(sql);
    expect(text).toContain('GREATEST(inventory -');
    expect(text).toContain(', 0)');
  });

  it('records the quote grand total as the selling price', async () => {
    const { prisma, service } = setup();

    await service.changeStatus('o1', 'CONFIRMED', 'u1');

    // 2 × 100 = 200, +15% VAT = 230
    expect(prisma.orderCost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'o1',
          costType: 'SELLING_PRICE',
          amount: 230,
          currency: 'SAR',
        }),
      }),
    );
  });

  it('updates rather than duplicates an existing selling price', async () => {
    const { prisma, service } = setup();
    prisma.orderCost.findFirst.mockResolvedValue({ id: 'cost1' });

    await service.changeStatus('o1', 'CONFIRMED', 'u1');

    expect(prisma.orderCost.create).not.toHaveBeenCalled();
    expect(prisma.orderCost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cost1' },
        data: expect.objectContaining({ amount: 230 }),
      }),
    );
  });

  it('leaves numbers and stock alone for every other transition', async () => {
    const { prisma, service } = setup(
      quotationOrder({
        status: 'CONFIRMED',
        orderNumber: 'ORD-2026-0001',
        factoryOrderNumber: 'FO-2026-ACME-0001',
      }),
    );

    await service.changeStatus('o1', 'SAMPLE_RECEIVED', 'u1');

    const data = (prisma.order.update as Mock).mock.calls[0][0].data;
    expect(data.orderNumber).toBeUndefined();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
    expect(prisma.orderCost.create).not.toHaveBeenCalled();
  });

  it('refuses to confirm a mold line that is missing specs', async () => {
    const { prisma, service } = setup(
      quotationOrder({ items: [moldLine({ machine: 'MV', capacity: '6K' })] }),
    );

    await expect(service.changeStatus('o1', 'CONFIRMED', 'u1')).rejects.toThrow(
      /grams/,
    );
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });

  it('confirms a mold line once all four specs are set', async () => {
    const { prisma, service } = setup(
      quotationOrder({
        items: [moldLine({ machine: 'MV', capacity: '6K', grams: '250', pattern: 'Rose' })],
      }),
    );

    await service.changeStatus('o1', 'CONFIRMED', 'u1');

    expect((prisma.order.update as Mock).mock.calls[0][0].data.orderNumber).toMatch(
      /^ORD-\d{4}-0001$/,
    );
  });

  it('does not demand specs from ordinary products', async () => {
    const { prisma, service } = setup();

    await service.changeStatus('o1', 'CONFIRMED', 'u1');

    expect(prisma.order.update).toHaveBeenCalled();
  });

  it('lets an incomplete mold quotation still be rejected', async () => {
    const { prisma, service } = setup(
      quotationOrder({ items: [moldLine(null)] }),
    );

    await service.changeStatus('o1', 'REJECTED', 'u1');

    expect((prisma.order.update as Mock).mock.calls[0][0].data.status).toBe('REJECTED');
  });

  it('rejects a quotation without assigning anything', async () => {
    const { prisma, service } = setup();

    await service.changeStatus('o1', 'REJECTED', 'u1');

    const data = (prisma.order.update as Mock).mock.calls[0][0].data;
    expect(data.status).toBe('REJECTED');
    expect(data.orderNumber).toBeUndefined();
    expect(prisma.$executeRaw).not.toHaveBeenCalled();
  });
});
