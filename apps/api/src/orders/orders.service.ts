import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';
import { isValidTransition } from './order-workflow';

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

  private async getNextOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `ORD-${year}-`;
    const last = await this.prisma.order.findFirst({
      where: { orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: 'desc' },
    });
    const nextNum = last
      ? parseInt(last.orderNumber.replace(prefix, ''), 10) + 1
      : 1;
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  }

  private async getNextFactoryOrderNumber(customerCode: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `FO-${year}-${customerCode}-`;
    const last = await this.prisma.order.findFirst({
      where: { factoryOrderNumber: { startsWith: prefix } },
      orderBy: { factoryOrderNumber: 'desc' },
    });
    const nextNum = last
      ? parseInt(last.factoryOrderNumber.replace(prefix, ''), 10) + 1
      : 1;
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  }

  async create(
    dto: {
      orderType: string;
      customerId: string;
      items: { productId: string; quantity: number }[];
      expectedDeliveryDate?: string;
      assignedUserId?: string | null;
      internalNotes?: string;
    },
    userId: string,
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException('At least one item is required');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const [orderNumber, factoryOrderNumber] = await Promise.all([
      this.getNextOrderNumber(),
      this.getNextFactoryOrderNumber(customer.customerCode),
    ]);

    const order = await this.prisma.order.create({
      data: {
        orderType: dto.orderType,
        customerId: dto.customerId,
        orderNumber,
        factoryOrderNumber,
        status: 'NEW',
        ...(dto.expectedDeliveryDate ? { expectedDeliveryDate: new Date(dto.expectedDeliveryDate) } : {}),
        ...(dto.assignedUserId ? { assignedUserId: dto.assignedUserId } : {}),
        ...(dto.internalNotes ? { internalNotes: dto.internalNotes } : {}),
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
        },
      },
      include: {
        customer: true,
        product: true,
        factory: true,
        assignedUser: { select: { id: true, name: true, email: true, role: true } },
        items: { include: { product: { include: { factory: true } } } },
      },
    });

    for (const item of dto.items) {
      const product = await this.prisma.product.findUnique({ where: { id: item.productId }, select: { inventory: true } });
      if (product && product.inventory > 0) {
        await this.prisma.product.update({
          where: { id: item.productId },
          data: { inventory: { decrement: Math.min(item.quantity, product.inventory) } },
        });
      }
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
      include: { customer: true, product: true, factory: true, assignedUser: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (!isValidTransition(order.orderType, order.status, newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${order.status} to ${newStatus}`,
      );
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id },
        data: {
          status: newStatus,
          ...(newStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
        },
        include: {
          customer: true,
          product: true,
          factory: true,
          assignedUser: { select: { id: true, name: true, email: true, role: true } },
          items: { include: { product: { include: { factory: true } } } },
        },
      }),
      this.prisma.orderStatusHistory.create({
        data: {
          orderId: id,
          oldStatus: order.status,
          newStatus,
          changedBy: userId,
          note,
        },
      }),
    ]);

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
    const existing = await this.prisma.orderItem.findFirst({
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
    const item = await this.prisma.orderItem.create({
      data: { orderId, productId: dto.productId, quantity: dto.quantity },
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
}
