import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WsGateway } from '../ws/ws.gateway';

const PRIORITIES = ['HIGH', 'MEDIUM', 'LOW'] as const;
type Priority = (typeof PRIORITIES)[number];
const TITLE_MAX = 500;
const NOTE_MAX = 2000;
const NOTES_PREVIEW = 5;

function normalizeTitle(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) throw new BadRequestException('Title is required');
  if (trimmed.length > TITLE_MAX)
    throw new BadRequestException(`Title must be at most ${TITLE_MAX} characters`);
  return trimmed;
}

function normalizeNote(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) throw new BadRequestException('Note content is required');
  if (trimmed.length > NOTE_MAX)
    throw new BadRequestException(`Note must be at most ${NOTE_MAX} characters`);
  return trimmed;
}

function normalizePriority(raw?: string): Priority {
  const value = (raw ?? 'MEDIUM').toUpperCase();
  if (!PRIORITIES.includes(value as Priority))
    throw new BadRequestException(`Priority must be one of ${PRIORITIES.join(', ')}`);
  return value as Priority;
}

@Injectable()
export class TodoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
  ) {}

  // ─── Users list (for page 1) ───

  async listUsersWithCounts() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true, role: true },
    });
    const counts = await this.prisma.todoTask.groupBy({
      by: ['ownerUserId'],
      where: { isDone: false },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.ownerUserId, c._count._all]));
    return users.map((u) => ({ ...u, activeTaskCount: countMap.get(u.id) ?? 0 }));
  }

  // ─── Tasks for a user (page 2) ───

  async listTasksForUser(userId: string) {
    const owner = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true },
    });
    if (!owner) throw new NotFoundException('User not found');

    const tasks = await this.prisma.todoTask.findMany({
      where: { ownerUserId: userId },
      orderBy: [{ isDone: 'asc' }, { orderIndex: 'asc' }],
      include: {
        notes: {
          orderBy: { createdAt: 'desc' },
          take: NOTES_PREVIEW,
          include: {
            createdBy: { select: { id: true, name: true } },
          },
        },
        _count: { select: { notes: true } },
      },
    });

    const active = tasks
      .filter((t) => !t.isDone)
      .sort((a, b) => a.orderIndex - b.orderIndex);
    const done = tasks
      .filter((t) => t.isDone)
      .sort(
        (a, b) =>
          (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0),
      );

    return { owner, active, done };
  }

  // ─── Create ───

  async createTask(
    ownerUserId: string,
    dto: { title: string; priority?: string },
  ) {
    const owner = await this.prisma.user.findUnique({
      where: { id: ownerUserId },
      select: { id: true },
    });
    if (!owner) throw new NotFoundException('User not found');

    const title = normalizeTitle(dto.title);
    const priority = normalizePriority(dto.priority);

    const max = await this.prisma.todoTask.aggregate({
      where: { ownerUserId, isDone: false },
      _max: { orderIndex: true },
    });
    const orderIndex = (max._max.orderIndex ?? -1) + 1;

    const task = await this.prisma.todoTask.create({
      data: { ownerUserId, title, priority, orderIndex },
    });
    this.wsGateway.emit('todo.task.created', {
      ownerUserId,
      taskId: task.id,
    });
    return task;
  }

  // ─── Update (title / priority / isDone) ───

  async updateTask(
    taskId: string,
    dto: { title?: string; priority?: string; isDone?: boolean },
  ) {
    const existing = await this.prisma.todoTask.findUnique({
      where: { id: taskId },
    });
    if (!existing) throw new NotFoundException('Task not found');

    const data: Prisma.TodoTaskUpdateInput = {};
    if (dto.title !== undefined) data.title = normalizeTitle(dto.title);
    if (dto.priority !== undefined) data.priority = normalizePriority(dto.priority);

    if (dto.isDone !== undefined && dto.isDone !== existing.isDone) {
      data.isDone = dto.isDone;
      if (dto.isDone) {
        data.completedAt = new Date();
      } else {
        data.completedAt = null;
        const max = await this.prisma.todoTask.aggregate({
          where: { ownerUserId: existing.ownerUserId, isDone: false },
          _max: { orderIndex: true },
        });
        data.orderIndex = (max._max.orderIndex ?? -1) + 1;
      }
    }

    const updated = await this.prisma.todoTask.update({
      where: { id: taskId },
      data,
    });
    this.wsGateway.emit('todo.task.updated', {
      ownerUserId: existing.ownerUserId,
      taskId: updated.id,
    });
    return updated;
  }

  // ─── Delete ───

  async deleteTask(taskId: string) {
    const existing = await this.prisma.todoTask.findUnique({
      where: { id: taskId },
      select: { id: true, ownerUserId: true },
    });
    if (!existing) throw new NotFoundException('Task not found');
    await this.prisma.todoTask.delete({ where: { id: taskId } });
    this.wsGateway.emit('todo.task.deleted', {
      ownerUserId: existing.ownerUserId,
      taskId,
    });
    return { id: taskId };
  }

  // ─── Reorder ───

  async reorderTasks(ownerUserId: string, orderedIds: string[]) {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0)
      throw new BadRequestException('orderedIds must be a non-empty array');

    const tasks = await this.prisma.todoTask.findMany({
      where: { ownerUserId, isDone: false },
      select: { id: true },
    });
    const validIds = new Set(tasks.map((t) => t.id));

    if (orderedIds.length !== validIds.size)
      throw new BadRequestException(
        `orderedIds must contain exactly the user's ${validIds.size} active tasks`,
      );
    for (const id of orderedIds) {
      if (!validIds.has(id))
        throw new BadRequestException(`Task ${id} is not an active task of this user`);
    }

    await this.prisma.$transaction(
      orderedIds.map((id, idx) =>
        this.prisma.todoTask.update({
          where: { id },
          data: { orderIndex: idx },
        }),
      ),
    );
    this.wsGateway.emit('todo.tasks.reordered', { ownerUserId });
    return { ok: true };
  }

  // ─── Notes ───

  async listAllNotes(taskId: string) {
    const exists = await this.prisma.todoTask.findUnique({
      where: { id: taskId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Task not found');
    return this.prisma.todoTaskNote.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
    });
  }

  async addNote(taskId: string, content: string, userId: string) {
    const task = await this.prisma.todoTask.findUnique({
      where: { id: taskId },
      select: { id: true, ownerUserId: true },
    });
    if (!task) throw new NotFoundException('Task not found');
    const note = await this.prisma.todoTaskNote.create({
      data: {
        taskId,
        content: normalizeNote(content),
        createdByUserId: userId,
      },
      include: { createdBy: { select: { id: true, name: true } } },
    });
    this.wsGateway.emit('todo.note.created', {
      ownerUserId: task.ownerUserId,
      taskId,
      noteId: note.id,
    });
    return note;
  }

  async deleteNote(noteId: string) {
    const note = await this.prisma.todoTaskNote.findUnique({
      where: { id: noteId },
      include: { task: { select: { ownerUserId: true } } },
    });
    if (!note) throw new NotFoundException('Note not found');
    await this.prisma.todoTaskNote.delete({ where: { id: noteId } });
    this.wsGateway.emit('todo.note.deleted', {
      ownerUserId: note.task.ownerUserId,
      taskId: note.taskId,
      noteId,
    });
    return { id: noteId };
  }
}
