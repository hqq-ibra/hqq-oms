import { Injectable, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';
import { QuotationWorkspaceService } from './quotation-workspace.service';
import { QuoteComparisonService } from './quote-comparison.service';

const SUPPLIER_INCLUDE = {
  files: {
    include: { uploadedBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'desc' as const },
  },
};

@Injectable()
export class CandidateSupplierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
    @Inject(forwardRef(() => QuotationWorkspaceService))
    private readonly quotationWorkspace: QuotationWorkspaceService,
    @Inject(forwardRef(() => QuoteComparisonService))
    private readonly quoteComparison: QuoteComparisonService,
  ) {}

  private async ensureCapabilitiesExist(names: string[]) {
    for (const name of names) {
      if (!name?.trim()) continue;
      await this.prisma.capability.upsert({
        where: { name: name.trim() },
        create: { name: name.trim() },
        update: {},
      });
    }
  }

  private async logActivity(
    projectId: string,
    eventType: string,
    message: string,
    userId: string,
    meta?: Record<string, unknown>,
  ) {
    await this.prisma.projectActivity.create({
      data: {
        projectId,
        eventType,
        message,
        metaJson: meta ? (meta as Prisma.InputJsonValue) : undefined,
        createdByUserId: userId,
      },
    });
    this.wsGateway.emit('project.activity.created', { projectId });
  }

  private async syncQuotationWorkspace(projectId: string, userId: string) {
    try {
      const quotationStage = await this.prisma.projectStage.findFirst({
        where: {
          projectId,
          OR: [
            { stageKey: 'QUOTATION_SAMPLES' },
            { name: { contains: 'Quotation & Samples', mode: 'insensitive' } },
          ],
        },
      });
      if (quotationStage) {
        await this.quotationWorkspace.initializeCapabilities(projectId, quotationStage.id, userId);
        await this.quoteComparison.syncFromShortlist(projectId, quotationStage.id, userId);
        this.wsGateway.emit('project.stage.updated', { projectId, stageId: quotationStage.id });
      }
    } catch (err) {
      console.error('[syncQuotationWorkspace] Error:', err);
    }
  }

  async list(projectId: string, stageId: string, status?: string) {
    const where: Prisma.ProjectCandidateSupplierWhereInput = { projectId, stageId };
    if (status) where.status = status;
    return this.prisma.projectCandidateSupplier.findMany({
      where,
      include: { _count: { select: { files: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(id: string) {
    const supplier = await this.prisma.projectCandidateSupplier.findUnique({
      where: { id },
      include: SUPPLIER_INCLUDE,
    });
    if (!supplier) throw new NotFoundException('Candidate supplier not found');
    return supplier;
  }

  async create(
    projectId: string,
    stageId: string,
    dto: {
      name: string;
      country?: string;
      capabilities?: string[];
      contactPerson?: string;
      wechatId?: string;
      whatsapp?: string;
      email?: string;
      website?: string;
      notes?: string;
    },
    userId: string,
  ) {
    const caps = (dto.capabilities ?? []).map((c) => c.trim()).filter(Boolean);
    if (caps.length > 0) await this.ensureCapabilitiesExist(caps);

    const supplier = await this.prisma.projectCandidateSupplier.create({
      data: {
        projectId,
        stageId,
        name: dto.name,
        country: dto.country,
        capabilities: caps,
        contactPerson: dto.contactPerson,
        wechatId: dto.wechatId,
        whatsapp: dto.whatsapp,
        email: dto.email,
        website: dto.website,
        notes: dto.notes,
      },
      include: SUPPLIER_INCLUDE,
    });

    await this.logActivity(
      projectId,
      'SUPPLIER_ADDED',
      `Candidate supplier "${dto.name}" added`,
      userId,
      { stageId, supplierId: supplier.id },
    );
    this.wsGateway.emit('project.stage.updated', { projectId, stageId });
    return supplier;
  }

  async update(
    id: string,
    dto: {
      name?: string;
      country?: string;
      capabilities?: string[];
      contactPerson?: string;
      wechatId?: string;
      whatsapp?: string;
      email?: string;
      website?: string;
      status?: string;
      notes?: string;
    },
    userId: string,
  ) {
    const existing = await this.prisma.projectCandidateSupplier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Candidate supplier not found');

    const data: Record<string, unknown> = { ...dto };
    if (dto.capabilities !== undefined) {
      const caps = dto.capabilities.map((c) => c.trim()).filter(Boolean);
      if (caps.length > 0) await this.ensureCapabilitiesExist(caps);
      data.capabilities = caps;
    }
    delete data.capability;

    const supplier = await this.prisma.projectCandidateSupplier.update({
      where: { id },
      data,
      include: SUPPLIER_INCLUDE,
    });

    const oldStatus = existing.status;
    const newStatus = dto.status;

    if (newStatus && newStatus !== oldStatus) {
      let eventType = 'SUPPLIER_UPDATED';
      if (newStatus === 'CONTACTED') eventType = 'SUPPLIER_CONTACTED';
      else if (newStatus === 'SELECTED') eventType = 'SUPPLIER_SELECTED';
      else if (newStatus === 'REJECTED') eventType = 'SUPPLIER_REJECTED';

      await this.logActivity(
        existing.projectId,
        eventType,
        `Supplier "${existing.name}" status: ${oldStatus} → ${newStatus}`,
        userId,
        { stageId: existing.stageId, supplierId: id, oldStatus, newStatus },
      );
    } else {
      await this.logActivity(
        existing.projectId,
        'SUPPLIER_UPDATED',
        `Supplier "${existing.name}" updated`,
        userId,
        { stageId: existing.stageId, supplierId: id },
      );
    }

    this.wsGateway.emit('project.stage.updated', { projectId: existing.projectId, stageId: existing.stageId });

    if (dto.capabilities !== undefined) {
      await this.syncQuotationWorkspace(existing.projectId, userId);
    }

    return supplier;
  }

  async remove(id: string, userId: string) {
    const existing = await this.prisma.projectCandidateSupplier.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Candidate supplier not found');

    await this.prisma.projectCandidateSupplier.delete({ where: { id } });

    await this.logActivity(
      existing.projectId,
      'SUPPLIER_UPDATED',
      `Candidate supplier "${existing.name}" removed`,
      userId,
      { stageId: existing.stageId, supplierId: id },
    );
    this.wsGateway.emit('project.stage.updated', { projectId: existing.projectId, stageId: existing.stageId });

    if (existing.capabilities.length > 0) {
      await this.syncQuotationWorkspace(existing.projectId, userId);
    }

    return { success: true };
  }

  // ─── Supplier Files ───

  async createFile(
    supplierId: string,
    dto: { title: string; filePath: string; fileType: string; fileSize?: number },
    userId: string,
  ) {
    const supplier = await this.prisma.projectCandidateSupplier.findUnique({ where: { id: supplierId } });
    if (!supplier) throw new NotFoundException('Candidate supplier not found');

    const file = await this.prisma.projectCandidateSupplierFile.create({
      data: {
        supplierId,
        title: dto.title,
        filePath: dto.filePath,
        fileType: dto.fileType,
        fileSize: dto.fileSize,
        uploadedByUserId: userId,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });

    await this.logActivity(
      supplier.projectId,
      'SUPPLIER_FILE_UPLOADED',
      `File "${dto.title}" uploaded for supplier "${supplier.name}"`,
      userId,
      { stageId: supplier.stageId, supplierId, fileId: file.id },
    );
    return file;
  }

  async deleteFile(fileId: string, userId: string) {
    const file = await this.prisma.projectCandidateSupplierFile.findUnique({
      where: { id: fileId },
      include: { supplier: true },
    });
    if (!file) throw new NotFoundException('File not found');

    await this.prisma.projectCandidateSupplierFile.delete({ where: { id: fileId } });
    return { success: true };
  }

  // ─── Promote to Global Factories ───

  async promoteToFactories(
    projectId: string,
    supplierIds: string[],
    userId: string,
  ) {
    const results: { supplierId: string; factoryId: string; name: string }[] = [];

    for (const supplierId of supplierIds) {
      const supplier = await this.prisma.projectCandidateSupplier.findUnique({
        where: { id: supplierId },
      });
      if (!supplier) continue;

      const firstCap = supplier.capabilities[0];
      let capabilityId: string | null = null;
      if (firstCap) {
        const cap = await this.prisma.capability.upsert({
          where: { name: firstCap },
          create: { name: firstCap },
          update: {},
        });
        capabilityId = cap.id;
      } else {
        const defaultCap = await this.prisma.capability.upsert({
          where: { name: 'General' },
          create: { name: 'General' },
          update: {},
        });
        capabilityId = defaultCap.id;
      }

      const factory = await this.prisma.factory.create({
        data: {
          name: supplier.name,
          country: supplier.country ?? '',
          capabilityId,
          email: supplier.email,
          website: supplier.website,
          notes: supplier.notes,
        },
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

      await this.logActivity(
        projectId,
        'SUPPLIER_PROMOTED_TO_GLOBAL',
        `Supplier "${supplier.name}" added to global supplier list`,
        userId,
        { supplierId, factoryId: factory.id },
      );
    }

    this.wsGateway.emit('project.updated', { projectId });
    return results;
  }

  // ─── Import from Global Vendors ───

  async importFromFactories(
    projectId: string,
    stageId: string,
    factoryIds: string[],
    userId: string,
  ) {
    const results: { factoryId: string; supplierId: string; name: string }[] = [];

    for (const factoryId of factoryIds) {
      const factory = await this.prisma.factory.findUnique({
        where: { id: factoryId },
        include: {
          capability: true,
          contacts: { take: 1 },
        },
      });
      if (!factory) continue;

      const existing = await this.prisma.projectCandidateSupplier.findFirst({
        where: { projectId, stageId, name: factory.name },
      });
      if (existing) continue;

      const contact = factory.contacts[0];

      const supplier = await this.prisma.projectCandidateSupplier.create({
        data: {
          projectId,
          stageId,
          name: factory.name,
          country: factory.country,
          capabilities: factory.capability?.name ? [factory.capability.name] : [],
          contactPerson: contact?.name ?? null,
          wechatId: contact?.wechatId ?? null,
          whatsapp: factory.phone,
          email: factory.email,
          website: factory.website,
          notes: factory.notes,
          status: 'NEW',
        },
      });

      results.push({ factoryId, supplierId: supplier.id, name: factory.name });

      await this.logActivity(
        projectId,
        'SUPPLIER_ADDED',
        `Vendor "${factory.name}" imported to candidate list`,
        userId,
        { stageId, supplierId: supplier.id, factoryId },
      );
    }

    this.wsGateway.emit('project.stage.updated', { projectId, stageId });
    return results;
  }
}
