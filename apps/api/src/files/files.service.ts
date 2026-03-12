import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ListFilesQuery {
  entityType: string;
  entityId: string;
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
export class FilesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListFilesQuery): Promise<PaginatedResult<unknown>> {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 10));
    const skip = (page - 1) * pageSize;

    const where = {
      entityType: query.entityType,
      entityId: query.entityId,
    };

    const [data, total] = await Promise.all([
      this.prisma.file.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.file.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async create(data: {
    entityType: string;
    entityId: string;
    fileType: string;
    fileName: string;
    fileUrl: string;
  }, uploadedBy: string) {
    return this.prisma.file.create({
      data: {
        ...data,
        uploadedBy,
      },
    });
  }

  async delete(id: string) {
    const file = await this.prisma.file.findUnique({
      where: { id },
    });
    if (!file) throw new NotFoundException('File not found');
    await this.prisma.file.delete({
      where: { id },
    });
    return { success: true };
  }
}
