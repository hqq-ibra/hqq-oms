import { ConflictException } from '@nestjs/common';
import { OrdersService } from '../orders.service';

type Mock = jest.Mock;

function createPrismaMock() {
  const mock: Record<string, any> = {
    customer: { findUnique: jest.fn() },
    order: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
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

  it('refuses a non-finite unit price, which JSON can carry as 1e999', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1', customerCode: 'ACME', name: 'Acme', city: null, contacts: [],
    });
    const { service } = createService(prisma);

    // `Infinity < 0` is false, so the old `unitPrice < 0` check admitted it
    // straight into a Decimal(14,2) column.
    await expect(
      service.create(
        { orderType: 'REPEAT', customerId: 'c1', items: [{ productId: 'p1', quantity: 1, unitPrice: Infinity }] },
        'u1',
      ),
    ).rejects.toThrow(/non-negative/i);

    await expect(
      service.create(
        { orderType: 'REPEAT', customerId: 'c1', items: [{ productId: 'p1', quantity: 1, unitPrice: NaN }] },
        'u1',
      ),
    ).rejects.toThrow(/non-negative/i);

    await expect(
      service.create(
        { orderType: 'REPEAT', customerId: 'c1', items: [{ productId: 'p1', quantity: Infinity, unitPrice: 1 }] },
        'u1',
      ),
    ).rejects.toThrow(/at least 1/i);

    expect(prisma.order.create).not.toHaveBeenCalled();
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

  it('lets an explicit validUntil override the 14-day default', async () => {
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
        items: [{ productId: 'p1', quantity: 1, unitPrice: 1 }],
        quotation: { validUntil: '2030-01-01' },
      },
      'u1',
    );

    const quote = (prisma.order.create as Mock).mock.calls[0][0].data.quotation.create;
    expect(quote.validUntil).toEqual(new Date('2030-01-01'));
  });

  it('refuses a negative or non-finite discount amount on the quotation header', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1', customerCode: 'ACME', name: 'Acme', city: null, contacts: [],
    });
    const { service } = createService(prisma);
    const items = [{ productId: 'p1', quantity: 1, unitPrice: 1 }];

    await expect(
      service.create(
        { orderType: 'REPEAT', customerId: 'c1', items, quotation: { discountAmount: -1 } },
        'u1',
      ),
    ).rejects.toThrow(/discount/i);

    await expect(
      service.create(
        { orderType: 'REPEAT', customerId: 'c1', items, quotation: { discountAmount: NaN } },
        'u1',
      ),
    ).rejects.toThrow(/discount/i);

    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('refuses an out-of-range or non-finite VAT percent on the quotation header', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1', customerCode: 'ACME', name: 'Acme', city: null, contacts: [],
    });
    const { service } = createService(prisma);
    const items = [{ productId: 'p1', quantity: 1, unitPrice: 1 }];

    await expect(
      service.create(
        { orderType: 'REPEAT', customerId: 'c1', items, quotation: { vatPercent: -15 } },
        'u1',
      ),
    ).rejects.toThrow(/vat percent/i);

    await expect(
      service.create(
        { orderType: 'REPEAT', customerId: 'c1', items, quotation: { vatPercent: 150 } },
        'u1',
      ),
    ).rejects.toThrow(/vat percent/i);

    await expect(
      service.create(
        { orderType: 'REPEAT', customerId: 'c1', items, quotation: { vatPercent: Infinity } },
        'u1',
      ),
    ).rejects.toThrow(/vat percent/i);

    expect(prisma.order.create).not.toHaveBeenCalled();
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

