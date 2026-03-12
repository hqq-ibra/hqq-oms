import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';

enum ActivityType {
  STICKY_NOTE_CREATED = 'STICKY_NOTE_CREATED',
  DOCUMENT_UPDATED = 'DOCUMENT_UPDATED',
  STAGE_FILE_UPLOADED = 'STAGE_FILE_UPLOADED',
  STAGE_TASK_CREATED = 'STAGE_TASK_CREATED',
  STAGE_STARTED = 'STAGE_STARTED',
  STAGE_COMPLETED = 'STAGE_COMPLETED',
  ITEM_PINNED = 'ITEM_PINNED',
  FILE_REMOVED = 'FILE_REMOVED',
  TASK_STATUS_CHANGED = 'TASK_STATUS_CHANGED',
  TASK_DELETED = 'TASK_DELETED',
  STAGE_LINK_ADDED = 'STAGE_LINK_ADDED',
  STAGE_LINK_REMOVED = 'STAGE_LINK_REMOVED',
}

@Injectable()
export class StageWorkspaceService {
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

  private async findStage(stageId: string) {
    const stage = await this.prisma.projectStage.findUnique({
      where: { id: stageId },
    });
    if (!stage) throw new NotFoundException('Stage not found');
    return stage;
  }

  async getStageWorkspace(stageId: string) {
    const stage = await this.prisma.projectStage.findUnique({
      where: { id: stageId },
      include: {
        stickyNotes: {
          include: { createdBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        document: {
          include: { updatedBy: { select: { id: true, name: true } } },
        },
        stageFiles: {
          include: { uploadedBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        stageTasks: {
          include: { assignee: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        stageLinks: {
          include: { createdBy: { select: { id: true, name: true } } },
          orderBy: { createdAt: 'desc' },
        },
        mindMap: {
          include: { updatedBy: { select: { id: true, name: true } } },
        },
        flowchart: {
          include: { updatedBy: { select: { id: true, name: true } } },
        },
      },
    });
    if (!stage) throw new NotFoundException('Stage not found');
    return stage;
  }

  // ─── Sticky Notes ───

  async listStickyNotes(stageId: string) {
    await this.findStage(stageId);
    return this.prisma.stageStickyNote.findMany({
      where: { stageId },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createStickyNote(
    stageId: string,
    dto: { title: string; content?: string; color?: string; positionX?: number; positionY?: number },
    userId: string,
  ) {
    const stage = await this.findStage(stageId);
    const note = await this.prisma.stageStickyNote.create({
      data: {
        stageId,
        title: dto.title,
        content: dto.content ?? '',
        color: dto.color ?? 'yellow',
        positionX: dto.positionX ?? 0,
        positionY: dto.positionY ?? 0,
        createdByUserId: userId,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    await this.logActivity(stage.projectId, ActivityType.STICKY_NOTE_CREATED, `Note "${dto.title}" added to stage "${stage.name}"`, userId, { stageId, noteId: note.id });
    this.wsGateway.emit('project.stage.updated', { projectId: stage.projectId, stageId });
    return note;
  }

  async updateStickyNote(
    stageId: string,
    noteId: string,
    dto: { title?: string; content?: string; color?: string; positionX?: number; positionY?: number },
  ) {
    const note = await this.prisma.stageStickyNote.findFirst({ where: { id: noteId, stageId } });
    if (!note) throw new NotFoundException('Note not found');
    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.content !== undefined) data.content = dto.content;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.positionX !== undefined) data.positionX = dto.positionX;
    if (dto.positionY !== undefined) data.positionY = dto.positionY;

    return this.prisma.stageStickyNote.update({
      where: { id: noteId },
      data,
      include: { createdBy: { select: { id: true, name: true } } },
    });
  }

  async deleteStickyNote(stageId: string, noteId: string) {
    const note = await this.prisma.stageStickyNote.findFirst({ where: { id: noteId, stageId } });
    if (!note) throw new NotFoundException('Note not found');
    await this.prisma.stageStickyNote.delete({ where: { id: noteId } });
    return { success: true };
  }

  // ─── Stage Document ───

  async getDocument(stageId: string) {
    await this.findStage(stageId);
    let doc = await this.prisma.stageDocument.findUnique({
      where: { stageId },
      include: { updatedBy: { select: { id: true, name: true } } },
    });
    if (!doc) {
      doc = await this.prisma.stageDocument.create({
        data: { stageId, content: {} },
        include: { updatedBy: { select: { id: true, name: true } } },
      });
    }
    return doc;
  }

  async updateDocument(stageId: string, content: unknown, userId: string) {
    const stage = await this.findStage(stageId);
    const doc = await this.prisma.stageDocument.upsert({
      where: { stageId },
      create: { stageId, content: content as object, updatedByUserId: userId },
      update: { content: content as object, updatedByUserId: userId },
      include: { updatedBy: { select: { id: true, name: true } } },
    });
    await this.logActivity(stage.projectId, ActivityType.DOCUMENT_UPDATED, `Document updated in stage "${stage.name}"`, userId, { stageId });
    this.wsGateway.emit('project.stage.updated', { projectId: stage.projectId, stageId });
    return doc;
  }

  // ─── Stage Files ───

  async listFiles(stageId: string) {
    await this.findStage(stageId);
    return this.prisma.stageFile.findMany({
      where: { stageId },
      include: { uploadedBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createFile(
    stageId: string,
    dto: { title: string; filePath: string; fileType: string; fileSize?: number },
    userId: string,
  ) {
    const stage = await this.findStage(stageId);
    const file = await this.prisma.stageFile.create({
      data: {
        stageId,
        title: dto.title,
        filePath: dto.filePath,
        fileType: dto.fileType,
        fileSize: dto.fileSize,
        uploadedByUserId: userId,
      },
      include: { uploadedBy: { select: { id: true, name: true } } },
    });
    await this.logActivity(stage.projectId, ActivityType.STAGE_FILE_UPLOADED, `File "${dto.title}" uploaded to stage "${stage.name}"`, userId, { stageId, fileId: file.id });
    this.wsGateway.emit('project.stage.updated', { projectId: stage.projectId, stageId });
    return file;
  }

  async deleteFile(stageId: string, fileId: string, userId: string) {
    const file = await this.prisma.stageFile.findFirst({ where: { id: fileId, stageId } });
    if (!file) throw new NotFoundException('File not found');
    const stage = await this.findStage(stageId);
    await this.prisma.stageFile.delete({ where: { id: fileId } });
    await this.logActivity(stage.projectId, ActivityType.FILE_REMOVED, `File "${file.title}" removed from stage "${stage.name}"`, userId, { stageId, fileId });
    return { success: true };
  }

  // ─── Stage Tasks ───

  async listTasks(stageId: string) {
    await this.findStage(stageId);
    return this.prisma.stageTask.findMany({
      where: { stageId },
      include: { assignee: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createTask(
    stageId: string,
    dto: { title: string; description?: string; assigneeUserId?: string | null; dueDate?: string | null },
    userId: string,
  ) {
    const stage = await this.findStage(stageId);
    const task = await this.prisma.stageTask.create({
      data: {
        stageId,
        title: dto.title,
        description: dto.description,
        assigneeUserId: dto.assigneeUserId ?? null,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      },
      include: { assignee: { select: { id: true, name: true } } },
    });
    await this.logActivity(stage.projectId, ActivityType.STAGE_TASK_CREATED, `Task "${dto.title}" added to stage "${stage.name}"`, userId, { stageId, taskId: task.id });
    this.wsGateway.emit('project.stage.updated', { projectId: stage.projectId, stageId });
    return task;
  }

  async updateTask(
    stageId: string,
    taskId: string,
    dto: { title?: string; description?: string | null; status?: string; assigneeUserId?: string | null; dueDate?: string | null },
    userId: string,
  ) {
    const task = await this.prisma.stageTask.findFirst({ where: { id: taskId, stageId } });
    if (!task) throw new NotFoundException('Task not found');
    const stage = await this.findStage(stageId);

    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.assigneeUserId !== undefined) data.assigneeUserId = dto.assigneeUserId;
    if (dto.dueDate !== undefined) data.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
    if (dto.status !== undefined) {
      data.status = dto.status;
      if (dto.status === 'DONE' && !task.completedAt) data.completedAt = new Date();
      if (dto.status !== 'DONE' && task.completedAt) data.completedAt = null;
      await this.logActivity(stage.projectId, ActivityType.TASK_STATUS_CHANGED, `Task "${task.title}" → ${dto.status}`, userId, { stageId, taskId, oldStatus: task.status, newStatus: dto.status });
    }

    return this.prisma.stageTask.update({
      where: { id: taskId },
      data,
      include: { assignee: { select: { id: true, name: true } } },
    });
  }

  async deleteTask(stageId: string, taskId: string, userId: string) {
    const task = await this.prisma.stageTask.findFirst({ where: { id: taskId, stageId } });
    if (!task) throw new NotFoundException('Task not found');
    const stage = await this.findStage(stageId);
    await this.prisma.stageTask.delete({ where: { id: taskId } });
    await this.logActivity(stage.projectId, ActivityType.TASK_DELETED, `Task "${task.title}" removed from stage "${stage.name}"`, userId, { stageId, taskId });
    return { success: true };
  }

  // ─── Mind Map ───

  async getMindMap(stageId: string) {
    await this.findStage(stageId);
    let mindMap = await this.prisma.stageMindMap.findUnique({
      where: { stageId },
      include: { updatedBy: { select: { id: true, name: true } } },
    });
    if (!mindMap) {
      mindMap = await this.prisma.stageMindMap.create({
        data: { stageId, content: {} },
        include: { updatedBy: { select: { id: true, name: true } } },
      });
    }
    return mindMap;
  }

  async updateMindMap(stageId: string, content: unknown, userId: string) {
    const stage = await this.findStage(stageId);
    const mindMap = await this.prisma.stageMindMap.upsert({
      where: { stageId },
      create: { stageId, content: content as object, updatedByUserId: userId },
      update: { content: content as object, updatedByUserId: userId },
      include: { updatedBy: { select: { id: true, name: true } } },
    });
    this.wsGateway.emit('project.stage.updated', { projectId: stage.projectId, stageId });
    return mindMap;
  }

  // ─── Flowchart ───

  async getFlowchart(stageId: string) {
    await this.findStage(stageId);
    let flowchart = await this.prisma.stageFlowchart.findUnique({
      where: { stageId },
      include: { updatedBy: { select: { id: true, name: true } } },
    });
    if (!flowchart) {
      flowchart = await this.prisma.stageFlowchart.create({
        data: { stageId, content: {} },
        include: { updatedBy: { select: { id: true, name: true } } },
      });
    }
    return flowchart;
  }

  async updateFlowchart(stageId: string, content: unknown, userId: string) {
    const stage = await this.findStage(stageId);
    const flowchart = await this.prisma.stageFlowchart.upsert({
      where: { stageId },
      create: { stageId, content: content as object, updatedByUserId: userId },
      update: { content: content as object, updatedByUserId: userId },
      include: { updatedBy: { select: { id: true, name: true } } },
    });
    this.wsGateway.emit('project.stage.updated', { projectId: stage.projectId, stageId });
    return flowchart;
  }

  // ─── Stage Links ───

  async listLinks(stageId: string) {
    await this.findStage(stageId);
    return this.prisma.stageLink.findMany({
      where: { stageId },
      include: { createdBy: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createLink(
    stageId: string,
    dto: { title: string; url: string; description?: string },
    userId: string,
  ) {
    const stage = await this.findStage(stageId);
    const link = await this.prisma.stageLink.create({
      data: {
        stageId,
        title: dto.title,
        url: dto.url,
        description: dto.description ?? null,
        createdByUserId: userId,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    await this.logActivity(stage.projectId, ActivityType.STAGE_LINK_ADDED, `Link "${dto.title}" added to stage "${stage.name}"`, userId, { stageId, linkId: link.id });
    this.wsGateway.emit('project.stage.updated', { projectId: stage.projectId, stageId });
    return link;
  }

  async updateLink(
    stageId: string,
    linkId: string,
    dto: { title?: string; url?: string; description?: string | null },
  ) {
    const link = await this.prisma.stageLink.findFirst({ where: { id: linkId, stageId } });
    if (!link) throw new NotFoundException('Link not found');
    const data: Record<string, unknown> = {};
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.url !== undefined) data.url = dto.url;
    if (dto.description !== undefined) data.description = dto.description;
    return this.prisma.stageLink.update({
      where: { id: linkId },
      data,
      include: { createdBy: { select: { id: true, name: true } } },
    });
  }

  async deleteLink(stageId: string, linkId: string, userId: string) {
    const link = await this.prisma.stageLink.findFirst({ where: { id: linkId, stageId } });
    if (!link) throw new NotFoundException('Link not found');
    const stage = await this.findStage(stageId);
    await this.prisma.stageLink.delete({ where: { id: linkId } });
    await this.logActivity(stage.projectId, ActivityType.STAGE_LINK_REMOVED, `Link "${link.title}" removed from stage "${stage.name}"`, userId, { stageId, linkId });
    this.wsGateway.emit('project.stage.updated', { projectId: stage.projectId, stageId });
    return { success: true };
  }

  // ─── Pinning ───

  async pinItem(projectId: string, dto: { itemType: string; itemId: string; pinnedLocation: string }, userId: string) {
    const pinned = await this.prisma.projectPinnedItem.upsert({
      where: {
        projectId_itemType_itemId_pinnedLocation: {
          projectId,
          itemType: dto.itemType,
          itemId: dto.itemId,
          pinnedLocation: dto.pinnedLocation,
        },
      },
      create: {
        projectId,
        itemType: dto.itemType,
        itemId: dto.itemId,
        pinnedLocation: dto.pinnedLocation,
      },
      update: {},
    });
    await this.logActivity(projectId, ActivityType.ITEM_PINNED, `Item pinned to ${dto.pinnedLocation}`, userId, { itemType: dto.itemType, itemId: dto.itemId, pinnedLocation: dto.pinnedLocation });
    this.wsGateway.emit('project.updated', { projectId });
    return pinned;
  }

  async unpinItem(projectId: string, pinId: string) {
    const item = await this.prisma.projectPinnedItem.findFirst({ where: { id: pinId, projectId } });
    if (!item) throw new NotFoundException('Pinned item not found');
    await this.prisma.projectPinnedItem.delete({ where: { id: pinId } });
    return { success: true };
  }

  async listPinnedItems(projectId: string) {
    return this.prisma.projectPinnedItem.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
