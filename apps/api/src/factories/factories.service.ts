import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ListFactoriesQuery {
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const FACTORY_INCLUDE = { capability: true, contacts: true } as const;

@Injectable()
export class FactoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListFactoriesQuery): Promise<PaginatedResult<unknown>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { isActive: true };
    if (query.search?.trim()) {
      where.OR = [
        { name: { contains: query.search.trim(), mode: 'insensitive' } },
        { country: { contains: query.search.trim(), mode: 'insensitive' } },
        { capability: { name: { contains: query.search.trim(), mode: 'insensitive' } } },
        { contacts: { some: { wechatId: { contains: query.search.trim(), mode: 'insensitive' } } } },
        { notes: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.factory.findMany({
        where,
        skip,
        take: pageSize,
        include: FACTORY_INCLUDE,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.factory.count({ where }),
    ]);

    return { data, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  async getById(id: string) {
    const factory = await this.prisma.factory.findUnique({
      where: { id },
      include: FACTORY_INCLUDE,
    });
    if (!factory) throw new NotFoundException('Factory not found');
    return factory;
  }

  async create(data: {
    name: string;
    country: string;
    capabilityId: string;
    logo?: string;
    phone?: string;
    email?: string;
    website?: string;
    location?: string;
    notes?: string;
  }) {
    return this.prisma.factory.create({ data, include: FACTORY_INCLUDE });
  }

  async update(id: string, data: Record<string, unknown>) {
    await this.getById(id);
    return this.prisma.factory.update({ where: { id }, data, include: FACTORY_INCLUDE });
  }

  async delete(id: string) {
    await this.getById(id);
    const orderCount = await this.prisma.order.count({ where: { factoryId: id } });
    if (orderCount > 0) {
      throw new ConflictException(`Cannot delete: vendor has ${orderCount} order(s). Delete the orders first.`);
    }
    const productCount = await this.prisma.product.count({ where: { factoryId: id } });
    if (productCount > 0) {
      throw new ConflictException(`Cannot delete: vendor has ${productCount} product(s). Delete the products first.`);
    }
    await this.prisma.factory.delete({ where: { id } });
    return { success: true };
  }

  // ── Contacts ──

  async addContact(factoryId: string, data: { name: string; role: string; wechatId: string }) {
    await this.getById(factoryId);
    return this.prisma.vendorContact.create({
      data: { factoryId, ...data },
    });
  }

  async updateContact(contactId: string, data: { name?: string; role?: string; wechatId?: string }) {
    const contact = await this.prisma.vendorContact.findUnique({ where: { id: contactId } });
    if (!contact) throw new NotFoundException('Contact not found');
    return this.prisma.vendorContact.update({ where: { id: contactId }, data });
  }

  async deleteContact(contactId: string) {
    const contact = await this.prisma.vendorContact.findUnique({ where: { id: contactId } });
    if (!contact) throw new NotFoundException('Contact not found');
    return this.prisma.vendorContact.delete({ where: { id: contactId } });
  }

  // ── Import from Project Candidate Suppliers ──

  async listProjectsWithCandidates() {
    return this.prisma.project.findMany({
      where: {
        candidateSuppliers: { some: {} },
      },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        _count: { select: { candidateSuppliers: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async listCandidatesForProject(projectId: string) {
    const candidates = await this.prisma.projectCandidateSupplier.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        country: true,
        capabilities: true,
        contactPerson: true,
        wechatId: true,
        whatsapp: true,
        email: true,
        website: true,
        status: true,
        notes: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const allFactoryNames = await this.prisma.factory.findMany({
      where: { isActive: true },
      select: { name: true },
    });
    const existingNames = new Set(allFactoryNames.map((f) => f.name));

    return candidates.map((c) => ({
      ...c,
      existsInVendors: existingNames.has(c.name),
    }));
  }

  async importCandidatesAsFactories(supplierIds: string[]) {
    const results: { supplierId: string; factoryId: string; name: string }[] = [];

    for (const supplierId of supplierIds) {
      const supplier = await this.prisma.projectCandidateSupplier.findUnique({
        where: { id: supplierId },
      });
      if (!supplier) continue;

      const existing = await this.prisma.factory.findFirst({
        where: { name: supplier.name, isActive: true },
      });
      if (existing) continue;

      let capabilityId: string;
      const firstCap = supplier.capabilities[0];
      if (firstCap) {
        const cap = await this.prisma.capability.upsert({
          where: { name: firstCap },
          create: { name: firstCap },
          update: {},
        });
        capabilityId = cap.id;
      } else {
        const cap = await this.prisma.capability.upsert({
          where: { name: 'General' },
          create: { name: 'General' },
          update: {},
        });
        capabilityId = cap.id;
      }

      const factory = await this.prisma.factory.create({
        data: {
          name: supplier.name,
          country: supplier.country ?? '',
          capabilityId,
          email: supplier.email,
          website: supplier.website,
          phone: supplier.whatsapp,
          notes: supplier.notes,
        },
        include: FACTORY_INCLUDE,
      });

      if (supplier.contactPerson || supplier.wechatId) {
        await this.prisma.vendorContact.create({
          data: {
            factoryId: factory.id,
            name: supplier.contactPerson ?? supplier.name,
            role: 'Contact',
            wechatId: supplier.wechatId ?? '',
          },
        });
      }

      results.push({ supplierId, factoryId: factory.id, name: supplier.name });
    }

    return results;
  }
}
