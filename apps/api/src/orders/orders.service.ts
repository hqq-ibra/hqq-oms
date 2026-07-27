import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';
import { isValidTransition } from './order-workflow';
import { nextSequenceNumber } from './sequence';
import { buildQuotationDefaults } from './quotation-defaults';
import { computeQuotationTotals } from './quotation-totals';
import { findIncompleteSpecLines, formatSpecs } from './mold-specs';

export interface OrderListFilters {
  status?: string;
  orderType?: string;
  assignedUserId?: string;
  factoryId?: string;
  customerId?: string;
  search?: string;
  delayed?: boolean;
  nearDeadline?: boolean;
  page?: number;
  pageSize?: number;
}

export interface PaginatedOrdersResult {
  data: unknown[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
  ) {}

  async list(filters: OrderListFilters): Promise<PaginatedOrdersResult> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 10));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};

    if (filters.status) where.status = filters.status;
    if (filters.orderType) where.orderType = filters.orderType;
    if (filters.assignedUserId) where.assignedUserId = filters.assignedUserId;
    if (filters.factoryId) where.factoryId = filters.factoryId;
    if (filters.customerId) where.customerId = filters.customerId;

    if (filters.search?.trim()) {
      const term = filters.search.trim();
      where.OR = [
        { orderNumber: { contains: term, mode: 'insensitive' } },
        { factoryOrderNumber: { contains: term, mode: 'insensitive' } },
        { customer: { name: { contains: term, mode: 'insensitive' } } },
      ];
    }

    if (filters.delayed) {
      where.expectedDeliveryDate = { lt: new Date() };
      where.status = { not: 'COMPLETED' };
    }

    if (filters.nearDeadline) {
      const now = new Date();
      const in7Days = new Date(now);
      in7Days.setDate(in7Days.getDate() + 7);
      where.expectedDeliveryDate = {
        gte: now,
        lte: in7Days,
      };
      where.status = { not: 'COMPLETED' };
    }

    const [data, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: true,
          product: true,
          factory: true,
          assignedUser: { select: { id: true, name: true, email: true, role: true } },
          items: { include: { product: true } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getById(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        product: true,
        factory: true,
        assignedUser: { select: { id: true, name: true, email: true, role: true } },
        items: { include: { product: { include: { factory: true } } } },
        costs: true,
        quotation: true,
        statusHistory: {
          orderBy: { changedAt: 'desc' },
          include: { changer: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const files = await this.prisma.file.findMany({
      where: { entityType: 'ORDER', entityId: id },
    });

    return { ...order, files };
  }

  private async getNextQuoteNumber(): Promise<string> {
    const prefix = `QT-${new Date().getFullYear()}-`;
    const last = await this.prisma.order.findFirst({
      where: { quoteNumber: { startsWith: prefix } },
      orderBy: { quoteNumber: 'desc' },
      select: { quoteNumber: true },
    });
    return nextSequenceNumber(prefix, last?.quoteNumber ?? null);
  }

  private async getNextOrderNumber(): Promise<string> {
    const prefix = `ORD-${new Date().getFullYear()}-`;
    const last = await this.prisma.order.findFirst({
      where: { orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    return nextSequenceNumber(prefix, last?.orderNumber ?? null);
  }

  private async getNextFactoryOrderNumber(customerCode: string): Promise<string> {
    const prefix = `FO-${new Date().getFullYear()}-${customerCode}-`;
    const last = await this.prisma.order.findFirst({
      where: { factoryOrderNumber: { startsWith: prefix } },
      orderBy: { factoryOrderNumber: 'desc' },
      select: { factoryOrderNumber: true },
    });
    return nextSequenceNumber(prefix, last?.factoryOrderNumber ?? null);
  }

  async create(
    dto: {
      orderType: string;
      customerId: string;
      items: {
        productId: string;
        quantity: number;
        unitPrice?: number;
        unitLabel?: string;
        description?: string;
        specs?: Record<string, string> | null;
      }[];
      expectedDeliveryDate?: string;
      assignedUserId?: string | null;
      internalNotes?: string;
    },
    userId: string,
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException('At least one item is required');
    }

    // Money guard: computeQuotationTotals multiplies these straight through, so
    // a negative slipping in would print a negative line on a customer quotation
    // and be written to the order's selling price.
    for (const item of dto.items) {
      if (!Number.isFinite(item.quantity) || item.quantity < 1) {
        throw new BadRequestException('Quantity must be at least 1');
      }
      if (item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice < 0) {
        throw new BadRequestException('Unit price cannot be negative');
      }
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
      include: { contacts: { take: 1 } },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const quoteNumber = await this.getNextQuoteNumber();
    const primaryContact = customer.contacts?.[0] ?? null;
    const defaults = buildQuotationDefaults({
      customerName: customer.name,
      customerCity: customer.city ?? null,
      contactName: primaryContact?.name ?? null,
      contactPhone: primaryContact?.phone ?? null,
      quoteDate: new Date(),
    });

    // No orderNumber / factoryOrderNumber and no stock movement: this is a
    // quotation, not a commitment. Both happen in changeStatus on CONFIRMED.
    const order = await this.prisma.order.create({
      data: {
        orderType: dto.orderType,
        customerId: dto.customerId,
        quoteNumber,
        status: 'QUOTATION',
        ...(dto.expectedDeliveryDate
          ? { expectedDeliveryDate: new Date(dto.expectedDeliveryDate) }
          : {}),
        ...(dto.assignedUserId ? { assignedUserId: dto.assignedUserId } : {}),
        ...(dto.internalNotes ? { internalNotes: dto.internalNotes } : {}),
        items: {
          create: dto.items.map((item, index) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice ?? null,
            ...(item.unitLabel ? { unitLabel: item.unitLabel } : {}),
            description: item.description ?? null,
            orderIndex: index,
            ...(item.specs ? { specs: item.specs } : {}),
          })),
        },
        quotation: {
          create: {
            quoteDate: defaults.quoteDate,
            validUntil: defaults.validUntil,
            clientBlock: defaults.clientBlock,
            contact: defaults.contact,
            attn: defaults.attn,
          },
        },
      },
      include: {
        customer: true,
        product: true,
        factory: true,
        assignedUser: { select: { id: true, name: true, email: true, role: true } },
        items: { include: { product: { include: { factory: true } } } },
        quotation: true,
      },
    });

    // Linking the product to the customer stays here, at order placement:
    // it drives the "Suggested — Previously ordered" list, and a customer who
    // asked for a price should see that product suggested next time.
    for (const item of dto.items) {
      await this.prisma.customerProduct.upsert({
        where: {
          customerId_productId: {
            customerId: dto.customerId,
            productId: item.productId,
          },
        },
        create: { customerId: dto.customerId, productId: item.productId },
        update: {},
      });
    }

    this.wsGateway.emit('order.created', order);
    return order;
  }

  async update(
    id: string,
    dto: Partial<{
      shippingCompany: string;
      trackingNumber: string;
      trackingUrl: string;
      internalNotes: string;
      assignedUserId: string | null;
      expectedDeliveryDate: Date | null;
    }>,
    userId: string,
  ) {
    await this.getById(id);
    const order = await this.prisma.order.update({
      where: { id },
      data: dto,
      include: {
        customer: true,
        product: true,
        factory: true,
        assignedUser: { select: { id: true, name: true, email: true, role: true } },
        items: { include: { product: { include: { factory: true } } } },
      },
    });
    this.wsGateway.emit('order.updated', order);
    return order;
  }

  async changeStatus(
    id: string,
    newStatus: string,
    userId: string,
    note?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        product: true,
        factory: true,
        assignedUser: true,
        items: {
          orderBy: { orderIndex: 'asc' },
          include: {
            product: { select: { nameEn: true, requiresLineSpecs: true } },
          },
        },
        quotation: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (!isValidTransition(order.orderType, order.status, newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${order.status} to ${newStatus}`,
      );
    }

    const isConfirming = newStatus === 'CONFIRMED';

    // A mold cannot be cut without all four specs. Quotations may be saved
    // incomplete while pricing; confirmation is where it has to be complete.
    if (isConfirming) {
      const incomplete = findIncompleteSpecLines(
        order.items.map((item, index) => ({
          index,
          requiresLineSpecs: item.product.requiresLineSpecs,
          specs: item.specs,
        })),
      );
      if (incomplete.length > 0) {
        const detail = incomplete
          .map((l) => `line ${l.index + 1} (missing ${l.missing.join(', ')})`)
          .join('; ');
        throw new BadRequestException(
          `Cannot confirm: mold specifications are incomplete — ${detail}`,
        );
      }
    }

    // Everything a quotation deliberately deferred happens here, and only here.
    const confirmationData: Record<string, unknown> = {};
    let sellingPrice = 0;
    if (isConfirming) {
      const [orderNumber, factoryOrderNumber] = await Promise.all([
        this.getNextOrderNumber(),
        this.getNextFactoryOrderNumber(order.customer.customerCode),
      ]);
      confirmationData.orderNumber = orderNumber;
      confirmationData.factoryOrderNumber = factoryOrderNumber;
      confirmationData.confirmedAt = new Date();

      sellingPrice = computeQuotationTotals({
        lines: order.items.map((item) => ({
          quantity: item.quantity,
          unitPrice: item.unitPrice === null ? null : Number(item.unitPrice),
        })),
        discountAmount: Number(order.quotation?.discountAmount ?? 0),
        vatEnabled: order.quotation?.vatEnabled ?? true,
        vatPercent: Number(order.quotation?.vatPercent ?? 15),
      }).grandTotal;
    }

    // One transaction: a half-confirmed order — numbered but with no selling
    // price, or stock moved but status unchanged — would corrupt the books.
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id },
        data: {
          status: newStatus,
          ...confirmationData,
          ...(newStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
        },
        include: {
          customer: true,
          product: true,
          factory: true,
          assignedUser: { select: { id: true, name: true, email: true, role: true } },
          items: { include: { product: { include: { factory: true } } } },
          quotation: true,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          oldStatus: order.status,
          newStatus,
          changedBy: userId,
          note,
        },
      });

      if (isConfirming) {
        // A read-then-clamp-then-relative-decrement would race: two
        // concurrent confirmations touching the same product could both read
        // the same starting inventory, each clamp against it, and both apply
        // their own decrement — driving the column negative despite the
        // clamp, since Postgres never re-checks the value at write time. A
        // single UPDATE that both reads and clamps server-side has no such
        // window: the row lock taken for the write serializes concurrent
        // updates to the same product.
        for (const item of order.items) {
          await tx.$executeRaw`UPDATE products SET inventory = GREATEST(inventory - ${item.quantity}, 0) WHERE id = ${item.productId}`;
        }

        // Revenue in Reports and Analytics is the SELLING_PRICE cost row
        // (analytics/lib/sales.ts). Derive it so the price is entered once.
        const existing = await tx.orderCost.findFirst({
          where: { orderId: id, costType: 'SELLING_PRICE' },
        });
        if (existing) {
          await tx.orderCost.update({
            where: { id: existing.id },
            data: { amount: sellingPrice, currency: 'SAR' },
          });
        } else {
          await tx.orderCost.create({
            data: {
              orderId: id,
              costType: 'SELLING_PRICE',
              amount: sellingPrice,
              currency: 'SAR',
              createdBy: userId,
            },
          });
        }
      }

      return result;
    });

    this.wsGateway.emit('order.status_changed', {
      order: updated,
      oldStatus: order.status,
      newStatus,
    });
    return updated;
  }

  async addCost(
    orderId: string,
    dto: { costType: string; amount: number; currency?: string },
    userId: string,
  ) {
    await this.getById(orderId);
    const cost = await this.prisma.orderCost.create({
      data: {
        orderId,
        costType: dto.costType,
        amount: dto.amount,
        currency: dto.currency ?? 'SAR',
        createdBy: userId,
      },
    });
    this.wsGateway.emit('order.cost_updated', { orderId, cost });
    return cost;
  }

  async updateCost(
    costId: string,
    dto: Partial<{ costType: string; amount: number; currency: string }>,
    userId: string,
  ) {
    const cost = await this.prisma.orderCost.findUnique({
      where: { id: costId },
    });
    if (!cost) throw new NotFoundException('Cost not found');

    const updated = await this.prisma.orderCost.update({
      where: { id: costId },
      data: dto,
    });
    this.wsGateway.emit('order.cost_updated', {
      orderId: cost.orderId,
      cost: updated,
    });
    return updated;
  }

  async deleteCost(costId: string) {
    const cost = await this.prisma.orderCost.findUnique({
      where: { id: costId },
    });
    if (!cost) throw new NotFoundException('Cost not found');

    await this.prisma.orderCost.delete({
      where: { id: costId },
    });
    this.wsGateway.emit('order.cost_updated', {
      orderId: cost.orderId,
      cost: null,
    });
  }

  async listCosts(orderId: string) {
    await this.getById(orderId);
    return this.prisma.orderCost.findMany({
      where: { orderId },
      include: { creator: true },
    });
  }

  async addItem(orderId: string, dto: { productId: string; quantity: number }, userId: string) {
    const order = await this.getById(orderId);
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: { requiresLineSpecs: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    // A placeholder is a new design every time; ordinary products merge.
    const existing = product.requiresLineSpecs
      ? null
      : await this.prisma.orderItem.findFirst({
          where: { orderId, productId: dto.productId },
        });

    if (existing) {
      const updated = await this.prisma.orderItem.update({
        where: { id: existing.id },
        data: { quantity: existing.quantity + dto.quantity },
        include: { product: { include: { factory: true } } },
      });
      await this.prisma.customerProduct.upsert({
        where: { customerId_productId: { customerId: order.customerId, productId: dto.productId } },
        create: { customerId: order.customerId, productId: dto.productId },
        update: {},
      });
      this.wsGateway.emit('order.updated', { orderId });
      return updated;
    }
    const lineCount = await this.prisma.orderItem.count({ where: { orderId } });
    const item = await this.prisma.orderItem.create({
      data: {
        orderId,
        productId: dto.productId,
        quantity: dto.quantity,
        orderIndex: lineCount,
      },
      include: { product: { include: { factory: true } } },
    });
    await this.prisma.customerProduct.upsert({
      where: { customerId_productId: { customerId: order.customerId, productId: dto.productId } },
      create: { customerId: order.customerId, productId: dto.productId },
      update: {},
    });
    this.wsGateway.emit('order.updated', { orderId });
    return item;
  }

  async updateItem(orderId: string, itemId: string, dto: { quantity: number }) {
    await this.getById(orderId);
    if (dto.quantity < 1) throw new BadRequestException('Quantity must be at least 1');
    const item = await this.prisma.orderItem.findFirst({ where: { id: itemId, orderId } });
    if (!item) throw new NotFoundException('Order item not found');
    const updated = await this.prisma.orderItem.update({
      where: { id: itemId },
      data: { quantity: dto.quantity },
      include: { product: { include: { factory: true } } },
    });
    this.wsGateway.emit('order.updated', { orderId });
    return updated;
  }

  async removeItem(orderId: string, itemId: string) {
    await this.getById(orderId);
    const item = await this.prisma.orderItem.findFirst({ where: { id: itemId, orderId } });
    if (!item) throw new NotFoundException('Order item not found');
    await this.prisma.orderItem.delete({ where: { id: itemId } });
    this.wsGateway.emit('order.updated', { orderId });
  }

  async addUploadedFile(
    orderId: string,
    dto: { fileName: string; fileUrl: string; fileType: string },
    userId: string,
  ) {
    await this.getById(orderId);
    return this.prisma.file.create({
      data: {
        entityType: 'ORDER',
        entityId: orderId,
        fileType: dto.fileType,
        fileName: dto.fileName,
        fileUrl: dto.fileUrl,
        uploadedBy: userId,
      },
    });
  }

  async getFactorySheet(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        product: true,
        items: { include: { product: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const cadFiles = await this.prisma.file.findMany({
      where: {
        entityType: 'ORDER',
        entityId: id,
        fileType: 'CAD',
      },
    });

    const firstProduct = order.items.length > 0
      ? order.items[0].product
      : order.product;

    return {
      factoryOrderNumber: order.factoryOrderNumber,
      productNameEn: firstProduct?.nameEn ?? '',
      sku: firstProduct?.sku ?? '',
      notes: order.internalNotes,
      items: order.items.map((item) => ({
        productNameEn: item.product.nameEn,
        sku: item.product.sku,
        quantity: item.quantity,
      })),
      cadFiles: cadFiles.map((f: { fileName: string; fileUrl: string }) => ({
        fileName: f.fileName,
        fileUrl: f.fileUrl,
      })),
    };
  }

  async getQuotation(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        quotation: true,
        items: {
          orderBy: { orderIndex: 'asc' },
          include: { product: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const q = order.quotation;
    const discountAmount = Number(q?.discountAmount ?? 0);
    const vatEnabled = q?.vatEnabled ?? true;
    const vatPercent = Number(q?.vatPercent ?? 15);

    const totals = computeQuotationTotals({
      lines: order.items.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice === null ? null : Number(item.unitPrice),
      })),
      discountAmount,
      vatEnabled,
      vatPercent,
    });

    return {
      orderId: order.id,
      quoteNumber: order.quoteNumber,
      orderNumber: order.orderNumber,
      status: order.status,
      quoteDate: q?.quoteDate ?? null,
      validUntil: q?.validUntil ?? null,
      payMethod: q?.payMethod ?? '',
      clientBlock: q?.clientBlock ?? order.customer.name,
      contact: q?.contact ?? null,
      attn: q?.attn ?? null,
      notes: q?.notes ?? null,
      discountAmount,
      vatEnabled,
      vatPercent,
      language: q?.language ?? 'ar',
      customerName: order.customer.name,
      lines: order.items.map((item, index) => {
        const specLabel = formatSpecs(item.specs);
        return {
          id: item.id,
          // An explicit override wins; otherwise a mold line shows its specs
          // under the product name so the customer sees what is being quoted.
          description:
            item.description ??
            (specLabel ? `${item.product.nameEn}\n${specLabel}` : item.product.nameEn),
          productName: item.product.nameEn,
          requiresLineSpecs: item.product.requiresLineSpecs,
          specs: (item.specs ?? null) as Record<string, string> | null,
          quantity: item.quantity,
          unitLabel: item.unitLabel,
          unitPrice: item.unitPrice === null ? null : Number(item.unitPrice),
          lineTotal: totals.lineTotals[index],
        };
      }),
      totals,
    };
  }

  async updateQuotation(
    id: string,
    dto: Partial<{
      quoteDate: string;
      validUntil: string | null;
      payMethod: string;
      clientBlock: string;
      contact: string | null;
      attn: string | null;
      notes: string | null;
      discountAmount: number;
      vatEnabled: boolean;
      vatPercent: number;
      language: string;
      lines: {
        id: string;
        quantity?: number;
        unitPrice?: number | null;
        unitLabel?: string;
        description?: string | null;
        specs?: Record<string, string> | null;
      }[];
    }>,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    // A quote that has been sent and accepted must not change under the customer.
    if (order.status !== 'QUOTATION') {
      throw new ConflictException(
        'This quotation is locked because the order is already confirmed',
      );
    }

    const { lines, quoteDate, validUntil, ...rest } = dto;

    const headerData: Record<string, unknown> = { ...rest };
    if (quoteDate !== undefined) headerData.quoteDate = new Date(quoteDate);
    if (validUntil !== undefined) {
      headerData.validUntil = validUntil ? new Date(validUntil) : null;
    }

    if (Object.keys(headerData).length > 0) {
      await this.prisma.orderQuotation.update({
        where: { orderId: id },
        data: headerData,
      });
    }

    for (const line of lines ?? []) {
      const { id: lineId, ...lineData } = line;
      if (Object.keys(lineData).length === 0) continue;

      // Same money guard as create(): these feed computeQuotationTotals directly.
      if (lineData.quantity !== undefined) {
        if (!Number.isFinite(lineData.quantity) || lineData.quantity < 1) {
          throw new BadRequestException('Quantity must be at least 1');
        }
      }
      if (lineData.unitPrice !== undefined && lineData.unitPrice !== null) {
        // Number.isFinite, not just `< 0`: the controller casts the raw body
        // with no class-validator DTO, so NaN and Infinity can reach here and
        // would poison every downstream total.
        if (!Number.isFinite(lineData.unitPrice) || lineData.unitPrice < 0) {
          throw new BadRequestException('Unit price must be a non-negative number');
        }
      }

      await this.prisma.orderItem.update({
        where: { id: lineId },
        data: lineData,
      });
    }

    this.wsGateway.emit('order.updated', { orderId: id });
    return this.getQuotation(id);
  }
}
