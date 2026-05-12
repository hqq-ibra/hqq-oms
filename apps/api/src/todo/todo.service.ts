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
const NAME_MAX = 200;
const EMAIL_MAX = 200;
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

function normalizeName(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) throw new BadRequestException('Name is required');
  if (trimmed.length > NAME_MAX)
    throw new BadRequestException(`Name must be at most ${NAME_MAX} characters`);
  return trimmed;
}

function normalizeEmail(raw?: string | null): string | null {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed.length > EMAIL_MAX)
    throw new BadRequestException(`Email must be at most ${EMAIL_MAX} characters`);
  // very light validation; not RFC-strict
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed))
    throw new BadRequestException('Email is invalid');
  return trimmed;
}

@Injectable()
export class TodoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wsGateway: WsGateway,
  ) {}

  // ─── People (page 1) ───

  async listPeopleWithCounts() {
    const people = await this.prisma.todoPerson.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true, email: true },
    });
    const counts = await this.prisma.todoTask.groupBy({
      by: ['ownerPersonId'],
      where: { isDone: false },
      _count: { _all: true },
    });
    const countMap = new Map(counts.map((c) => [c.ownerPersonId, c._count._all]));
    return people.map((p) => ({ ...p, activeTaskCount: countMap.get(p.id) ?? 0 }));
  }

  async createPerson(dto: { name: string; email?: string | null }) {
    const name = normalizeName(dto.name);
    const email = normalizeEmail(dto.email);
    const person = await this.prisma.todoPerson.create({
      data: { name, email },
    });
    this.wsGateway.emit('todo.person.created', { personId: person.id });
    return person;
  }

  async updatePerson(
    personId: string,
    dto: { name?: string; email?: string | null },
  ) {
    const existing = await this.prisma.todoPerson.findUnique({
      where: { id: personId },
    });
    if (!existing) throw new NotFoundException('Person not found');
    const data: Prisma.TodoPersonUpdateInput = {};
    if (dto.name !== undefined) data.name = normalizeName(dto.name);
    if (dto.email !== undefined) data.email = normalizeEmail(dto.email);
    const updated = await this.prisma.todoPerson.update({
      where: { id: personId },
      data,
    });
    this.wsGateway.emit('todo.person.updated', { personId });
    return updated;
  }

  async deletePerson(personId: string) {
    const existing = await this.prisma.todoPerson.findUnique({
      where: { id: personId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Person not found');
    await this.prisma.todoPerson.delete({ where: { id: personId } });
    this.wsGateway.emit('todo.person.deleted', { personId });
    return { id: personId };
  }

  // ─── Tasks for a person (page 2) ───

  async listTasksForPerson(personId: string) {
    const owner = await this.prisma.todoPerson.findUnique({
      where: { id: personId },
      select: { id: true, name: true, email: true },
    });
    if (!owner) throw new NotFoundException('Person not found');

    const tasks = await this.prisma.todoTask.findMany({
      where: { ownerPersonId: personId },
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

  // ─── Create task ───

  async createTask(
    ownerPersonId: string,
    dto: { title: string; priority?: string },
  ) {
    const owner = await this.prisma.todoPerson.findUnique({
      where: { id: ownerPersonId },
      select: { id: true },
    });
    if (!owner) throw new NotFoundException('Person not found');

    const title = normalizeTitle(dto.title);
    const priority = normalizePriority(dto.priority);

    const max = await this.prisma.todoTask.aggregate({
      where: { ownerPersonId, isDone: false },
      _max: { orderIndex: true },
    });
    const orderIndex = (max._max.orderIndex ?? -1) + 1;

    const task = await this.prisma.todoTask.create({
      data: { ownerPersonId, title, priority, orderIndex },
    });
    this.wsGateway.emit('todo.task.created', {
      ownerPersonId,
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
          where: { ownerPersonId: existing.ownerPersonId, isDone: false },
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
      ownerPersonId: existing.ownerPersonId,
      taskId: updated.id,
    });
    return updated;
  }

  // ─── Delete task ───

  async deleteTask(taskId: string) {
    const existing = await this.prisma.todoTask.findUnique({
      where: { id: taskId },
      select: { id: true, ownerPersonId: true },
    });
    if (!existing) throw new NotFoundException('Task not found');
    await this.prisma.todoTask.delete({ where: { id: taskId } });
    this.wsGateway.emit('todo.task.deleted', {
      ownerPersonId: existing.ownerPersonId,
      taskId,
    });
    return { id: taskId };
  }

  // ─── Reorder ───

  async reorderTasks(ownerPersonId: string, orderedIds: string[]) {
    if (!Array.isArray(orderedIds) || orderedIds.length === 0)
      throw new BadRequestException('orderedIds must be a non-empty array');

    const tasks = await this.prisma.todoTask.findMany({
      where: { ownerPersonId, isDone: false },
      select: { id: true },
    });
    const validIds = new Set(tasks.map((t) => t.id));

    if (orderedIds.length !== validIds.size)
      throw new BadRequestException(
        `orderedIds must contain exactly the person's ${validIds.size} active tasks`,
      );
    for (const id of orderedIds) {
      if (!validIds.has(id))
        throw new BadRequestException(`Task ${id} is not an active task of this person`);
    }

    await this.prisma.$transaction(
      orderedIds.map((id, idx) =>
        this.prisma.todoTask.update({
          where: { id },
          data: { orderIndex: idx },
        }),
      ),
    );
    this.wsGateway.emit('todo.tasks.reordered', { ownerPersonId });
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
      select: { id: true, ownerPersonId: true },
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
      ownerPersonId: task.ownerPersonId,
      taskId,
      noteId: note.id,
    });
    return note;
  }

  async deleteNote(noteId: string) {
    const note = await this.prisma.todoTaskNote.findUnique({
      where: { id: noteId },
      include: { task: { select: { ownerPersonId: true } } },
    });
    if (!note) throw new NotFoundException('Note not found');
    await this.prisma.todoTaskNote.delete({ where: { id: noteId } });
    this.wsGateway.emit('todo.note.deleted', {
      ownerPersonId: note.task.ownerPersonId,
      taskId: note.taskId,
      noteId,
    });
    return { id: noteId };
  }
}
