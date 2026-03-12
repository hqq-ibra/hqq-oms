import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface ListProductsQuery {
  search?: string;
  categoryId?: string;
  subcategoryId?: string;
  specMachine?: string;
  specCapacity?: string;
  specGrams?: string;
  specPattern?: string;
  unlinked?: boolean;
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

const productInclude = {
  factory: true,
  category: true,
  subcategory: true,
} as const;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListProductsQuery): Promise<PaginatedResult<unknown>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 10));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.subcategoryId) where.subcategoryId = query.subcategoryId;
    const specFilters: { path: string[]; equals: string }[] = [];
    if (query.specMachine) specFilters.push({ path: ['machine'], equals: query.specMachine });
    if (query.specCapacity) specFilters.push({ path: ['capacity'], equals: query.specCapacity });
    if (query.specGrams) specFilters.push({ path: ['grams'], equals: query.specGrams });
    if (query.specPattern) specFilters.push({ path: ['pattern'], equals: query.specPattern });
    if (specFilters.length > 0) {
      where.AND = specFilters.map((f) => ({ specs: f }));
    }
    if (query.unlinked) {
      where.customers = { none: {} };
    }
    if (query.search?.trim()) {
      where.OR = [
        { sku: { contains: query.search.trim(), mode: 'insensitive' } },
        { nameEn: { contains: query.search.trim(), mode: 'insensitive' } },
        { nameAr: { contains: query.search.trim(), mode: 'insensitive' } },
        { category: { name: { contains: query.search.trim(), mode: 'insensitive' } } },
        { subcategory: { name: { contains: query.search.trim(), mode: 'insensitive' } } },
        { notes: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        include: productInclude,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async getSpecOptions(query: {
    categoryId?: string;
    subcategoryId?: string;
    specMachine?: string;
    specCapacity?: string;
    specGrams?: string;
    specPattern?: string;
  }) {
    const where: Record<string, unknown> = { specs: { not: null } };
    if (query.categoryId) where.categoryId = query.categoryId;
    if (query.subcategoryId) where.subcategoryId = query.subcategoryId;

    const products = await this.prisma.product.findMany({
      where: where as any,
      select: { specs: true },
    });

    const machines = new Set<string>();
    const capacities = new Set<string>();
    const grams = new Set<string>();
    const patterns = new Set<string>();

    for (const p of products) {
      const s = p.specs as Record<string, string> | null;
      if (!s) continue;

      const matchMachine = !query.specMachine || s.machine?.toUpperCase() === query.specMachine.toUpperCase();
      const matchCapacity = !query.specCapacity || s.capacity?.toUpperCase() === query.specCapacity.toUpperCase();
      const matchGrams = !query.specGrams || s.grams === query.specGrams;
      const matchPattern = !query.specPattern || s.pattern === query.specPattern;

      if (matchCapacity && matchGrams && matchPattern && s.machine) machines.add(s.machine.toUpperCase());
      if (matchMachine && matchGrams && matchPattern && s.capacity) capacities.add(s.capacity.toUpperCase());
      if (matchMachine && matchCapacity && matchPattern && s.grams) grams.add(s.grams);
      if (matchMachine && matchCapacity && matchGrams && s.pattern) patterns.add(s.pattern);
    }

    return {
      machines: [...machines].sort(),
      capacities: [...capacities].sort(),
      grams: [...grams].sort(),
      patterns: [...patterns].sort(),
    };
  }

  async getById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: productInclude,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async create(data: {
    sku: string;
    nameEn: string;
    nameAr?: string;
    categoryId: string;
    subcategoryId?: string;
    factoryId?: string;
    notes?: string;
    inventory?: number;
  }) {
    if (!data.factoryId) delete data.factoryId;
    if (!data.subcategoryId) delete data.subcategoryId;
    return this.prisma.product.create({
      data: { ...data, inventory: data.inventory ?? 0 },
      include: productInclude,
    });
  }

  async update(id: string, data: Record<string, unknown>) {
    await this.getById(id);
    return this.prisma.product.update({
      where: { id },
      data,
      include: productInclude,
    });
  }

  async delete(id: string) {
    await this.getById(id);
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false },
      include: productInclude,
    });
  }

  async listCategories() {
    const cats = await this.prisma.productCategory.findMany({
      include: { subcategories: { orderBy: { name: 'asc' } } },
      orderBy: { name: 'asc' },
    });
    const priority = ['SIL', 'KNF'];
    return cats.sort((a, b) => {
      const ai = priority.indexOf(a.skuPrefix);
      const bi = priority.indexOf(b.skuPrefix);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  async createCategory(data: { name: string; skuPrefix: string }) {
    return this.prisma.productCategory.create({
      data,
      include: { subcategories: true },
    });
  }

  async createSubcategory(categoryId: string, data: { name: string; skuCode: string }) {
    const cat = await this.prisma.productCategory.findUnique({ where: { id: categoryId } });
    if (!cat) throw new NotFoundException('Category not found');
    return this.prisma.productSubcategory.create({
      data: { ...data, categoryId },
    });
  }

  async deleteCategory(categoryId: string) {
    const cat = await this.prisma.productCategory.findUnique({ where: { id: categoryId } });
    if (!cat) throw new NotFoundException('Category not found');

    const productCount = await this.prisma.product.count({ where: { categoryId } });
    if (productCount > 0) {
      throw new BadRequestException(
        `Cannot delete category "${cat.name}" — it has ${productCount} product(s). Remove or reassign them first.`,
      );
    }

    await this.prisma.productCategory.delete({ where: { id: categoryId } });
    return { success: true };
  }

  async deleteSubcategory(categoryId: string, subcategoryId: string) {
    const sub = await this.prisma.productSubcategory.findFirst({
      where: { id: subcategoryId, categoryId },
    });
    if (!sub) throw new NotFoundException('Subcategory not found');

    const productCount = await this.prisma.product.count({ where: { subcategoryId } });
    if (productCount > 0) {
      throw new BadRequestException(
        `Cannot delete subcategory "${sub.name}" — it has ${productCount} product(s). Remove or reassign them first.`,
      );
    }

    await this.prisma.productSubcategory.delete({ where: { id: subcategoryId } });
    return { success: true };
  }

  async suggestSku(categoryId: string, subcategoryId?: string) {
    const cat = await this.prisma.productCategory.findUnique({ where: { id: categoryId } });
    if (!cat) throw new NotFoundException('Category not found');

    let prefix = cat.skuPrefix;
    if (subcategoryId) {
      const sub = await this.prisma.productSubcategory.findUnique({ where: { id: subcategoryId } });
      if (sub) prefix = `${cat.skuPrefix}-${sub.skuCode}`;
    }

    const lastProduct = await this.prisma.product.findFirst({
      where: { sku: { startsWith: prefix } },
      orderBy: { sku: 'desc' },
    });

    let nextNum = 1;
    if (lastProduct) {
      const parts = lastProduct.sku.split('-');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }

    return { sku: `${prefix}-${String(nextNum).padStart(3, '0')}` };
  }

  async getFiles(productId: string) {
    await this.getById(productId);
    return this.prisma.file.findMany({
      where: { entityType: 'PRODUCT', entityId: productId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async addFile(
    productId: string,
    data: { fileName: string; fileUrl: string; fileType: string },
    uploadedBy: string,
  ) {
    await this.getById(productId);
    return this.prisma.file.create({
      data: {
        entityType: 'PRODUCT',
        entityId: productId,
        ...data,
        uploadedBy,
      },
    });
  }

  async deleteFile(productId: string, fileId: string) {
    const file = await this.prisma.file.findUnique({ where: { id: fileId } });
    if (!file || file.entityId !== productId) throw new NotFoundException('File not found');
    await this.prisma.file.delete({ where: { id: fileId } });
    return { success: true };
  }

  async getCustomers(productId: string) {
    await this.getById(productId);
    const links = await this.prisma.customerProduct.findMany({
      where: { productId },
      include: { customer: true },
      orderBy: { createdAt: 'desc' },
    });
    return links.map((l) => ({ ...l.customer, linkedAt: l.createdAt }));
  }

  async linkCustomer(productId: string, customerId: string) {
    await this.getById(productId);
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new NotFoundException('Customer not found');
    const existing = await this.prisma.customerProduct.findUnique({
      where: { customerId_productId: { customerId, productId } },
    });
    if (existing) return existing;
    return this.prisma.customerProduct.create({
      data: { customerId, productId },
    });
  }

  async unlinkCustomer(productId: string, customerId: string) {
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
