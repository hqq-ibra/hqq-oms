import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ListCustomersQuery {
  search?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ContactInput {
  name: string;
  role: string;
  phone: string;
  email?: string;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCustomersQuery): Promise<PaginatedResult<unknown>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (query.search?.trim()) {
      const s = query.search.trim();
      where.OR = [
        { customerCode: { contains: s, mode: 'insensitive' } },
        { name: { contains: s, mode: 'insensitive' } },
        { type: { contains: s, mode: 'insensitive' } },
        { city: { contains: s, mode: 'insensitive' } },
        { notes: { contains: s, mode: 'insensitive' } },
        { contacts: { some: { name: { contains: s, mode: 'insensitive' } } } },
        { contacts: { some: { role: { contains: s, mode: 'insensitive' } } } },
        { contacts: { some: { phone: { contains: s, mode: 'insensitive' } } } },
        { contacts: { some: { email: { contains: s, mode: 'insensitive' } } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: query.sortBy
          ? { [query.sortBy]: query.sortOrder ?? 'asc' }
          : { createdAt: 'desc' },
        include: { contacts: { orderBy: { createdAt: 'asc' } } },
      }),
      this.prisma.customer.count({ where }),
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
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { contacts: { orderBy: { createdAt: 'asc' } } },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  private async getNextCustomerCode(): Promise<string> {
    const last = await this.prisma.customer.findFirst({
      where: { customerCode: { startsWith: 'C' } },
      orderBy: { customerCode: 'desc' },
    });
    if (!last) return 'C001';
    const num = parseInt(last.customerCode.replace(/^C/i, ''), 10);
    return `C${String(num + 1).padStart(3, '0')}`;
  }

  async create(data: {
    type?: string;
    name: string;
    city?: string;
    googleMapsUrl?: string;
    notes?: string;
    contacts?: ContactInput[];
  }) {
    const { contacts, ...customerData } = data;
    const customerCode = await this.getNextCustomerCode();
    return this.prisma.customer.create({
      data: {
        ...customerData,
        customerCode,
        contacts: contacts?.length
          ? { create: contacts }
          : undefined,
      },
      include: { contacts: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async update(
    id: string,
    data: {
      type?: string;
      name?: string;
      city?: string;
      googleMapsUrl?: string;
      notes?: string;
      contacts?: ContactInput[];
    },
  ) {
    await this.getById(id);
    const { contacts, ...customerData } = data;

    if (contacts !== undefined) {
      await this.prisma.customerContact.deleteMany({ where: { customerId: id } });
    }

    return this.prisma.customer.update({
      where: { id },
      data: {
        ...customerData,
        contacts:
          contacts !== undefined
            ? { create: contacts }
            : undefined,
      },
      include: { contacts: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async delete(id: string) {
    await this.getById(id);
    const orderCount = await this.prisma.order.count({ where: { customerId: id } });
    if (orderCount > 0) {
      throw new ConflictException(`Cannot delete: customer has ${orderCount} order(s). Delete the orders first.`);
    }
    await this.prisma.customer.delete({ where: { id } });
    return { success: true };
  }

  async getProducts(customerId: string) {
    await this.getById(customerId);
    const links = await this.prisma.customerProduct.findMany({
      where: { customerId },
      include: { product: { include: { factory: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return links.map((l) => ({ ...l.product, linkedAt: l.createdAt }));
  }

  async linkProduct(customerId: string, productId: string) {
    await this.getById(customerId);
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product not found');
    const existing = await this.prisma.customerProduct.findUnique({
      where: { customerId_productId: { customerId, productId } },
    });
    if (existing) return existing;
    return this.prisma.customerProduct.create({
      data: { customerId, productId },
    });
  }

  async unlinkProduct(customerId: string, productId: string) {
    const existing = await this.prisma.customerProduct.findUnique({
      where: { customerId_productId: { customerId, productId } },
    });
    if (!existing) throw new NotFoundException('Link not found');
    await this.prisma.customerProduct.delete({
      where: { customerId_productId: { customerId, productId } },
    });
    return { success: true };
  }
}
