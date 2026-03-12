import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';
interface StageTemplate { name: string; stageKey: string }

const INTERNAL_STAGES: StageTemplate[] = [
  { name: 'Idea & Scope', stageKey: 'IDEA_SCOPE' },
  { name: 'Research & Requirements', stageKey: 'RESEARCH_REQUIREMENTS' },
  { name: 'Supplier Shortlist', stageKey: 'SUPPLIER_SHORTLIST' },
  { name: 'Quotation & Samples', stageKey: 'QUOTATION_SAMPLES' },
  { name: 'Decision (Go/No-Go)', stageKey: 'DECISION_GO_NOGO' },
  { name: 'Execution Plan', stageKey: 'EXECUTION_PLAN' },
  { name: 'Execution / Build', stageKey: 'EXECUTION_BUILD' },
  { name: 'QA & Acceptance', stageKey: 'QA_ACCEPTANCE' },
  { name: 'Close & Learn', stageKey: 'CLOSE_LEARN' },
];

const CLIENT_STAGES: StageTemplate[] = [
  { name: 'Idea & Scope', stageKey: 'IDEA_SCOPE' },
  { name: 'Research & Requirements', stageKey: 'RESEARCH_REQUIREMENTS' },
  { name: 'Supplier Shortlist', stageKey: 'SUPPLIER_SHORTLIST' },
  { name: 'Quotation & Samples', stageKey: 'QUOTATION_SAMPLES' },
  { name: 'Quotation & Client Approval', stageKey: 'CLIENT_APPROVAL' },
  { name: 'Execution Plan', stageKey: 'EXECUTION_PLAN' },
  { name: 'Execution / Build', stageKey: 'EXECUTION_BUILD' },
  { name: 'QA & Acceptance', stageKey: 'QA_ACCEPTANCE' },
  { name: 'Close & Learn', stageKey: 'CLOSE_LEARN' },
];

const STAGE_TEMPLATES: Record<string, StageTemplate[]> = {
  CLIENT: CLIENT_STAGES,
  INTERNAL: INTERNAL_STAGES,
};

enum ProjectActivityType {
  PROJECT_CREATED = 'PROJECT_CREATED',
  PROJECT_UPDATED = 'PROJECT_UPDATED',
  STAGE_CREATED = 'STAGE_CREATED',
  STAGE_STATUS_CHANGED = 'STAGE_STATUS_CHANGED',
  TASK_CREATED = 'TASK_CREATED',
  TASK_STATUS_CHANGED = 'TASK_STATUS_CHANGED',
  FILE_ADDED = 'FILE_ADDED',
  FILE_REMOVED = 'FILE_REMOVED',
  CONTACT_ADDED = 'CONTACT_ADDED',
  CONTACT_LOGGED = 'CONTACT_LOGGED',
  NOTE_ADDED = 'NOTE_ADDED',
  TASK_DELETED = 'TASK_DELETED',
  CONTACT_REMOVED = 'CONTACT_REMOVED',
  CLIENT_QUOTE_UPDATED = 'CLIENT_QUOTE_UPDATED',
  CLIENT_DECISION_UPDATED = 'CLIENT_DECISION_UPDATED',
  QUOTATION_UPLOADED = 'QUOTATION_UPLOADED',
  PRICING_UPDATED = 'PRICING_UPDATED',
  CLIENT_STATUS_CHANGED = 'CLIENT_STATUS_CHANGED',
  CLIENT_NOTE_ADDED = 'CLIENT_NOTE_ADDED',
  CLIENT_APPROVED = 'CLIENT_APPROVED',
}

enum ProjectStageStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  DONE = 'DONE',
}

enum ProjectTaskStatus {
  TODO = 'TODO',
  DOING = 'DOING',
  DONE = 'DONE',
}