describe('OrdersService quotation endpoints', () => {
  const fullOrder = {
    id: 'o1',
    quoteNumber: 'QT-2026-0001',
    orderNumber: null,
    status: 'QUOTATION',
    customer: { name: 'Acme Dates' },
    items: [
      { id: 'i1', quantity: 2, unitPrice: 100, unitLabel: 'عدد', description: null, orderIndex: 0, specs: null, product: { nameEn: 'Tray 500g', nameAr: null, requiresLineSpecs: false } },
    ],
    quotation: {
      quoteDate: new Date('2026-07-27'),
      validUntil: new Date('2026-08-10'),
      payMethod: 'نقداً / تحويل بنكي',
      clientBlock: 'Acme Dates\nDammam',
      contact: '0500000000',
      attn: 'Khaled',
      notes: null,
      discountAmount: 0,
      vatEnabled: true,
      vatPercent: 15,
      language: 'ar',
    },
  };

  it('returns the lines with server-computed totals', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    const { service } = createService(prisma);

    const view = await service.getQuotation('o1');

    expect(view.quoteNumber).toBe('QT-2026-0001');
    expect(view.lines[0].lineTotal).toBe(200);
    expect(view.totals.grandTotal).toBe(230);
  });

  it('falls back to the product name when a line has no description', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    const { service } = createService(prisma);

    const view = await service.getQuotation('o1');

    expect(view.lines[0].description).toBe('Tray 500g');
  });

  it('appends the specs to a mold line description', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue({
      ...fullOrder,
      items: [
        {
          id: 'm1', quantity: 1, unitPrice: 900, unitLabel: 'عدد',
          description: null, orderIndex: 0,
          specs: { machine: 'MV', capacity: '6K', grams: '250', pattern: 'Rose' },
          product: { nameEn: 'New Mold — Silicone Thermoforming', nameAr: null, requiresLineSpecs: true },
        },
      ],
    });
    const { service } = createService(prisma);

    const view = await service.getQuotation('o1');

    expect(view.lines[0].description).toBe(
      'New Mold — Silicone Thermoforming\nMV · 6K · 250 · Rose',
    );
    expect(view.lines[0].requiresLineSpecs).toBe(true);
    expect(view.lines[0].specs).toEqual({ machine: 'MV', capacity: '6K', grams: '250', pattern: 'Rose' });
  });

  it('lets an explicit description override the spec label', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue({
      ...fullOrder,
      items: [
        {
          id: 'm1', quantity: 1, unitPrice: 900, unitLabel: 'عدد',
          description: 'Ramadan crescent mold', orderIndex: 0,
          specs: { machine: 'MV', capacity: '6K', grams: '250', pattern: 'Rose' },
          product: { nameEn: 'New Mold — Silicone Thermoforming', nameAr: null, requiresLineSpecs: true },
        },
      ],
    });
    const { service } = createService(prisma);

    expect((await service.getQuotation('o1')).lines[0].description).toBe(
      'Ramadan crescent mold',
    );
  });

  it('refuses a quantity below one', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    const { service } = createService(prisma);

    await expect(
      service.updateQuotation('o1', { lines: [{ id: 'i1', quantity: 0 }] }),
    ).rejects.toThrow(/at least 1/i);
    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });

  it('refuses a negative unit price', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    const { service } = createService(prisma);

    await expect(
      service.updateQuotation('o1', { lines: [{ id: 'i1', unitPrice: -5 }] }),
    ).rejects.toThrow(/non-negative/i);

    await expect(
      service.updateQuotation('o1', { lines: [{ id: 'i1', unitPrice: NaN }] }),
    ).rejects.toThrow(/non-negative/i);
  });

  it('refuses a line id that does not belong to this order, and touches nothing', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    // The item exists, but under a different order — findFirst scoped to
    // { id, orderId: 'o1' } finds no match, exactly as it would for real.
    prisma.orderItem.findFirst.mockResolvedValue(null);
    const { service } = createService(prisma);

    await expect(
      service.updateQuotation('o1', { lines: [{ id: 'foreign-item', unitPrice: 120 }] }),
    ).rejects.toThrow(/not found/i);
    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });

  it('saves per-line spec edits', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    prisma.orderItem.findFirst.mockResolvedValue({ id: 'i1', orderId: 'o1' });
    const { service } = createService(prisma);

    await service.updateQuotation('o1', {
      lines: [{ id: 'i1', specs: { machine: 'HI', capacity: '4K', grams: '500', pattern: 'Star' } }],
    });

    expect(prisma.orderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'i1' },
        data: expect.objectContaining({
          specs: { machine: 'HI', capacity: '4K', grams: '500', pattern: 'Star' },
        }),
      }),
    );
  });

  it('refuses to edit a quotation once the order is confirmed', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue({ ...fullOrder, status: 'CONFIRMED' });
    const { service } = createService(prisma);

    await expect(
      service.updateQuotation('o1', { discountAmount: 50 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('saves header edits while still a quotation', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    const { service } = createService(prisma);

    await service.updateQuotation('o1', { discountAmount: 50, notes: 'Deposit 50%' });

    expect(prisma.orderQuotation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'o1' },
        data: expect.objectContaining({ discountAmount: 50, notes: 'Deposit 50%' }),
      }),
    );
  });

  it('refuses a negative or non-finite discount amount on a header edit', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    const { service } = createService(prisma);

    await expect(
      service.updateQuotation('o1', { discountAmount: -1 }),
    ).rejects.toThrow(/discount/i);

    await expect(
      service.updateQuotation('o1', { discountAmount: NaN }),
    ).rejects.toThrow(/discount/i);

    expect(prisma.orderQuotation.update).not.toHaveBeenCalled();
  });

  it('refuses an out-of-range or non-finite VAT percent on a header edit', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    const { service } = createService(prisma);

    await expect(
      service.updateQuotation('o1', { vatPercent: -15 }),
    ).rejects.toThrow(/vat percent/i);

    await expect(
      service.updateQuotation('o1', { vatPercent: 150 }),
    ).rejects.toThrow(/vat percent/i);

    await expect(
      service.updateQuotation('o1', { vatPercent: Infinity }),
    ).rejects.toThrow(/vat percent/i);

    expect(prisma.orderQuotation.update).not.toHaveBeenCalled();
  });

  it('saves per-line price edits', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    prisma.orderItem.findFirst.mockResolvedValue({ id: 'i1', orderId: 'o1' });
    const { service } = createService(prisma);

    await service.updateQuotation('o1', {
      lines: [{ id: 'i1', unitPrice: 120, quantity: 3, unitLabel: 'كرتون', description: 'Custom' }],
    });

    expect(prisma.orderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'i1' },
        data: expect.objectContaining({ unitPrice: 120, quantity: 3 }),
      }),
    );
  });

  // The controller casts the raw body, so the DTO's field list is compile-time
  // decoration only: at runtime whatever the client sent used to be
  // rest-spread into Prisma's *Unchecked* update inputs.
  it('ignores unknown header keys instead of writing them to the quotation row', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    const { service } = createService(prisma);

    await service.updateQuotation('o1', {
      notes: 'Deposit 50%',
      // None of these are part of the endpoint's contract.
      id: 'forged-quotation-row',
      orderId: 'some-other-confirmed-order',
      createdAt: '2020-01-01T00:00:00.000Z',
      updatedAt: '2020-01-01T00:00:00.000Z',
    } as never);

    const data = (prisma.orderQuotation.update as Mock).mock.calls[0][0].data;
    expect(data).toEqual({ notes: 'Deposit 50%' });
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('orderId');
    expect(data).not.toHaveProperty('createdAt');
    expect(data).not.toHaveProperty('updatedAt');
  });

  it('does not update the header at all when a body carries only unknown keys', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    const { service } = createService(prisma);

    await service.updateQuotation('o1', {
      orderId: 'some-other-confirmed-order',
    } as never);

    expect(prisma.orderQuotation.update).not.toHaveBeenCalled();
  });

  // The exploit this closes: the ownership guard proves the line *starts out*
  // mine, then the write moved it into a locked CONFIRMED order.
  it('refuses to re-point a line at another order through the lines payload', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    prisma.orderItem.findFirst.mockResolvedValue({ id: 'i1', orderId: 'o1' });
    const { service } = createService(prisma);

    await service.updateQuotation('o1', {
      lines: [
        {
          id: 'i1',
          quantity: 9999,
          orderId: 'some-other-confirmed-order',
          productId: 'a-more-expensive-product',
          createdAt: '2020-01-01T00:00:00.000Z',
        },
      ],
    } as never);

    const data = (prisma.orderItem.update as Mock).mock.calls[0][0].data;
    expect(data).toEqual({ quantity: 9999 });
    expect(data).not.toHaveProperty('orderId');
    expect(data).not.toHaveProperty('productId');
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('createdAt');
  });

  it('does not touch a line whose payload carries only unknown keys', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    prisma.orderItem.findFirst.mockResolvedValue({ id: 'i1', orderId: 'o1' });
    const { service } = createService(prisma);

    await service.updateQuotation('o1', {
      lines: [{ id: 'i1', orderId: 'some-other-confirmed-order', productId: 'p9' }],
    } as never);

    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });
});

