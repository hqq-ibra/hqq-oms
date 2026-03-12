import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';
import { Decimal } from '@prisma/client/runtime/library';

const FULL_INCLUDE = {
  items: {
    orderBy: { orderIndex: 'asc' as const },
    include: { lines: true },
  },
  suppliers: {
    orderBy: { createdAt: 'asc' as const },
    include: { lines: true },
  },
};

@Injectable()
export class QuoteComparisonService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
  ) {}

  // ─── Sync from Supplier Shortlist ───

  async syncFromShortlist(projectId: string, stageId: string, userId: string) {
    const shortlistStage = await this.prisma.projectStage.findFirst({
      where: { projectId, stageKey: 'SUPPLIER_SHORTLIST' },
    });
    if (!shortlistStage) return this.getAllForStage(projectId, stageId);

    const candidates = await this.prisma.projectCandidateSupplier.findMany({
      where: { projectId, stageId: shortlistStage.id },
    });

    const capabilityNames = new Set<string>();
    for (const c of candidates) {
      for (const cap of c.capabilities) {
        const trimmed = cap.trim();
        if (trimmed) capabilityNames.add(trimmed);
      }
    }

    for (const capName of capabilityNames) {
      let comparison = await this.prisma.quoteComparison.findUnique({
        where: {
          projectId_stageId_capabilityName: {
            projectId,
            stageId,
            capabilityName: capName,
          },
        },
        include: { suppliers: true, items: true },
      });

      if (!comparison) {
        comparison = await this.prisma.quoteComparison.create({
          data: { projectId, stageId, capabilityName: capName },
          include: { suppliers: true, items: true },
        });
        await this.logActivity(
          projectId,
          'comparison_created',
          `Comparison table created for "${capName}"`,
          userId,
        );
      }

      const relevantCandidates = candidates.filter((c) =>
        c.capabilities.map((cap) => cap.trim()).includes(capName),
      );

      for (const candidate of relevantCandidates) {
        const exists = comparison.suppliers.find(
          (s) => s.candidateId === candidate.id,
        );
        if (!exists) {
          const supplier = await this.prisma.quoteSupplier.create({
            data: {
              quoteComparisonId: comparison.id,
              candidateId: candidate.id,
              supplierName: candidate.name,
              country: candidate.country,
            },
          });

          if (comparison.items.length > 0) {
            await this.prisma.quoteLine.createMany({
              data: comparison.items.map((item) => ({
                quoteSupplierId: supplier.id,
                quoteItemId: item.id,
                qty: item.targetQty,
                included: true,
              })),
            });
          }
        }
      }

      const validCandidateIds = new Set(relevantCandidates.map((c) => c.id));
      for (const supplier of comparison.suppliers) {
        if (supplier.candidateId && !validCandidateIds.has(supplier.candidateId)) {
          await this.prisma.quoteSupplier.delete({
            where: { id: supplier.id },
          });
        }
      }
    }

    const existingComparisons = await this.prisma.quoteComparison.findMany({
      where: { projectId, stageId },
    });
    for (const comp of existingComparisons) {
      if (!capabilityNames.has(comp.capabilityName)) {
        const hasData = await this.prisma.quoteLine.findFirst({
          where: {
            item: { quoteComparisonId: comp.id },
            unitPrice: { not: null },
          },
        });
        if (!hasData) {
          await this.prisma.quoteComparison.delete({ where: { id: comp.id } });
        }
      }
    }

    this.wsGateway.emit('project.stage.updated', { projectId, stageId });
    return this.getAllForStage(projectId, stageId);
  }

  // ─── Get All for Stage ───

  async getAllForStage(projectId: string, stageId: string) {
    return this.prisma.quoteComparison.findMany({
      where: { projectId, stageId },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      include: FULL_INCLUDE,
    });
  }

  async reorderComparisons(projectId: string, stageId: string, orderedIds: string[]) {
    const updates = orderedIds.map((id, i) =>
      this.prisma.quoteComparison.update({
        where: { id },
        data: { orderIndex: i },
      }),
    );
    await this.prisma.$transaction(updates);
    this.wsGateway.emit('project.stage.updated', { projectId, stageId });
    return this.getAllForStage(projectId, stageId);
  }

  // ─── Images ───

  async setComparisonImage(comparisonId: string, imageUrl: string | null) {
    return this.prisma.quoteComparison.update({
      where: { id: comparisonId },
      data: { imageUrl },
    });
  }

  async setItemImage(itemId: string, imageUrl: string | null) {
    return this.prisma.quoteItem.update({
      where: { id: itemId },
      data: { imageUrl },
    });
  }

  // ─── Arabic Names ───

  async updateCapabilityNameAr(comparisonId: string, nameAr: string) {
    return this.prisma.quoteComparison.update({
      where: { id: comparisonId },
      data: { capabilityNameAr: nameAr },
    });
  }

  async updateItemNameAr(itemId: string, nameAr: string) {
    return this.prisma.quoteItem.update({
      where: { id: itemId },
      data: { itemNameAr: nameAr },
    });
  }

  async updateItemDescription(itemId: string, description: string) {
    return this.prisma.quoteItem.update({
      where: { id: itemId },
      data: { description },
    });
  }

  async updateProfitPercent(comparisonId: string, profitPercent: number) {
    return this.prisma.quoteComparison.update({
      where: { id: comparisonId },
      data: { profitPercent },
    });
  }

  async updateConditions(comparisonId: string, conditions: string[]) {
    return this.prisma.quoteComparison.update({
      where: { id: comparisonId },
      data: { conditions },
    });
  }

  async translateTexts(texts: string[]): Promise<string[]> {
    try {
      const translate = (await import('google-translate-api-x')).default;
      const results = await translate(texts, { from: 'en', to: 'ar' });
      if (Array.isArray(results)) {
        return results.map((r: any) => r.text);
      }
      return [(results as any).text];
    } catch {
      return texts;
    }
  }

  async translateAndSave(projectId: string, stageId: string) {
    const comparisons = await this.prisma.quoteComparison.findMany({
      where: { projectId, stageId },
      include: { items: true },
    });

    for (const comp of comparisons) {
      const textsToTranslate: string[] = [];
      const itemIds: string[] = [];

      if (!comp.capabilityNameAr) {
        textsToTranslate.push(comp.capabilityName);
      }
      for (const item of comp.items) {
        if (!item.itemNameAr) {
          textsToTranslate.push(item.itemName);
          itemIds.push(item.id);
        }
      }

      if (textsToTranslate.length === 0) continue;

      const translated = await this.translateTexts(textsToTranslate);

      let idx = 0;
      if (!comp.capabilityNameAr) {
        await this.prisma.quoteComparison.update({
          where: { id: comp.id },
          data: { capabilityNameAr: translated[idx] },
        });
        idx++;
      }
      for (const itemId of itemIds) {
        await this.prisma.quoteItem.update({
          where: { id: itemId },
          data: { itemNameAr: translated[idx] },
        });
        idx++;
      }
    }

    return { success: true };
  }

  // ─── Switch Currency ───

  private static readonly RATES: Record<string, number> = {
    USD: 1,
    SAR: 3.75,
    CNY: 7.25,
    EUR: 0.92,
  };

  async switchCurrency(
    comparisonId: string,
    newCurrency: string,
    userId: string,
  ) {
    const comparison = await this.prisma.quoteComparison.findUnique({
      where: { id: comparisonId },
      include: {
        suppliers: { include: { lines: true } },
      },
    });
    if (!comparison) throw new NotFoundException('Comparison not found');

    const oldCurrency = comparison.baseCurrency;
    if (oldCurrency === newCurrency) {
      return this.prisma.quoteComparison.findUnique({
        where: { id: comparisonId },
        include: FULL_INCLUDE,
      });
    }

    const oldRate = QuoteComparisonService.RATES[oldCurrency] ?? 1;
    const newRate = QuoteComparisonService.RATES[newCurrency] ?? 1;
    const factor = newRate / oldRate;

    const updates: Promise<unknown>[] = [];
    for (const supplier of comparison.suppliers) {
      for (const line of supplier.lines) {
        if (line.unitPrice !== null) {
          const newUnitPrice = new Decimal(line.unitPrice.toString())
            .mul(new Decimal(factor.toString()));
          const newAmount =
            line.included
              ? new Decimal(line.qty).mul(newUnitPrice)
              : null;

          updates.push(
            this.prisma.quoteLine.update({
              where: { id: line.id },
              data: {
                unitPrice: newUnitPrice,
                amount: newAmount,
              },
            }),
          );
        }
      }
    }

    updates.push(
      this.prisma.quoteComparison.update({
        where: { id: comparisonId },
        data: { baseCurrency: newCurrency },
      }),
    );

    await this.prisma.$transaction(updates as any);

    await this.logActivity(
      comparison.projectId,
      'currency_switched',
      `Currency switched from ${oldCurrency} to ${newCurrency} for "${comparison.capabilityName}"`,
      userId,
      { oldCurrency, newCurrency, factor },
    );

    return this.prisma.quoteComparison.findUnique({
      where: { id: comparisonId },
      include: FULL_INCLUDE,
    });
  }

  // ─── Items ───

  async addItem(
    comparisonId: string,
    dto: {
      itemName: string;
      targetQty?: number;
      unitLabel?: string;
      baselineSpec?: string;
    },
    userId: string,
  ) {
    const comparison = await this.prisma.quoteComparison.findUnique({
      where: { id: comparisonId },
      include: { items: true, suppliers: true },
    });
    if (!comparison) throw new NotFoundException('Comparison not found');

    const maxIdx =
      comparison.items.length > 0
        ? Math.max(...comparison.items.map((i) => i.orderIndex))
        : -1;

    const item = await this.prisma.quoteItem.create({
      data: {
        quoteComparisonId: comparison.id,
        itemName: dto.itemName,
        targetQty: dto.targetQty ?? 1,
        unitLabel: dto.unitLabel ?? 'set',
        baselineSpec: dto.baselineSpec,
        orderIndex: maxIdx + 1,
      },
    });

    if (comparison.suppliers.length > 0) {
      await this.prisma.quoteLine.createMany({
        data: comparison.suppliers.map((s) => ({
          quoteSupplierId: s.id,
          quoteItemId: item.id,
          qty: dto.targetQty ?? 1,
          included: true,
        })),
      });
    }

    await this.logActivity(
      comparison.projectId,
      'item_added',
      `Item "${dto.itemName}" added to "${comparison.capabilityName}"`,
      userId,
    );
    this.wsGateway.emit('project.stage.updated', {
      projectId: comparison.projectId,
      stageId: comparison.stageId,
    });

    return this.prisma.quoteComparison.findUnique({
      where: { id: comparisonId },
      include: FULL_INCLUDE,
    });
  }

  async updateItem(
    itemId: string,
    dto: {
      itemName?: string;
      targetQty?: number;
      unitLabel?: string;
      baselineSpec?: string | null;
    },
    userId: string,
  ) {
    const item = await this.prisma.quoteItem.findUnique({
      where: { id: itemId },
      include: { comparison: true },
    });
    if (!item) throw new NotFoundException('Item not found');

    await this.prisma.quoteItem.update({ where: { id: itemId }, data: dto });

    await this.logActivity(
      item.comparison.projectId,
      'item_updated',
      `Item "${item.itemName}" updated`,
      userId,
    );
    return { success: true };
  }

  async deleteItem(itemId: string, userId: string) {
    const item = await this.prisma.quoteItem.findUnique({
      where: { id: itemId },
      include: { comparison: true },
    });
    if (!item) throw new NotFoundException('Item not found');

    await this.prisma.quoteItem.delete({ where: { id: itemId } });

    await this.logActivity(
      item.comparison.projectId,
      'item_removed',
      `Item "${item.itemName}" removed`,
      userId,
    );
    this.wsGateway.emit('project.stage.updated', {
      projectId: item.comparison.projectId,
      stageId: item.comparison.stageId,
    });
    return { success: true };
  }

  async reorderItem(
    itemId: string,
    direction: 'up' | 'down',
    userId: string,
  ) {
    const item = await this.prisma.quoteItem.findUnique({
      where: { id: itemId },
      include: {
        comparison: {
          include: { items: { orderBy: { orderIndex: 'asc' } } },
        },
      },
    });
    if (!item) throw new NotFoundException('Item not found');

    const items = item.comparison.items;
    const currentIdx = items.findIndex((i) => i.id === itemId);
    const swapIdx = direction === 'up' ? currentIdx - 1 : currentIdx + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return { success: true };

    const current = items[currentIdx];
    const swap = items[swapIdx];

    await this.prisma.$transaction([
      this.prisma.quoteItem.update({
        where: { id: current.id },
        data: { orderIndex: swap.orderIndex },
      }),
      this.prisma.quoteItem.update({
        where: { id: swap.id },
        data: { orderIndex: current.orderIndex },
      }),
    ]);

    return { success: true };
  }

  // ─── Suppliers ───

  async addSupplier(
    comparisonId: string,
    dto: {
      supplierName: string;
      country?: string;
      paymentTerms?: string;
      leadTimeDays?: number;
      incoterm?: string;
      notes?: string;
    },
    userId: string,
  ) {
    const comparison = await this.prisma.quoteComparison.findUnique({
      where: { id: comparisonId },
      include: { suppliers: true, items: true },
    });
    if (!comparison) throw new NotFoundException('Comparison not found');

    const supplier = await this.prisma.quoteSupplier.create({
      data: {
        quoteComparisonId: comparison.id,
        supplierName: dto.supplierName,
        country: dto.country,
        paymentTerms: dto.paymentTerms,
        leadTimeDays: dto.leadTimeDays,
        incoterm: dto.incoterm,
        notes: dto.notes,
      },
    });

    if (comparison.items.length > 0) {
      await this.prisma.quoteLine.createMany({
        data: comparison.items.map((item) => ({
          quoteSupplierId: supplier.id,
          quoteItemId: item.id,
          qty: item.targetQty,
          included: true,
        })),
      });
    }

    await this.logActivity(
      comparison.projectId,
      'supplier_added',
      `Supplier "${dto.supplierName}" added to "${comparison.capabilityName}"`,
      userId,
    );
    this.wsGateway.emit('project.stage.updated', {
      projectId: comparison.projectId,
      stageId: comparison.stageId,
    });

    return this.prisma.quoteComparison.findUnique({
      where: { id: comparisonId },
      include: FULL_INCLUDE,
    });
  }

  async updateSupplier(
    supplierId: string,
    dto: {
      supplierName?: string;
      country?: string | null;
      quoteDate?: string | null;
      validUntil?: string | null;
      incoterm?: string | null;
      paymentTerms?: string | null;
      leadTimeDays?: number | null;
      warrantyYears?: number | null;
      depositPercent?: number | null;
      notes?: string | null;
      decision?: string;
      decisionReason?: string | null;
    },
    userId: string,
  ) {
    const supplier = await this.prisma.quoteSupplier.findUnique({
      where: { id: supplierId },
      include: { comparison: true },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const data: Record<string, unknown> = { ...dto };
    if (dto.quoteDate !== undefined) {
      data.quoteDate = dto.quoteDate ? new Date(dto.quoteDate) : null;
    }
    if (dto.validUntil !== undefined) {
      data.validUntil = dto.validUntil ? new Date(dto.validUntil) : null;
    }

    const oldDecision = supplier.decision;
    await this.prisma.quoteSupplier.update({
      where: { id: supplierId },
      data,
    });

    if (dto.decision && dto.decision !== oldDecision) {
      await this.logActivity(
        supplier.comparison.projectId,
        'supplier_decision_changed',
        `Supplier "${supplier.supplierName}" decision changed to ${dto.decision}`,
        userId,
        { oldDecision, newDecision: dto.decision },
      );

      if (oldDecision === 'SELECTED' && dto.decision !== 'SELECTED') {
        await this.revertStageIfNeeded(
          supplier.comparison.projectId,
          supplier.comparison.stageId,
          userId,
        );
      } else if (dto.decision === 'SELECTED') {
        await this.autoMarkStageDoneIfAllSelected(
          supplier.comparison.projectId,
          supplier.comparison.stageId,
          userId,
        );
      }
    }

    return { success: true };
  }

  async removeSupplier(supplierId: string, userId: string) {
    const supplier = await this.prisma.quoteSupplier.findUnique({
      where: { id: supplierId },
      include: { comparison: true },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    await this.prisma.quoteSupplier.delete({ where: { id: supplierId } });

    await this.logActivity(
      supplier.comparison.projectId,
      'supplier_removed',
      `Supplier "${supplier.supplierName}" removed`,
      userId,
    );
    this.wsGateway.emit('project.stage.updated', {
      projectId: supplier.comparison.projectId,
      stageId: supplier.comparison.stageId,
    });
    return { success: true };
  }

  // ─── Lines ───

  async updateLine(
    lineId: string,
    dto: {
      qty?: number;
      unitPrice?: number | null;
      included?: boolean;
      remark?: string | null;
    },
    userId: string,
  ) {
    const line = await this.prisma.quoteLine.findUnique({
      where: { id: lineId },
      include: { supplier: { include: { comparison: true } }, item: true },
    });
    if (!line) throw new NotFoundException('Line not found');

    const qty = dto.qty ?? line.qty;
    const unitPrice =
      dto.unitPrice !== undefined
        ? dto.unitPrice !== null
          ? new Decimal(dto.unitPrice)
          : null
        : line.unitPrice;
    const included = dto.included ?? line.included;

    let amount: Decimal | null = null;
    if (included && unitPrice !== null) {
      amount = new Decimal(qty).mul(unitPrice);
    }

    await this.prisma.quoteLine.update({
      where: { id: lineId },
      data: {
        qty,
        unitPrice:
          dto.unitPrice !== undefined
            ? dto.unitPrice !== null
              ? dto.unitPrice
              : null
            : undefined,
        amount,
        included,
        remark: dto.remark !== undefined ? dto.remark : undefined,
      },
    });

    await this.logActivity(
      line.supplier.comparison.projectId,
      'quote_cell_updated',
      `Updated line for "${line.item.itemName}"`,
      userId,
    );

    return { success: true };
  }

  // ─── Select Final Supplier ───

  async selectFinalSupplier(
    comparisonId: string,
    supplierId: string,
    userId: string,
  ) {
    const comparison = await this.prisma.quoteComparison.findUnique({
      where: { id: comparisonId },
      include: { suppliers: true },
    });
    if (!comparison) throw new NotFoundException('Comparison not found');

    const target = comparison.suppliers.find((s) => s.id === supplierId);
    if (!target) throw new NotFoundException('Supplier not in comparison');

    await this.prisma.$transaction(
      comparison.suppliers.map((s) =>
        this.prisma.quoteSupplier.update({
          where: { id: s.id },
          data: {
            decision: s.id === supplierId ? 'SELECTED' : 'REJECTED',
          },
        }),
      ),
    );

    await this.logActivity(
      comparison.projectId,
      'final_supplier_selected',
      `"${target.supplierName}" selected for "${comparison.capabilityName}"`,
      userId,
      { supplierId, supplierName: target.supplierName },
    );

    await this.autoMarkStageDoneIfAllSelected(
      comparison.projectId,
      comparison.stageId,
      userId,
    );

    this.wsGateway.emit('project.stage.updated', {
      projectId: comparison.projectId,
      stageId: comparison.stageId,
    });

    return this.prisma.quoteComparison.findUnique({
      where: { id: comparisonId },
      include: FULL_INCLUDE,
    });
  }

  private async autoMarkStageDoneIfAllSelected(
    projectId: string,
    stageId: string,
    userId: string,
  ) {
    const allComparisons = await this.prisma.quoteComparison.findMany({
      where: { projectId, stageId },
      include: { suppliers: true },
    });

    if (allComparisons.length === 0) return;

    const allHaveWinner = allComparisons.every((comp) =>
      comp.suppliers.some((s) => s.decision === 'SELECTED'),
    );

    if (!allHaveWinner) return;

    const stage = await this.prisma.projectStage.findUnique({
      where: { id: stageId },
    });
    if (!stage || stage.status === 'DONE') return;

    await this.prisma.projectStage.update({
      where: { id: stageId },
      data: { status: 'DONE', completedAt: new Date() },
    });

    await this.logActivity(
      projectId,
      'stage_auto_completed',
      `Stage "${stage.name}" automatically marked Done — all capabilities have a selected supplier`,
      userId,
    );
  }

  private async revertStageIfNeeded(
    projectId: string,
    stageId: string,
    userId: string,
  ) {
    const stage = await this.prisma.projectStage.findUnique({
      where: { id: stageId },
    });
    if (!stage || stage.status !== 'DONE') return;

    await this.prisma.projectStage.update({
      where: { id: stageId },
      data: { status: 'IN_PROGRESS', completedAt: null },
    });

    await this.logActivity(
      projectId,
      'stage_status_reverted',
      `Stage "${stage.name}" reverted to In Progress — a supplier selection was removed`,
      userId,
    );

    this.wsGateway.emit('project.stage.updated', { projectId, stageId });
  }

  // ─── Helpers ───

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
        metaJson: meta ? JSON.parse(JSON.stringify(meta)) : undefined,
        createdByUserId: userId,
      },
    });
  }
}
