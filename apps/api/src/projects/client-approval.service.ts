import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { execFile } from 'child_process';
import { homedir, tmpdir } from 'os';

const APPROVAL_STATUSES = [
  'DRAFT',
  'SENT_TO_CLIENT',
  'CLIENT_REVIEWING',
  'NEGOTIATION',
  'ACCEPTED',
  'REJECTED',
] as const;

@Injectable()
export class ClientApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
  ) {}

  // ─── Files ───

  async listFiles(projectId: string) {
    return this.prisma.clientApprovalFile.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
  }

  async createFile(
    projectId: string,
    dto: { fileName: string; filePath: string; fileType: string; fileSize?: number },
    userId: string,
  ) {
    const file = await this.prisma.clientApprovalFile.create({
      data: {
        projectId,
        fileName: dto.fileName,
        filePath: dto.filePath,
        fileType: dto.fileType,
        fileSize: dto.fileSize ?? null,
        uploadedByUserId: userId,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });

    await this.logActivity(
      projectId,
      'QUOTATION_UPLOADED',
      `Quotation file "${dto.fileName}" uploaded`,
      userId,
      { fileId: file.id },
    );

    this.wsGateway.emit('project.updated', { projectId });
    return file;
  }

  async deleteFile(fileId: string, userId: string) {
    const file = await this.prisma.clientApprovalFile.findUnique({
      where: { id: fileId },
    });
    if (!file) throw new NotFoundException('File not found');

    await this.prisma.clientApprovalFile.delete({ where: { id: fileId } });

    await this.logActivity(
      file.projectId,
      'FILE_REMOVED',
      `Quotation file "${file.fileName}" removed`,
      userId,
      { fileId },
    );

    this.wsGateway.emit('project.updated', { projectId: file.projectId });
    return { success: true };
  }

  // ─── Pricing ───

  async listPricing(projectId: string) {
    return this.prisma.clientApprovalPricing.findMany({
      where: { projectId },
    });
  }

  async createPricingItem(
    projectId: string,
    dto: { itemName: string; amount: number; currency?: string },
    userId: string,
  ) {
    const item = await this.prisma.clientApprovalPricing.create({
      data: {
        projectId,
        itemName: dto.itemName,
        amount: dto.amount,
        currency: dto.currency ?? 'SAR',
      },
    });

    await this.logActivity(
      projectId,
      'PRICING_UPDATED',
      `Pricing item "${dto.itemName}" added`,
      userId,
      { itemId: item.id },
    );

    this.wsGateway.emit('project.updated', { projectId });
    return item;
  }

  async updatePricingItem(
    itemId: string,
    dto: { itemName?: string; amount?: number; currency?: string },
    userId: string,
  ) {
    const existing = await this.prisma.clientApprovalPricing.findUnique({
      where: { id: itemId },
    });
    if (!existing) throw new NotFoundException('Pricing item not found');

    const data: Record<string, unknown> = {};
    if (dto.itemName !== undefined) data.itemName = dto.itemName;
    if (dto.amount !== undefined) data.amount = dto.amount;
    if (dto.currency !== undefined) data.currency = dto.currency;

    const updated = await this.prisma.clientApprovalPricing.update({
      where: { id: itemId },
      data,
    });

    await this.logActivity(
      existing.projectId,
      'PRICING_UPDATED',
      `Pricing item "${updated.itemName}" updated`,
      userId,
      { itemId },
    );

    this.wsGateway.emit('project.updated', { projectId: existing.projectId });
    return updated;
  }

  async deletePricingItem(itemId: string, userId: string) {
    const item = await this.prisma.clientApprovalPricing.findUnique({
      where: { id: itemId },
    });
    if (!item) throw new NotFoundException('Pricing item not found');

    await this.prisma.clientApprovalPricing.delete({ where: { id: itemId } });

    await this.logActivity(
      item.projectId,
      'PRICING_UPDATED',
      `Pricing item "${item.itemName}" removed`,
      userId,
      { itemId },
    );

    this.wsGateway.emit('project.updated', { projectId: item.projectId });
    return { success: true };
  }

  // ─── Status ───

  async getStatus(projectId: string) {
    return this.prisma.clientApprovalStatus.findUnique({
      where: { projectId },
      include: { updatedBy: { select: { id: true, name: true } } },
    });
  }

  async updateStatus(projectId: string, status: string, userId: string) {
    if (!APPROVAL_STATUSES.includes(status as any)) {
      throw new NotFoundException('Invalid status');
    }

    const record = await this.prisma.clientApprovalStatus.upsert({
      where: { projectId },
      create: { projectId, status, updatedByUserId: userId },
      update: { status, updatedByUserId: userId },
      include: { updatedBy: { select: { id: true, name: true } } },
    });

    const eventType =
      status === 'ACCEPTED' ? 'CLIENT_APPROVED' : 'CLIENT_STATUS_CHANGED';
    await this.logActivity(
      projectId,
      eventType,
      `Client quotation status changed to "${status.replace(/_/g, ' ')}"`,
      userId,
      { status },
    );

    const isFinal = status === 'ACCEPTED' || status === 'REJECTED';
    const clientApprovalStage = await this.prisma.projectStage.findFirst({
      where: { projectId, stageKey: 'CLIENT_APPROVAL' },
    });

    if (clientApprovalStage) {
      const targetStageStatus = isFinal ? 'DONE' : 'IN_PROGRESS';
      if (clientApprovalStage.status !== targetStageStatus) {
        const data: Record<string, unknown> = { status: targetStageStatus };
        if (isFinal && !clientApprovalStage.completedAt) {
          data.completedAt = new Date();
        }
        if (!isFinal && !clientApprovalStage.startedAt) {
          data.startedAt = new Date();
        }
        const updated = await this.prisma.projectStage.update({
          where: { id: clientApprovalStage.id },
          data,
        });
        this.wsGateway.emit('project.stage.updated', {
          projectId,
          stage: updated,
        });
      }
    }

    this.wsGateway.emit('project.updated', { projectId });
    return record;
  }

  // ─── Notes ───

  async listNotes(projectId: string) {
    return this.prisma.clientApprovalNote.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
    });
  }

  async createNote(projectId: string, content: string, userId: string) {
    const note = await this.prisma.clientApprovalNote.create({
      data: { projectId, content, createdByUserId: userId },
      include: { createdBy: { select: { id: true, name: true } } },
    });

    await this.logActivity(
      projectId,
      'CLIENT_NOTE_ADDED',
      `Client note added`,
      userId,
      { noteId: note.id },
    );

    this.wsGateway.emit('project.updated', { projectId });
    return note;
  }

  async deleteNote(noteId: string, userId: string) {
    const note = await this.prisma.clientApprovalNote.findUnique({
      where: { id: noteId },
    });
    if (!note) throw new NotFoundException('Note not found');

    await this.prisma.clientApprovalNote.delete({ where: { id: noteId } });
    this.wsGateway.emit('project.updated', { projectId: note.projectId });
    return { success: true };
  }

  // ─── Supplier Cost Summary (from Quotation & Samples) ───

  async getSupplierCostSummary(projectId: string) {
    const comparisons = await this.prisma.quoteComparison.findMany({
      where: { projectId },
      orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
      include: {
        suppliers: {
          include: {
            lines: {
              include: { item: true },
              orderBy: { item: { orderIndex: 'asc' } },
            },
          },
        },
      },
    });

    const stageId = comparisons[0]?.stageId ?? null;
    const allComparisonIds = comparisons.map((c) => c.id);

    const items: {
      comparisonId: string;
      capability: string;
      capabilityAr: string | null;
      supplierName: string;
      currency: string;
      profitPercent: number;
      imageUrl: string | null;
      lines: { itemId: string; itemName: string; itemNameAr: string | null; description: string | null; qty: number; unitPrice: number; amount: number; imageUrl: string | null }[];
      subtotal: number;
      leadTimeDays: number | null;
      warrantyYears: number | null;
      depositPercent: number | null;
      paymentTerms: string | null;
      validUntil: string | null;
      conditions: string[];
    }[] = [];

    for (const comp of comparisons) {
      const selected = comp.suppliers.find((s) => s.decision === 'SELECTED');
      if (!selected) continue;

      const lines = selected.lines
        .filter((l) => l.included)
        .map((l) => ({
          itemId: l.item.id,
          itemName: l.item.itemName,
          itemNameAr: l.item.itemNameAr,
          description: l.item.description,
          qty: l.qty,
          unitPrice: Number(l.unitPrice ?? 0),
          amount: Number(l.amount ?? 0),
          imageUrl: l.item.imageUrl,
        }));

      items.push({
        comparisonId: comp.id,
        capability: comp.capabilityName,
        capabilityAr: comp.capabilityNameAr,
        supplierName: selected.supplierName,
        currency: comp.baseCurrency,
        profitPercent: comp.profitPercent ? Number(comp.profitPercent) : 15,
        imageUrl: comp.imageUrl,
        lines,
        subtotal: lines.reduce((s, l) => s + l.amount, 0),
        leadTimeDays: selected.leadTimeDays,
        warrantyYears: selected.warrantyYears,
        depositPercent: selected.depositPercent ? Number(selected.depositPercent) : null,
        paymentTerms: selected.paymentTerms,
        validUntil: selected.validUntil?.toISOString() ?? null,
        conditions: comp.conditions ?? [],
      });
    }

    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            contacts: {
              select: { phone: true },
              take: 1,
            },
          },
        },
      },
    });

    return {
      items,
      stageId,
      allComparisonIds,
      projectName: project?.name ?? null,
      customerName: project?.customer?.name ?? null,
      customerPhone: project?.customer?.contacts?.[0]?.phone ?? null,
      includeVat: project?.includeVat ?? false,
      quoteCurrency: project?.quoteCurrency ?? 'SAR',
    };
  }

  async updateQuotationSettings(projectId: string, settings: { includeVat?: boolean; quoteCurrency?: string }) {
    const data: Record<string, unknown> = {};
    if (settings.includeVat !== undefined) data.includeVat = settings.includeVat;
    if (settings.quoteCurrency !== undefined) data.quoteCurrency = settings.quoteCurrency;
    return this.prisma.project.update({ where: { id: projectId }, data });
  }

  // ─── Full workspace data ───

  async getWorkspace(projectId: string) {
    const [files, pricing, status, notes, costSummary] = await Promise.all([
      this.listFiles(projectId),
      this.listPricing(projectId),
      this.getStatus(projectId),
      this.listNotes(projectId),
      this.getSupplierCostSummary(projectId),
    ]);

    return { files, pricing, status, notes, costSummary };
  }

  // ─── Send WhatsApp ───

  private readonly logger = new Logger(ClientApprovalService.name);

  async sendWhatsApp(
    projectId: string,
    phone: string,
    fileName: string,
    file: Express.Multer.File,
  ) {
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('No PDF file received');
    }

    this.logger.log(`sendWhatsApp: file size=${file.buffer.length}, phone=${phone}, fileName=${fileName}`);

    const desktopPath = join(homedir(), 'Desktop');
    const safeName = fileName.replace(/[<>:"\/\\|?*]/g, '_');
    const filePath = join(desktopPath, safeName);

    writeFileSync(filePath, file.buffer);
    this.logger.log(`PDF saved to: ${filePath}`);

    const cleaned = phone.replace(/[^0-9+]/g, '');
    const whatsappPhone = cleaned.startsWith('+') ? cleaned.slice(1) : cleaned;

    const scriptContent = `
Add-Type -AssemblyName System.Windows.Forms

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WinApi {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
    public static void PasteCtrlV() {
        keybd_event(0x11, 0, 0, UIntPtr.Zero);
        keybd_event(0x56, 0, 0, UIntPtr.Zero);
        System.Threading.Thread.Sleep(100);
        keybd_event(0x56, 0, 2, UIntPtr.Zero);
        keybd_event(0x11, 0, 2, UIntPtr.Zero);
    }
}
"@

$files = New-Object System.Collections.Specialized.StringCollection
$files.Add('${filePath}')
[System.Windows.Forms.Clipboard]::SetFileDropList($files)

Start-Process 'whatsapp://send?phone=${whatsappPhone}'
Start-Sleep -Seconds 6

$wa = Get-Process -Name 'WhatsApp*' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($wa) {
    [WinApi]::ShowWindow($wa.MainWindowHandle, 9)
    [WinApi]::SetForegroundWindow($wa.MainWindowHandle)
    Start-Sleep -Seconds 2
    [WinApi]::PasteCtrlV()
}
`.trim();

    const scriptPath = join(tmpdir(), `hqq_wa_${Date.now()}.ps1`);
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    const body = Buffer.from(scriptContent, 'utf-8');
    writeFileSync(scriptPath, Buffer.concat([bom, body]));
    this.logger.log(`PowerShell script written to: ${scriptPath}`);

    return new Promise<{ success: boolean; filePath: string }>((resolve, reject) => {
      execFile(
        'powershell',
        ['-STA', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
        { timeout: 30000 },
        (err, stdout, stderr) => {
          try { unlinkSync(scriptPath); } catch {}
          if (err) {
            this.logger.error(`PowerShell error: ${err.message}`);
            this.logger.error(`stderr: ${stderr}`);
            reject(err);
          } else {
            this.logger.log(`PowerShell done. stdout: ${stdout}`);
            resolve({ success: true, filePath });
          }
        },
      );
    });
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
      include: { createdBy: { select: { id: true, name: true } } },
    });

    this.wsGateway.emit('project.activity.created', { projectId, activity });
    return activity;
  }
}