// Revenue (the SELLING_PRICE row) and stock both move exactly once, at
// confirmation, from the lines as they stand then. Editing lines afterwards
// would leave the books recording quantities the order no longer has.
describe('OrdersService item endpoints — locked after confirmation', () => {
  function setupAt(status: string) {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue({
      id: 'o1', customerId: 'c1', status, items: [], costs: [], statusHistory: [],
    });
    prisma.product.findUnique.mockResolvedValue({ requiresLineSpecs: false });
    prisma.orderItem.findFirst.mockResolvedValue({ id: 'i1', orderId: 'o1', quantity: 1 });
    prisma.orderItem.count = jest.fn().mockResolvedValue(0);
    prisma.orderItem.delete = jest.fn();
    return { prisma, ...createService(prisma) };
  }

  for (const status of ['CONFIRMED', 'COMPLETED', 'REJECTED']) {
    it(`refuses addItem on a ${status} order`, async () => {
      const { prisma, service } = setupAt(status);
      await expect(
        service.addItem('o1', { productId: 'p1', quantity: 1 }, 'u1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.orderItem.create).not.toHaveBeenCalled();
      expect(prisma.orderItem.update).not.toHaveBeenCalled();
    });

    it(`refuses updateItem on a ${status} order`, async () => {
      const { prisma, service } = setupAt(status);
      await expect(
        service.updateItem('o1', 'i1', { quantity: 100 }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.orderItem.update).not.toHaveBeenCalled();
    });

    it(`refuses removeItem on a ${status} order`, async () => {
      const { prisma, service } = setupAt(status);
      await expect(service.removeItem('o1', 'i1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.orderItem.delete).not.toHaveBeenCalled();
    });
  }

  it('still allows all three while the order is a quotation', async () => {
    const { prisma, service } = setupAt('QUOTATION');
    prisma.orderItem.update.mockResolvedValue({ id: 'i1' });

    await service.addItem('o1', { productId: 'p1', quantity: 1 }, 'u1');
    await service.updateItem('o1', 'i1', { quantity: 4 });
    await service.removeItem('o1', 'i1');

    expect(prisma.orderItem.update).toHaveBeenCalled();
    expect(prisma.orderItem.delete).toHaveBeenCalled();
  });
});

describe('OrdersService.addItem', () => {
  function setupAdd(requiresLineSpecs: boolean) {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue({
      id: 'o1', customerId: 'c1', status: 'QUOTATION', items: [], costs: [], statusHistory: [],
    });
    prisma.product.findUnique.mockResolvedValue({ requiresLineSpecs });
    prisma.orderItem.findFirst.mockResolvedValue({ id: 'i1', quantity: 1 });
    prisma.orderItem.count = jest.fn().mockResolvedValue(2);
    prisma.orderItem.create.mockResolvedValue({ id: 'i2' });
    prisma.orderItem.update.mockResolvedValue({ id: 'i1', quantity: 2 });
    return { prisma, ...createService(prisma) };
  }

  it('merges an ordinary product into the existing line', async () => {
    const { prisma, service } = setupAdd(false);
    await service.addItem('o1', { productId: 'p1', quantity: 1 }, 'u1');
    expect(prisma.orderItem.update).toHaveBeenCalled();
    expect(prisma.orderItem.create).not.toHaveBeenCalled();
  });

  it('always starts a new line for a placeholder product', async () => {
    const { prisma, service } = setupAdd(true);
    await service.addItem('o1', { productId: 'mold', quantity: 1 }, 'u1');
    expect(prisma.orderItem.update).not.toHaveBeenCalled();
    expect(prisma.orderItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ productId: 'mold', orderIndex: 2 }),
      }),
    );
  });

  // addItem validated nothing at all before: a negative quantity wrote a
  // negative line that flowed straight into computeQuotationTotals.
  it('refuses a non-positive or non-finite quantity', async () => {
    const { prisma, service } = setupAdd(false);

    await expect(
      service.addItem('o1', { productId: 'p1', quantity: -5 }, 'u1'),
    ).rejects.toThrow(/at least 1/i);

    await expect(
      service.addItem('o1', { productId: 'p1', quantity: 0 }, 'u1'),
    ).rejects.toThrow(/at least 1/i);

    await expect(
      service.addItem('o1', { productId: 'p1', quantity: NaN }, 'u1'),
    ).rejects.toThrow(/at least 1/i);

    expect(prisma.orderItem.create).not.toHaveBeenCalled();
    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });
});

describe('OrdersService.list', () => {
  it('sorts oldest-first for the chase view, newest-first otherwise', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);

    await service.list({ sort: 'oldest' });
    expect((prisma.order.findMany as Mock).mock.calls[0][0].orderBy).toEqual({
      createdAt: 'asc',
    });

    await service.list({});
    expect((prisma.order.findMany as Mock).mock.calls[1][0].orderBy).toEqual({
      createdAt: 'desc',
    });
  });

  it('includes the quotation relation so the chase list can show valid-until', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);

    await service.list({});

    expect((prisma.order.findMany as Mock).mock.calls[0][0].include).toEqual(
      expect.objectContaining({
        quotation: { select: { validUntil: true } },
      }),
    );
  });

  it('lets a search term match a quotation by its QT- number, since that is the only identifier it has', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);

    await service.list({ search: 'QT-2026' });

    expect((prisma.order.findMany as Mock).mock.calls[0][0].where.OR).toEqual(
      expect.arrayContaining([
        { quoteNumber: { contains: 'QT-2026', mode: 'insensitive' } },
      ]),
    );
  });

  // The Quotations tab disables the Status select but leaves the Delayed and
  // Near-deadline checkboxes live. `where.status` used to be overwritten
  // wholesale with { not: 'COMPLETED' }, so ticking either returned every
  // non-completed order in the system under a "Quotations" heading.
  it('keeps an explicit status filter when the delayed filter is applied', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);

    await service.list({ status: 'QUOTATION', delayed: true });

    const where = (prisma.order.findMany as Mock).mock.calls[0][0].where;
    expect(where.status).toBe('QUOTATION');
    expect(where.expectedDeliveryDate).toEqual({ lt: expect.any(Date) });
    expect(where.AND).toEqual([
      { status: { notIn: ['COMPLETED', 'REJECTED', 'QUOTATION'] } },
    ]);
  });

  it('keeps an explicit status filter when the near-deadline filter is applied', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);

    await service.list({ status: 'CONFIRMED', nearDeadline: true });

    const where = (prisma.order.findMany as Mock).mock.calls[0][0].where;
    expect(where.status).toBe('CONFIRMED');
    expect(where.AND).toEqual([
      { status: { notIn: ['COMPLETED', 'REJECTED', 'QUOTATION'] } },
    ]);
  });

  // A quotation is not late, it is unanswered; a rejected quote is dead.
  // Same exclusion as the overdue-orders report in analytics/operations.
  it('excludes quotations and rejections from the delivery-date filters', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);

    await service.list({ delayed: true });

    const where = (prisma.order.findMany as Mock).mock.calls[0][0].where;
    expect(where.status).toBeUndefined();
    expect(where.AND).toEqual([
      { status: { notIn: ['COMPLETED', 'REJECTED', 'QUOTATION'] } },
    ]);
  });

  it('leaves the status filter untouched when neither delivery filter is set', async () => {
    const prisma = createPrismaMock();
    const { service } = createService(prisma);

    await service.list({ status: 'QUOTATION' });

    const where = (prisma.order.findMany as Mock).mock.calls[0][0].where;
    expect(where.status).toBe('QUOTATION');
    expect(where.AND).toBeUndefined();
  });
});