interface ProjectListFilters {
  status?: string;
  priority?: string;
  ownerUserId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
  ) {}

  // ─── Project Code Generator ───

  private async getNextProjectCode(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PRJ-${year}-`;
    const last = await this.prisma.project.findFirst({
      where: { code: { startsWith: prefix } },
      orderBy: { code: 'desc' },
    });
    const nextNum = last
      ? parseInt(last.code.replace(prefix, ''), 10) + 1
      : 1;
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  }

  // ─── Projects CRUD ───

  async list(filters: ProjectListFilters) {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 10));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.priority) where.priority = filters.priority;
    if (filters.ownerUserId) where.ownerUserId = filters.ownerUserId;

    if (filters.search?.trim()) {
      const term = filters.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { code: { contains: term, mode: 'insensitive' } },
        { tags: { has: term } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { id: true, name: true, email: true } },
          customer: { select: { id: true, name: true, customerCode: true } },
          currentStage: { select: { id: true, name: true, status: true } },
          _count: { select: { tasks: { where: { status: { not: 'DONE' } } } } },
          activities: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { createdAt: true, message: true },
          },
        },
      }),
      this.prisma.project.count({ where }),
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
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, name: true, customerCode: true } },
        currentStage: true,
        stages: {
          orderBy: { orderIndex: 'asc' },
          include: {
            _count: {
              select: { stickyNotes: true, stageFiles: true, stageTasks: true },
            },
          },
        },
        clientQuote: true,
        clientDecision: {
          include: { decidedBy: { select: { id: true, name: true } } },
        },
        tasks: {
          orderBy: { createdAt: 'desc' },
          include: {
            assignee: { select: { id: true, name: true } },
            stage: { select: { id: true, name: true } },
          },
        },
        contacts: { orderBy: { createdAt: 'desc' } },
        files: {
          orderBy: { createdAt: 'desc' },
          include: {
            uploadedBy: { select: { id: true, name: true } },
            stage: { select: { id: true, name: true } },
          },
        },
        pinnedItems: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async create(
    dto: {
      name: string;
      projectType?: string;
      customerId?: string;
      summary?: string;
      priority?: string;
      startDate?: string;
      targetDate?: string;
      tags?: string[];
      successCriteria?: string;
    },
    userId: string,
  ) {
    const code = await this.getNextProjectCode();
    const projectType = dto.projectType === 'INTERNAL' ? 'INTERNAL' : 'CLIENT';

    const project = await this.prisma.$transaction(async (tx) => {
      const p = await tx.project.create({
        data: {
          code,
          name: dto.name,
          projectType,
          customerId: projectType === 'CLIENT' ? (dto.customerId ?? null) : null,
          ownerUserId: userId,
          summary: dto.summary,
          priority: dto.priority ?? 'MEDIUM',
          tags: dto.tags ?? [],
          successCriteria: dto.successCriteria,
          ...(dto.startDate ? { startDate: new Date(dto.startDate) } : {}),
          ...(dto.targetDate ? { targetDate: new Date(dto.targetDate) } : {}),
        },
      });

      const template = STAGE_TEMPLATES[projectType] ?? CLIENT_STAGES;
      const stageData = template.map((s, idx) => ({
        projectId: p.id,
        name: s.name,
        stageKey: s.stageKey,
        orderIndex: idx,
        status: 'NOT_STARTED',
      }));
      await tx.projectStage.createMany({ data: stageData });

      // Set first stage as current
      const firstStage = await tx.projectStage.findFirst({
        where: { projectId: p.id, orderIndex: 0 },
      });
      if (firstStage) {
        await tx.project.update({
          where: { id: p.id },
          data: { currentStageId: firstStage.id },
        });
      }

      await tx.projectActivity.create({
        data: {
          projectId: p.id,
          eventType: ProjectActivityType.PROJECT_CREATED,
          message: `Project "${p.name}" created`,
          createdByUserId: userId,
        },
      });

      return tx.project.findUnique({
        where: { id: p.id },
        include: {
          owner: { select: { id: true, name: true, email: true } },
          customer: { select: { id: true, name: true, customerCode: true } },
          currentStage: true,
          stages: { orderBy: { orderIndex: 'asc' } },
        },
      });
    });

    this.wsGateway.emit('project.updated', project);
    return project;
  }

  async update(
    id: string,
    dto: {
      name?: string;
      status?: string;
      priority?: string;
      summary?: string;
      successCriteria?: string | null;
      startDate?: string | null;
      targetDate?: string | null;
      tags?: string[];
      currentStageId?: string | null;
      customerId?: string | null;
    },
    userId: string,
  ) {
    const existing = await this.getById(id);

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.customerId !== undefined) data.customerId = dto.customerId;
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (['DONE', 'CANCELLED'].includes(dto.status) && !existing.closedAt) {
        data.closedAt = new Date();
      }
      if (!['DONE', 'CANCELLED'].includes(dto.status) && existing.closedAt) {
        data.closedAt = null;
      }
    }
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.summary !== undefined) data.summary = dto.summary;
    if (dto.successCriteria !== undefined) data.successCriteria = dto.successCriteria;
    if (dto.tags !== undefined) data.tags = dto.tags;
    if (dto.currentStageId !== undefined) data.currentStageId = dto.currentStageId;
    if (dto.startDate !== undefined)
      data.startDate = dto.startDate ? new Date(dto.startDate) : null;
    if (dto.targetDate !== undefined)
      data.targetDate = dto.targetDate ? new Date(dto.targetDate) : null;

    const project = await this.prisma.project.update({
      where: { id },
      data,
      include: {
        owner: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, name: true, customerCode: true } },
        currentStage: true,
      },
    });

    const changes = Object.keys(dto).filter((k) => dto[k as keyof typeof dto] !== undefined);
    await this.logActivity(
      id,
      ProjectActivityType.PROJECT_UPDATED,
      `Project updated: ${changes.join(', ')}`,
      userId,
      { changes: dto },
    );

    this.wsGateway.emit('project.updated', project);
    return project;
  }

  async remove(id: string, userId: string) {
    await this.getById(id);
    await this.prisma.project.delete({ where: { id } });
    this.wsGateway.emit('project.updated', { id, deleted: true });
    return { success: true };
  }

  async duplicate(id: string, userId: string) {
    const source = await this.prisma.project.findUnique({
      where: { id },
      include: {
        stages: {
          orderBy: { orderIndex: 'asc' },
          include: {
            stickyNotes: true,
            document: true,
            stageFiles: true,
            stageTasks: true,
          },
        },
        contacts: true,
        tasks: true,
        files: true,
        candidateSuppliers: { include: { files: true } },
        quotationCapabilities: {
          include: {
            suppliers: { include: { values: true } },
            files: true,
            attributes: { include: { values: true } },
            winner: true,
          },
        },
        quoteComparisons: {
          include: {
            items: { include: { lines: true } },
            suppliers: { include: { lines: true } },
          },
        },
        clientQuote: true,
        clientApprovalPricing: true,
        clientApprovalStatus: true,
        clientApprovalNotes: true,
        clientApprovalFiles: true,
      },
    });
    if (!source) throw new NotFoundException('Project not found');

    const code = await this.getNextProjectCode();

    const project = await this.prisma.$transaction(async (tx) => {
      // 1) Project
      const p = await tx.project.create({
        data: {
          code,
          name: `${source.name} (Copy)`,
          projectType: source.projectType,
          customerId: source.customerId,
          ownerUserId: userId,
          summary: source.summary,
          priority: source.priority,
          tags: source.tags as string[],
          successCriteria: source.successCriteria,
          includeVat: source.includeVat,
          quoteCurrency: source.quoteCurrency,
        },
      });

      // 2) Stages + stageIdMap
      const stageIdMap = new Map<string, string>();
      for (const s of source.stages) {
        const ns = await tx.projectStage.create({
          data: {
            projectId: p.id,
            name: s.name,
            stageKey: s.stageKey,
            orderIndex: s.orderIndex,
            status: s.status,
            notes: s.notes,
          },
        });
        stageIdMap.set(s.id, ns.id);
      }

      // set currentStage
      if (source.currentStageId && stageIdMap.has(source.currentStageId)) {
        await tx.project.update({
          where: { id: p.id },
          data: { currentStageId: stageIdMap.get(source.currentStageId) },
        });
      }

      // 3) Stage sub-data: sticky notes, documents, files, tasks
      for (const s of source.stages) {
        const newStageId = stageIdMap.get(s.id)!;
        if (s.stickyNotes.length > 0) {
          await tx.stageStickyNote.createMany({
            data: s.stickyNotes.map((n) => ({
              stageId: newStageId,
              title: n.title,
              content: n.content,
              color: n.color,
              positionX: n.positionX,
              positionY: n.positionY,
              createdByUserId: userId,
            })),
          });
        }
        if (s.document) {
          await tx.stageDocument.create({
            data: {
              stageId: newStageId,
              content: s.document.content as any,
              updatedByUserId: userId,
            },
          });
        }
        if (s.stageFiles.length > 0) {
          await tx.stageFile.createMany({
            data: s.stageFiles.map((f) => ({
              stageId: newStageId,
              title: f.title,
              filePath: f.filePath,
              fileType: f.fileType,
              fileSize: f.fileSize,
              uploadedByUserId: userId,
            })),
          });
        }
        if (s.stageTasks.length > 0) {
          await tx.stageTask.createMany({
            data: s.stageTasks.map((t) => ({
              stageId: newStageId,
              title: t.title,
              description: t.description,
              status: t.status,
              assigneeUserId: t.assigneeUserId,
              dueDate: t.dueDate,
            })),
          });
        }
      }

      // 4) Contacts
      if (source.contacts.length > 0) {
        await tx.projectContact.createMany({
          data: source.contacts.map((c) => ({
            projectId: p.id,
            name: c.name,
            company: c.company,
            country: c.country,
            capability: c.capability,
            wechatId: c.wechatId,
            contactPerson: c.contactPerson,
            contactPosition: c.contactPosition,
            whatsapp: c.whatsapp,
            email: c.email,
            website: c.website,
            location: c.location,
            notes: c.notes,
          })),
        });
      }

      // 5) Candidate Suppliers + candidateIdMap
      const candidateIdMap = new Map<string, string>();
      for (const cs of source.candidateSuppliers) {
        const newStageId = stageIdMap.get(cs.stageId);
        if (!newStageId) continue;
        const ncs = await tx.projectCandidateSupplier.create({
          data: {
            projectId: p.id,
            stageId: newStageId,
            name: cs.name,
            country: cs.country,
            capabilities: cs.capabilities as string[],
            contactPerson: cs.contactPerson,
            wechatId: cs.wechatId,
            whatsapp: cs.whatsapp,
            email: cs.email,
            website: cs.website,
            status: cs.status,
            notes: cs.notes,
          },
        });
        candidateIdMap.set(cs.id, ncs.id);

        if (cs.files.length > 0) {
          await tx.projectCandidateSupplierFile.createMany({
            data: cs.files.map((f) => ({
              supplierId: ncs.id,
              title: f.title,
              filePath: f.filePath,
              fileType: f.fileType,
              fileSize: f.fileSize,
              uploadedByUserId: userId,
            })),
          });
        }
      }

      // 6) Quotation Capabilities (old comparison system)
      for (const cap of source.quotationCapabilities) {
        const newStageId = stageIdMap.get(cap.stageId);
        if (!newStageId) continue;
        const newCap = await tx.quotationCapability.create({
          data: {
            projectId: p.id,
            stageId: newStageId,
            name: cap.name,
            orderIndex: cap.orderIndex,
          },
        });

        // quotation suppliers
        const qsMap = new Map<string, string>();
        for (const qs of cap.suppliers) {
          const newCandId = candidateIdMap.get(qs.candidateId);
          if (!newCandId) continue;
          const nqs = await tx.quotationSupplier.create({
            data: { capabilityId: newCap.id, candidateId: newCandId },
          });
          qsMap.set(qs.id, nqs.id);
        }

        // quotation files
        for (const f of cap.files) {
          const newSuppId = qsMap.get(f.supplierId);
          if (!newSuppId) continue;
          await tx.quotationFile.create({
            data: {
              projectId: p.id,
              capabilityId: newCap.id,
              supplierId: newSuppId,
              fileName: f.fileName,
              filePath: f.filePath,
              fileType: f.fileType,
              fileSize: f.fileSize,
              uploadedByUserId: userId,
            },
          });
        }

        // comparison attributes + values
        for (const attr of cap.attributes) {
          const newAttr = await tx.comparisonAttribute.create({
            data: {
              capabilityId: newCap.id,
              name: attr.name,
              orderIndex: attr.orderIndex,
            },
          });
          const valuesToCreate = attr.values
            .filter((v) => qsMap.has(v.supplierId))
            .map((v) => ({
              attributeId: newAttr.id,
              supplierId: qsMap.get(v.supplierId)!,
              value: v.value,
            }));
          if (valuesToCreate.length > 0) {
            await tx.comparisonValue.createMany({ data: valuesToCreate });
          }
        }

        // capability winner
        if (cap.winner) {
          const newCandId = candidateIdMap.get(cap.winner.candidateId);
          if (newCandId) {
            await tx.capabilityWinner.create({
              data: {
                projectId: p.id,
                capabilityId: newCap.id,
                candidateId: newCandId,
                selectedByUserId: userId,
              },
            });
          }
        }
      }

      // 7) Quote Comparisons (v2)
      for (const comp of source.quoteComparisons) {
        const newStageId = stageIdMap.get(comp.stageId);
        if (!newStageId) continue;
        const newComp = await tx.quoteComparison.create({
          data: {
            projectId: p.id,
            stageId: newStageId,
            capabilityName: comp.capabilityName,
            capabilityNameAr: comp.capabilityNameAr,
            baseCurrency: comp.baseCurrency,
            incoterm: comp.incoterm,
            profitPercent: comp.profitPercent,
            conditions: comp.conditions as string[],
            orderIndex: comp.orderIndex,
            imageUrl: comp.imageUrl,
          },
        });

        // quote items
        const itemIdMap = new Map<string, string>();
        for (const item of comp.items) {
          const ni = await tx.quoteItem.create({
            data: {
              quoteComparisonId: newComp.id,
              itemName: item.itemName,
              itemNameAr: item.itemNameAr,
              description: item.description,
              targetQty: item.targetQty,
              unitLabel: item.unitLabel,
              baselineSpec: item.baselineSpec,
              orderIndex: item.orderIndex,
              imageUrl: item.imageUrl,
            },
          });
          itemIdMap.set(item.id, ni.id);
        }

        // quote suppliers
        const qsIdMap = new Map<string, string>();
        for (const qs of comp.suppliers) {
          const newCandId = qs.candidateId ? candidateIdMap.get(qs.candidateId) ?? null : null;
          const nqs = await tx.quoteSupplier.create({
            data: {
              quoteComparisonId: newComp.id,
              candidateId: newCandId,
              supplierName: qs.supplierName,
              country: qs.country,
              quoteDate: qs.quoteDate,
              validUntil: qs.validUntil,
              incoterm: qs.incoterm,
              paymentTerms: qs.paymentTerms,
              leadTimeDays: qs.leadTimeDays,
              warrantyYears: qs.warrantyYears,
              depositPercent: qs.depositPercent,
              notes: qs.notes,
              decision: qs.decision,
              decisionReason: qs.decisionReason,
            },
          });
          qsIdMap.set(qs.id, nqs.id);
        }

        // quote lines
        const linesToCreate: Array<{
          quoteSupplierId: string;
          quoteItemId: string;
          qty: number;
          unitPrice: any;
          amount: any;
          included: boolean;
          remark: string | null;
        }> = [];
        for (const qs of comp.suppliers) {
          const newSuppId = qsIdMap.get(qs.id);
          if (!newSuppId) continue;
          for (const line of qs.lines) {
            const newItemId = itemIdMap.get(line.quoteItemId);
            if (!newItemId) continue;
            linesToCreate.push({
              quoteSupplierId: newSuppId,
              quoteItemId: newItemId,
              qty: line.qty,
              unitPrice: line.unitPrice,
              amount: line.amount,
              included: line.included,
              remark: line.remark,
            });
          }
        }
        if (linesToCreate.length > 0) {
          await tx.quoteLine.createMany({ data: linesToCreate });
        }
      }

      // 8) Client Quote
      if (source.clientQuote) {
        await tx.projectClientQuote.create({
          data: {
            projectId: p.id,
            currency: source.clientQuote.currency,
            quoteAmount: source.clientQuote.quoteAmount,
            notes: source.clientQuote.notes,
          },
        });
      }

      // 9) Client Approval Pricing
      if (source.clientApprovalPricing.length > 0) {
        await tx.clientApprovalPricing.createMany({
          data: source.clientApprovalPricing.map((pr) => ({
            projectId: p.id,
            itemName: pr.itemName,
            amount: pr.amount,
            currency: pr.currency,
          })),
        });
      }

      // 10) Client Approval Status → reset to DRAFT
      await tx.clientApprovalStatus.create({
        data: {
          projectId: p.id,
          status: 'DRAFT',
          updatedByUserId: userId,
        },
      });

      // 11) Client Approval Notes
      if (source.clientApprovalNotes.length > 0) {
        await tx.clientApprovalNote.createMany({
          data: source.clientApprovalNotes.map((n) => ({
            projectId: p.id,
            content: n.content,
            createdByUserId: userId,
          })),
        });
      }

      // 12) Client Approval Files
      if (source.clientApprovalFiles.length > 0) {
        await tx.clientApprovalFile.createMany({
          data: source.clientApprovalFiles.map((f) => ({
            projectId: p.id,
            fileName: f.fileName,
            filePath: f.filePath,
            fileType: f.fileType,
            fileSize: f.fileSize,
            uploadedByUserId: userId,
          })),
        });
      }

      // 13) Project-level Tasks (with stage mapping)
      const taskIdMap = new Map<string, string>();
      for (const t of source.tasks) {
        const nt = await tx.projectTask.create({
          data: {
            projectId: p.id,
            stageId: t.stageId ? stageIdMap.get(t.stageId) ?? null : null,
            title: t.title,
            description: t.description,
            assigneeUserId: t.assigneeUserId,
            status: t.status,
            priority: t.priority,
            dueDate: t.dueDate,
          },
        });
        taskIdMap.set(t.id, nt.id);
      }

      // 14) Project-level Files (with stage + task mapping)
      if (source.files.length > 0) {
        await tx.projectFile.createMany({
          data: source.files.map((f) => ({
            projectId: p.id,
            stageId: f.stageId ? stageIdMap.get(f.stageId) ?? null : null,
            taskId: f.taskId ? taskIdMap.get(f.taskId) ?? null : null,
            type: f.type,
            title: f.title,
            url: f.url,
            notes: f.notes,
            uploadedByUserId: userId,
          })),
        });
      }

      return p;
    });

    await this.logActivity(
      project.id,
      ProjectActivityType.PROJECT_CREATED,
      `Project duplicated from ${source.code}`,
      userId,
    );

    this.wsGateway.emit('project.updated', project);
    return project;
  }

  // ─── Stages ───

  async listStages(projectId: string) {
    await this.getById(projectId);
    return this.prisma.projectStage.findMany({
      where: { projectId },
      orderBy: { orderIndex: 'asc' },
      include: {
        tasks: {
          include: { assignee: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        files: {
          include: { uploadedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async createStage(
    projectId: string,
    dto: { name: string; orderIndex?: number; notes?: string },
    userId: string,
  ) {
    await this.getById(projectId);

    const maxOrder = await this.prisma.projectStage.aggregate({
      where: { projectId },
      _max: { orderIndex: true },
    });
    const orderIndex = dto.orderIndex ?? ((maxOrder._max.orderIndex ?? -1) + 1);

    const stage = await this.prisma.projectStage.create({
      data: {
        projectId,
        name: dto.name,
        orderIndex,
        notes: dto.notes,
      },
    });

    await this.logActivity(
      projectId,
      ProjectActivityType.STAGE_CREATED,
      `Stage "${dto.name}" added`,
      userId,
      { stageId: stage.id },
    );

    this.wsGateway.emit('project.stage.updated', { projectId, stage });
    return stage;
  }

  async updateStage(
    projectId: string,
    stageId: string,
    dto: { name?: string; status?: string; orderIndex?: number; notes?: string | null },
    userId: string,
  ) {
    const stage = await this.prisma.projectStage.findFirst({
      where: { id: stageId, projectId },
    });
    if (!stage) throw new NotFoundException('Stage not found');

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.orderIndex !== undefined) data.orderIndex = dto.orderIndex;

    if (dto.status !== undefined) {
      // Execution gate: block Execution Plan from starting until client approval
      if (
        dto.status === ProjectStageStatus.IN_PROGRESS &&
        (stage.stageKey === 'EXECUTION_PLAN' || stage.stageKey === 'EXECUTION')
      ) {
        const approvalStatus = await this.prisma.clientApprovalStatus.findFirst({
          where: { projectId },
        });
        if (approvalStatus && approvalStatus.status !== 'ACCEPTED') {
          throw new BadRequestException(
            'Client approval required before execution planning.',
          );
        }
      }

      data.status = dto.status;
      if (dto.status === ProjectStageStatus.IN_PROGRESS && !stage.startedAt) {
        data.startedAt = new Date();
      }
      if (dto.status === ProjectStageStatus.DONE && !stage.completedAt) {
        data.completedAt = new Date();
      }

      await this.logActivity(
        projectId,
        ProjectActivityType.STAGE_STATUS_CHANGED,
        `Stage "${stage.name}" changed to ${dto.status}`,
        userId,
        { stageId, oldStatus: stage.status, newStatus: dto.status },
      );
    }

    const updated = await this.prisma.projectStage.update({
      where: { id: stageId },
      data,
    });

    if (
      dto.status === ProjectStageStatus.DONE &&
      stage.stageKey === 'QUOTATION_SAMPLES'
    ) {
      const clientApprovalStage = await this.prisma.projectStage.findFirst({
        where: { projectId, stageKey: 'CLIENT_APPROVAL' },
      });
      if (
        clientApprovalStage &&
        clientApprovalStage.status === ProjectStageStatus.NOT_STARTED
      ) {
        const caUpdated = await this.prisma.projectStage.update({
          where: { id: clientApprovalStage.id },
          data: {
            status: ProjectStageStatus.IN_PROGRESS,
            startedAt: clientApprovalStage.startedAt ?? new Date(),
          },
        });
        this.wsGateway.emit('project.stage.updated', {
          projectId,
          stage: caUpdated,
        });
      }
    }

    this.wsGateway.emit('project.stage.updated', { projectId, stage: updated });
    return updated;
  }

  async deleteStage(projectId: string, stageId: string, userId: string) {
    const stage = await this.prisma.projectStage.findFirst({
      where: { id: stageId, projectId },
    });
    if (!stage) throw new NotFoundException('Stage not found');

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (project?.currentStageId === stageId) {
      await this.prisma.project.update({
        where: { id: projectId },
        data: { currentStageId: null },
      });
    }

    await this.prisma.projectStage.delete({ where: { id: stageId } });

    await this.logActivity(
      projectId,
      ProjectActivityType.STAGE_STATUS_CHANGED,
      `Stage "${stage.name}" removed`,
      userId,
      { stageId, stageName: stage.name },
    );

    this.wsGateway.emit('project.stage.updated', { projectId, stageId, deleted: true });
    return { success: true };
  }

  // ─── Tasks ───

  async listTasks(projectId: string) {
    await this.getById(projectId);
    return this.prisma.projectTask.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        assignee: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true } },
      },
    });
  }

  async createTask(
    projectId: string,
    dto: {
      title: string;
      description?: string;
      stageId?: string | null;
      assigneeUserId?: string | null;
      status?: string;
      dueDate?: string;
      priority?: string;
    },
    userId: string,
  ) {
    await this.getById(projectId);

    const task = await this.prisma.projectTask.create({
      data: {
        projectId,
        title: dto.title,
        description: dto.description,
        stageId: dto.stageId ?? null,
        assigneeUserId: dto.assigneeUserId ?? null,
        status: dto.status ?? 'TODO',
        priority: dto.priority ?? 'MEDIUM',
        ...(dto.dueDate ? { dueDate: new Date(dto.dueDate) } : {}),
      },
      include: {
        assignee: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true } },
      },
    });

    await this.logActivity(
      projectId,
      ProjectActivityType.TASK_CREATED,
      `Task "${dto.title}" created`,
      userId,
      { taskId: task.id },
    );

    this.wsGateway.emit('project.task.updated', { projectId, task });
    return task;
  }

  async updateTask(
    projectId: string,
    taskId: string,
    dto: {
      title?: string;
      description?: string | null;
      stageId?: string | null;
      assigneeUserId?: string | null;
      status?: string;
      dueDate?: string | null;
      priority?: string;
    },
    userId: string,
  ) {
    const task = await this.prisma.projectTask.findFirst({
      where: { id: taskId, projectId },
    });
    if (!task) throw new NotFoundException('Task not found');

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.stageId !== undefined) data.stageId = dto.stageId;
    if (dto.assigneeUserId !== undefined) data.assigneeUserId = dto.assigneeUserId;
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.dueDate !== undefined)
      data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;

    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === ProjectTaskStatus.DONE && !task.completedAt) {
        data.completedAt = new Date();
      }
      if (dto.status !== ProjectTaskStatus.DONE && task.completedAt) {
        data.completedAt = null;
      }

      if (dto.status !== task.status) {
        await this.logActivity(
          projectId,
          ProjectActivityType.TASK_STATUS_CHANGED,
          `Task "${task.title}" changed to ${dto.status}`,
          userId,
          { taskId, oldStatus: task.status, newStatus: dto.status },
        );
      }
    }

    const updated = await this.prisma.projectTask.update({
      where: { id: taskId },
      data,
      include: {
        assignee: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true } },
      },
    });

    this.wsGateway.emit('project.task.updated', { projectId, task: updated });
    return updated;
  }

  async deleteTask(projectId: string, taskId: string, userId: string) {
    const task = await this.prisma.projectTask.findFirst({
      where: { id: taskId, projectId },
    });
    if (!task) throw new NotFoundException('Task not found');

    await this.prisma.projectTask.delete({ where: { id: taskId } });

    await this.logActivity(
      projectId,
      ProjectActivityType.TASK_DELETED,
      `Task "${task.title}" deleted`,
      userId,
      { taskId, taskTitle: task.title },
    );

    this.wsGateway.emit('project.task.updated', { projectId, taskId, deleted: true });
    return { success: true };
  }

  // ─── Contacts ───

  async listContacts(projectId: string) {
    await this.getById(projectId);
    return this.prisma.projectContact.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createContact(
    projectId: string,
    dto: {
      name: string;
      company?: string;
      country?: string;
      capability?: string;
      wechatId?: string;
      contactPerson?: string;
      contactPosition?: string;
      whatsapp?: string;
      email?: string;
      website?: string;
      location?: string;
      notes?: string;
    },
    userId: string,
  ) {
    await this.getById(projectId);

    const contact = await this.prisma.projectContact.create({
      data: {
        projectId,
        name: dto.name,
        company: dto.company,
        country: dto.country,
        capability: dto.capability,
        wechatId: dto.wechatId,
        contactPerson: dto.contactPerson,
        contactPosition: dto.contactPosition,
        whatsapp: dto.whatsapp,
        email: dto.email || null,
        website: dto.website,
        location: dto.location,
        notes: dto.notes,
      },
    });

    await this.logActivity(
      projectId,
      ProjectActivityType.CONTACT_ADDED,
      `Contact "${dto.name}" added`,
      userId,
      { contactId: contact.id },
    );

    this.wsGateway.emit('project.updated', { projectId, contact });
    return contact;
  }

  async updateContact(
    projectId: string,
    contactId: string,
    dto: {
      name?: string;
      company?: string | null;
      country?: string | null;
      capability?: string | null;
      wechatId?: string | null;
      contactPerson?: string | null;
      contactPosition?: string | null;
      whatsapp?: string | null;
      email?: string | null;
      website?: string | null;
      location?: string | null;
      lastContactAt?: string | null;
      notes?: string | null;
    },
    userId: string,
  ) {
    const contact = await this.prisma.projectContact.findFirst({
      where: { id: contactId, projectId },
    });
    if (!contact) throw new NotFoundException('Contact not found');

    const data: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(dto)) {
      if (val !== undefined) {
        if (key === 'lastContactAt') {
          data[key] = val ? new Date(val as string) : null;
        } else if (key === 'email') {
          data[key] = val || null;
        } else {
          data[key] = val;
        }
      }
    }

    const updated = await this.prisma.projectContact.update({
      where: { id: contactId },
      data,
    });

    if (dto.lastContactAt !== undefined) {
      await this.logActivity(
        projectId,
        ProjectActivityType.CONTACT_LOGGED,
        `Contact "${contact.name}" logged`,
        userId,
        { contactId },
      );
    }

    return updated;
  }

  async deleteContact(projectId: string, contactId: string, userId: string) {
    const contact = await this.prisma.projectContact.findFirst({
      where: { id: contactId, projectId },
    });
    if (!contact) throw new NotFoundException('Contact not found');

    await this.prisma.projectContact.delete({ where: { id: contactId } });

    await this.logActivity(
      projectId,
      ProjectActivityType.CONTACT_REMOVED,
      `Contact "${contact.name}" removed`,
      userId,
      { contactId, contactName: contact.name },
    );

    return { success: true };
  }

  // ─── Files ───

  async listFiles(projectId: string) {
    await this.getById(projectId);
    return this.prisma.projectFile.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true } },
      },
    });
  }

  async createFile(
    projectId: string,
    dto: {
      type: string;
      title: string;
      url: string;
      stageId?: string | null;
      taskId?: string | null;
      notes?: string;
    },
    userId: string,
  ) {
    await this.getById(projectId);

    const file = await this.prisma.projectFile.create({
      data: {
        projectId,
        type: dto.type,
        title: dto.title,
        url: dto.url,
        stageId: dto.stageId ?? null,
        taskId: dto.taskId ?? null,
        notes: dto.notes,
        uploadedByUserId: userId,
      },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        stage: { select: { id: true, name: true } },
      },
    });

    await this.logActivity(
      projectId,
      ProjectActivityType.FILE_ADDED,
      `File "${dto.title}" added`,
      userId,
      { fileId: file.id, fileType: dto.type },
    );

    this.wsGateway.emit('project.updated', { projectId, file });
    return file;
  }

  async deleteFile(projectId: string, fileId: string, userId: string) {
    const file = await this.prisma.projectFile.findFirst({
      where: { id: fileId, projectId },
    });
    if (!file) throw new NotFoundException('File not found');

    await this.prisma.projectFile.delete({ where: { id: fileId } });

    await this.logActivity(
      projectId,
      ProjectActivityType.FILE_REMOVED,
      `File "${file.title}" removed`,
      userId,
      { fileId, fileTitle: file.title },
    );

    return { success: true };
  }

  // ─── Activity Timeline ───

  async listActivities(projectId: string) {
    await this.getById(projectId);
    return this.prisma.projectActivity.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });
  }

  // ─── Client Quotation ───

  async getClientQuote(projectId: string) {
    return this.prisma.projectClientQuote.findUnique({
      where: { projectId },
    });
  }

  async upsertClientQuote(
    projectId: string,
    dto: { currency?: string; quoteAmount?: number | null; notes?: string | null },
    userId: string,
  ) {
    const quote = await this.prisma.projectClientQuote.upsert({
      where: { projectId },
      create: {
        projectId,
        currency: dto.currency ?? 'SAR',
        quoteAmount: dto.quoteAmount ?? null,
        notes: dto.notes ?? null,
      },
      update: {
        ...(dto.currency !== undefined ? { currency: dto.currency } : {}),
        ...(dto.quoteAmount !== undefined ? { quoteAmount: dto.quoteAmount } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    });

    await this.logActivity(
      projectId,
      ProjectActivityType.CLIENT_QUOTE_UPDATED,
      `Client quotation updated (${quote.currency} ${quote.quoteAmount ?? '—'})`,
      userId,
      { quoteId: quote.id },
    );

    this.wsGateway.emit('project.updated', { projectId });
    return quote;
  }

  // ─── Client Decision ───

  async getClientDecision(projectId: string) {
    return this.prisma.projectClientDecision.findUnique({
      where: { projectId },
      include: { decidedBy: { select: { id: true, name: true } } },
    });
  }

  async upsertClientDecision(
    projectId: string,
    dto: { status?: string; notes?: string | null },
    userId: string,
  ) {
    const oldDecision = await this.prisma.projectClientDecision.findUnique({
      where: { projectId },
    });

    const isApproved = dto.status === 'APPROVED';
    const wasApproved = oldDecision?.status === 'APPROVED';

    const decision = await this.prisma.projectClientDecision.upsert({
      where: { projectId },
      create: {
        projectId,
        status: dto.status ?? 'PENDING',
        notes: dto.notes ?? null,
        ...(isApproved ? { decisionAt: new Date(), decidedByUserId: userId } : {}),
      },
      update: {
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(isApproved && !wasApproved
          ? { decisionAt: new Date(), decidedByUserId: userId }
          : {}),
      },
      include: { decidedBy: { select: { id: true, name: true } } },
    });

    await this.logActivity(
      projectId,
      ProjectActivityType.CLIENT_DECISION_UPDATED,
      `Client decision changed to ${decision.status}`,
      userId,
      { decisionId: decision.id, status: decision.status },
    );

    this.wsGateway.emit('project.updated', { projectId });
    return decision;
  }

  // ─── Helpers ───

  private async logActivity(
    projectId: string,
    eventType: string,
    message: string,
    userId: string,
    meta?: Record<string, unknown>,
  ) {
    const activity = await this.prisma.projectActivity.create({
      data: {
        projectId,
        eventType,
        message,
        metaJson: (meta as any) ?? undefined,
        createdByUserId: userId,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    this.wsGateway.emit('project.activity.created', { projectId, activity });
    return activity;
  }
}
