import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';

export interface ListUsersQuery {
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

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListUsersQuery): Promise<PaginatedResult<unknown>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (query.search?.trim()) {
      where.OR = [
        { name: { contains: query.search.trim(), mode: 'insensitive' } },
        { email: { contains: query.search.trim(), mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          permissions: { select: { permissionKey: true } },
        },
      }),
      this.prisma.user.count({ where }),
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
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        permissions: { select: { permissionKey: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(data: {
    name: string;
    email: string;
    password: string;
    role?: string;
    permissions?: string[];
  }) {
    const existing = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existing) throw new ConflictException('Email already exists');

    const passwordHash = await argon2.hash(data.password);
    const { password: _, permissions, ...userData } = data;

    const user = await this.prisma.user.create({
      data: {
        ...userData,
        passwordHash,
        role: (userData.role as 'ADMIN' | 'SALES') ?? 'SALES',
      },
    });

    const allPermissions = [
      'VIEW_REPORTS', 'VIEW_COSTS', 'EDIT_COSTS', 'MANAGE_USERS',
      'EDIT_ORDERS', 'CHANGE_STATUS', 'UPLOAD_FILES',
      'MANAGE_PROJECTS', 'EDIT_PROJECTS',
    ];
    const permsToAssign = permissions?.length ? permissions : allPermissions;
    await this.prisma.userPermission.createMany({
      data: permsToAssign.map((permissionKey) => ({
        userId: user.id,
        permissionKey,
      })),
    });

    return this.getById(user.id);
  }

  async update(
    id: string,
    data: {
      name?: string;
      email?: string;
      password?: string;
      role?: string;
      permissions?: string[];
    },
  ) {
    await this.getById(id);

    if (data.email) {
      const existing = await this.prisma.user.findFirst({
        where: { email: data.email, NOT: { id } },
      });
      if (existing) throw new ConflictException('Email already exists');
    }

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.role !== undefined) updateData.role = data.role as 'ADMIN' | 'SALES';
    if (data.password) {
      updateData.passwordHash = await argon2.hash(data.password);
    }

    await this.prisma.user.update({
      where: { id },
      data: updateData,
    });

    if (data.permissions !== undefined) {
      await this.prisma.userPermission.deleteMany({ where: { userId: id } });
      if (data.permissions.length > 0) {
        await this.prisma.userPermission.createMany({
          data: data.permissions.map((permissionKey) => ({
            userId: id,
            permissionKey,
          })),
        });
      }
    }

    return this.getById(id);
  }

  async delete(id: string) {
    await this.getById(id);

    const orderCount = await this.prisma.order.count({ where: { assignedUserId: id } });
    const costCount = await this.prisma.orderCost.count({ where: { createdBy: id } });
    const statusCount = await this.prisma.orderStatusHistory.count({ where: { changedBy: id } });
    if (orderCount > 0 || costCount > 0 || statusCount > 0) {
      throw new ConflictException(
        'Cannot delete this user because they have associated orders, costs, or status changes. Deactivate them instead.',
      );
    }

    await this.prisma.userPermission.deleteMany({ where: { userId: id } });
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }
}
