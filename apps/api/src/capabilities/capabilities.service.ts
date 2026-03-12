import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CapabilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.capability.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async create(name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new ConflictException('Name is required');

    const existing = await this.prisma.capability.findUnique({
      where: { name: trimmed },
    });
    if (existing) throw new ConflictException('Capability already exists');

    return this.prisma.capability.create({
      data: { name: trimmed },
    });
  }

  async delete(id: string) {
    const count = await this.prisma.factory.count({
      where: { capabilityId: id },
    });
    if (count > 0) {
      throw new ConflictException(
        `Cannot delete: ${count} factory(ies) still use this capability`,
      );
    }
    return this.prisma.capability.delete({ where: { id } });
  }
}
