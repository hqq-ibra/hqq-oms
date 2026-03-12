import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';

const DEFAULT_ATTRIBUTES = [
  'Price',
  'Currency',
  'MOQ',
  'Lead Time',
  'Capacity',
  'Warranty',
  'Payment Terms',
  'Delivery Terms',
  'Notes',
  'Score',
];

@Injectable()
export class QuotationWorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
  ) {}

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

  // ─── Initialize / Sync capabilities from Supplier Shortlist ───

  async initializeCapabilities(projectId: string, stageId: string, userId: string) {
    const supplierShortlistStage = await this.prisma.projectStage.findFirst({
      where: {
        projectId,
        OR: [
          { stageKey: 'SUPPLIER_SHORTLIST' },
          { name: { contains: 'Supplier Shortlist', mode: 'insensitive' } },
        ],
      },
    });

    if (!supplierShortlistStage) return [];

    const candidates = await this.prisma.projectCandidateSupplier.findMany({
      where: { projectId, stageId: supplierShortlistStage.id },
    });

    const capabilityNames = new Set(
      candidates.flatMap((c) =>
        (c.capabilities ?? []).map((n) => n.trim()).filter((n) => n.length > 0),
      ),
    );

    const created: string[] = [];

    // Create new QuotationCapability records for capabilities not yet tracked
    let idx = 0;
    for (const name of capabilityNames) {
      const existing = await this.prisma.quotationCapability.findUnique({
        where: { projectId_stageId_name: { projectId, stageId, name } },
      });

      if (!existing) {
        const cap = await this.prisma.quotationCapability.create({
          data: { projectId, stageId, name, orderIndex: idx },
        });

        for (let j = 0; j < DEFAULT_ATTRIBUTES.length; j++) {
          await this.prisma.comparisonAttribute.create({
            data: { capabilityId: cap.id, name: DEFAULT_ATTRIBUTES[j], orderIndex: j },
          });
        }
        created.push(name);
      }
      idx++;
    }

    // Sync ALL existing QuotationCapability records (not just new ones)
    const allCapabilities = await this.prisma.quotationCapability.findMany({
      where: { projectId, stageId },
    });

    for (const cap of allCapabilities) {
      await this.syncSuppliersForCapability(
        cap.id,
        projectId,
        supplierShortlistStage.id,
        cap.name,
      );
    }

    if (created.length > 0) {
      await this.logActivity(
        projectId,
        'QUOTATION_INITIALIZED',
        `Quotation workspace initialized with ${created.length} capabilities`,
        userId,
        { stageId, capabilities: created },
      );
    }

    return this.getCapabilities(projectId, stageId);
  }

  private async syncSuppliersForCapability(
    capabilityId: string,
    projectId: string,
    supplierShortlistStageId: string,
    capabilityName: string,
  ) {
    // Find candidates whose capabilities array contains this capability name
    const candidates = await this.prisma.projectCandidateSupplier.findMany({
      where: { projectId, stageId: supplierShortlistStageId, capabilities: { has: capabilityName } },
    });

    const currentCandidateIds = new Set(candidates.map((c) => c.id));

    // Add new supplier links
    for (const candidate of candidates) {
      const exists = await this.prisma.quotationSupplier.findUnique({
        where: { capabilityId_candidateId: { capabilityId, candidateId: candidate.id } },
      });
      if (!exists) {
        await this.prisma.quotationSupplier.create({
          data: { capabilityId, candidateId: candidate.id },
        });
      }
    }

    // Remove stale supplier links (candidates no longer having this capability)
    const existingLinks = await this.prisma.quotationSupplier.findMany({
      where: { capabilityId },
    });

    for (const link of existingLinks) {
      if (!currentCandidateIds.has(link.candidateId)) {
        await this.prisma.quotationSupplier.delete({
          where: { id: link.id },
        });
      }
    }
  }

  // ─── Get all capabilities with data ───

  async getCapabilities(projectId: string, stageId: string) {
    return this.prisma.quotationCapability.findMany({
      where: { projectId, stageId },
      include: {
        suppliers: {
          include: {
            candidate: {
              select: {
                id: true,
                name: true,
                country: true,
                capabilities: true,
                contactPerson: true,
                email: true,
                whatsapp: true,
                wechatId: true,
              },
            },
            files: {
              orderBy: { createdAt: 'desc' },
              include: { uploadedBy: { select: { id: true, name: true } } },
            },
            values: {
              include: { attribute: { select: { id: true, name: true, orderIndex: true } } },
            },
          },
        },
        attributes: { orderBy: { orderIndex: 'asc' } },
        winner: {
          include: { candidate: { select: { id: true, name: true } } },
        },
      },
      orderBy: { orderIndex: 'asc' },
    });
  }

  // ─── Quotation Files ───

  async uploadFile(
    projectId: string,
    capabilityId: string,
    supplierId: string,
    file: { fileName: string; filePath: string; fileType: string; fileSize?: number },
    userId: string,
  ) {
    const supplier = await this.prisma.quotationSupplier.findUnique({
      where: { id: supplierId },
      include: { candidate: { select: { name: true } } },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const record = await this.prisma.quotationFile.create({
      data: {
        projectId,
        capabilityId,
        supplierId,
        fileName: file.fileName,
        filePath: file.filePath,
        fileType: file.fileType,
        fileSize: file.fileSize,
        uploadedByUserId: userId,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });

    await this.logActivity(
      projectId,
      'QUOTATION_FILE_UPLOADED',
      `Quotation file "${file.fileName}" uploaded for ${supplier.candidate.name}`,
      userId,
      { capabilityId, supplierId, fileId: record.id },
    );

    this.wsGateway.emit('project.stage.updated', { projectId });
    return record;
  }

  async deleteFile(fileId: string, userId: string) {
    const file = await this.prisma.quotationFile.findUnique({ where: { id: fileId } });
    if (!file) throw new NotFoundException('File not found');

    await this.prisma.quotationFile.delete({ where: { id: fileId } });
    this.wsGateway.emit('project.stage.updated', { projectId: file.projectId });
    return { success: true };
  }

  // ─── Comparison Attributes ───

  async addAttribute(capabilityId: string, name: string) {
    const maxOrder = await this.prisma.comparisonAttribute.findFirst({
      where: { capabilityId },
      orderBy: { orderIndex: 'desc' },
      select: { orderIndex: true },
    });

    return this.prisma.comparisonAttribute.create({
      data: {
        capabilityId,
        name,
        orderIndex: (maxOrder?.orderIndex ?? -1) + 1,
      },
    });
  }

  async deleteAttribute(attributeId: string) {
    const attr = await this.prisma.comparisonAttribute.findUnique({ where: { id: attributeId } });
    if (!attr) throw new NotFoundException('Attribute not found');
    await this.prisma.comparisonAttribute.delete({ where: { id: attributeId } });
    return { success: true };
  }

  async reorderAttributes(capabilityId: string, attributeIds: string[]) {
    for (let i = 0; i < attributeIds.length; i++) {
      await this.prisma.comparisonAttribute.update({
        where: { id: attributeIds[i] },
        data: { orderIndex: i },
      });
    }
    return { success: true };
  }

  // ─── Comparison Values (inline edit) ───

  async updateValue(attributeId: string, supplierId: string, value: string) {
    return this.prisma.comparisonValue.upsert({
      where: { attributeId_supplierId: { attributeId, supplierId } },
      create: { attributeId, supplierId, value },
      update: { value },
    });
  }

  async bulkUpdateValues(
    values: { attributeId: string; supplierId: string; value: string }[],
  ) {
    for (const v of values) {
      await this.prisma.comparisonValue.upsert({
        where: { attributeId_supplierId: { attributeId: v.attributeId, supplierId: v.supplierId } },
        create: { attributeId: v.attributeId, supplierId: v.supplierId, value: v.value },
        update: { value: v.value },
      });
    }
    return { success: true };
  }

  // ─── Winner Selection ───

  async selectWinner(
    projectId: string,
    capabilityId: string,
    candidateId: string,
    userId: string,
  ) {
    const candidate = await this.prisma.projectCandidateSupplier.findUnique({
      where: { id: candidateId },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    const winner = await this.prisma.capabilityWinner.upsert({
      where: { capabilityId },
      create: { projectId, capabilityId, candidateId, selectedByUserId: userId },
      update: { candidateId, selectedByUserId: userId },
      include: { candidate: { select: { id: true, name: true } } },
    });

    await this.logActivity(
      projectId,
      'QUOTATION_WINNER_SELECTED',
      `"${candidate.name}" selected as winner`,
      userId,
      { capabilityId, candidateId },
    );

    this.wsGateway.emit('project.stage.updated', { projectId });
    return winner;
  }

  async clearWinner(projectId: string, capabilityId: string, userId: string) {
    const existing = await this.prisma.capabilityWinner.findUnique({ where: { capabilityId } });
    if (!existing) return { success: true };

    await this.prisma.capabilityWinner.delete({ where: { capabilityId } });
    this.wsGateway.emit('project.stage.updated', { projectId });
    return { success: true };
  }

  // ─── Get winners for project overview ───

  async getProjectWinners(projectId: string) {
    return this.prisma.capabilityWinner.findMany({
      where: { projectId },
      include: {
        capability: { select: { id: true, name: true } },
        candidate: { select: { id: true, name: true, country: true, capabilities: true } },
        selectedBy: { select: { id: true, name: true } },
      },
    });
  }
}
