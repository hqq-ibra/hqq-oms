# To-Do Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standalone "To-Do" section to HQQ-OMS where any logged-in user can create, prioritize (drag + High/Med/Low colors), check off, comment on, and reorder tasks assigned to any user, with realtime updates and a mobile-first UI.

**Architecture:** Two new Prisma models (`TodoTask`, `TodoTaskNote`) → a new NestJS module `todo/` exposing REST + WebSocket events → two Next.js pages under `/todo` and `/todo/[userId]` using `@dnd-kit` for drag-and-drop, TanStack Query for state, and the existing `useSocketEvent` hook for realtime invalidation. Follows the same module / service / controller pattern as `projects/`.

**Tech Stack:** NestJS 11 · Prisma 6 · PostgreSQL 16 · Next.js 15 · React 19 · TanStack Query · @dnd-kit · socket.io · date-fns · TailwindCSS · lucide-react.

**Repository note:** No automated test framework is configured. Verification is via manual curl + UI checks at the end of each phase. Each task ends with a commit.

**Spec reference:** [`docs/superpowers/specs/2026-04-27-todo-section-design.md`](../specs/2026-04-27-todo-section-design.md)

---

## Phase 0 — Pre-flight

### Task 0.1: Confirm local dev environment is healthy

**Files:** None.

- [ ] **Step 1: Make sure local Postgres is running and reachable**

```bash
docker ps --filter "name=hqq_postgres" --format "{{.Names}}: {{.Status}}"
docker exec hqq_postgres pg_isready -U hqq
```
Expected: container is `Up`, output `accepting connections`. If not running: `cd C:/Users/Lenovo/Projects/hqq-oms && docker compose -f docker/docker-compose.yml up -d postgres`.

- [ ] **Step 2: Confirm local DB has the restored prod data**

```bash
docker exec hqq_postgres psql -U hqq -d hqq_oms -c "SELECT COUNT(*) FROM users WHERE is_active = true;"
```
Expected: returns a number ≥ 1 (the admin user from the seed at minimum).

- [ ] **Step 3: Confirm Prisma client compiles**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms && npm run db:generate
```
Expected: `Generated Prisma Client (v6.x.x)` with no errors.

---

## Phase 1 — Database schema

### Task 1.1: Add `TodoTask` and `TodoTaskNote` models to Prisma schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the two new models at the end of the file (just before the `enum Role` block at line 963)**

Append, immediately above the `enum Role {` line:

```prisma
// ─── To-Do ───

model TodoTask {
  id          String    @id @default(cuid())
  ownerUserId String    @map("owner_user_id")
  title       String
  priority    String    @default("MEDIUM")
  orderIndex  Int       @map("order_index")
  isDone      Boolean   @default(false) @map("is_done")
  completedAt DateTime? @map("completed_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  owner User           @relation("TodoOwner", fields: [ownerUserId], references: [id], onDelete: Cascade)
  notes TodoTaskNote[]

  @@index([ownerUserId, isDone, orderIndex])
  @@map("todo_tasks")
}

model TodoTaskNote {
  id              String   @id @default(cuid())
  taskId          String   @map("task_id")
  content         String
  createdByUserId String?  @map("created_by_user_id")
  createdAt       DateTime @default(now()) @map("created_at")

  task      TodoTask @relation(fields: [taskId], references: [id], onDelete: Cascade)
  createdBy User?    @relation("TodoNoteAuthor", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([taskId, createdAt])
  @@map("todo_task_notes")
}
```

- [ ] **Step 2: Add the inverse relations to the `User` model (around line 46, with the other `@relation("...")` lines)**

Inside `model User { … }`, after the existing line `clientApprovalNotes        ClientApprovalNote[]           @relation("ClientApprovalNoteCreator")`, append:

```prisma
  todoTasks                  TodoTask[]                     @relation("TodoOwner")
  todoNotes                  TodoTaskNote[]                 @relation("TodoNoteAuthor")
```

- [ ] **Step 3: Validate the schema**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms && npx prisma validate --schema prisma/schema.prisma
```
Expected: `The schema at prisma\schema.prisma is valid 🚀`.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git add prisma/schema.prisma
git commit -m "feat(todo): add TodoTask and TodoTaskNote Prisma models"
```

### Task 1.2: Create and apply the migration

**Files:**
- Create: `prisma/migrations/<timestamp>_add_todo_tables/migration.sql` (auto-generated)

- [ ] **Step 1: Generate the migration**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms && npx prisma migrate dev --name add_todo_tables --schema prisma/schema.prisma
```
Expected output includes `Applying migration ...add_todo_tables` and `✔ Generated Prisma Client`. A new folder appears under `prisma/migrations/`.

- [ ] **Step 2: Verify the tables exist**

```bash
docker exec hqq_postgres psql -U hqq -d hqq_oms -c "\dt todo_*"
```
Expected: lists `todo_tasks` and `todo_task_notes`.

- [ ] **Step 3: Verify Prisma client was regenerated with the new types**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms && node -e "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient(); console.log(typeof p.todoTask, typeof p.todoTaskNote); p.\$disconnect();"
```
Expected output: `object object`.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git add prisma/migrations
git commit -m "feat(todo): add migration for todo tables"
```

---

## Phase 2 — Backend: Todo module

### Task 2.1: Create the `TodoService`

**Files:**
- Create: `apps/api/src/todo/todo.service.ts`

- [ ] **Step 1: Create the service file with all CRUD + reorder + notes operations**

```typescript
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

    // Split active vs done; sort each per spec.
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
        // Re-append to bottom of active list.
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
```

- [ ] **Step 2: TypeScript compile check**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms && npx tsc --noEmit -p apps/api/tsconfig.json
```
Expected: no output, exit code 0.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git add apps/api/src/todo/todo.service.ts
git commit -m "feat(todo): add TodoService with CRUD, reorder, notes"
```

### Task 2.2: Create the `TodoController`

**Files:**
- Create: `apps/api/src/todo/todo.controller.ts`

- [ ] **Step 1: Create the controller**

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TodoService } from './todo.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt.strategy';

@Controller('api/v1/todo')
@UseGuards(JwtAuthGuard)
export class TodoController {
  constructor(private readonly todo: TodoService) {}

  @Get('users')
  listUsers() {
    return this.todo.listUsersWithCounts();
  }

  @Get('users/:userId/tasks')
  listTasks(@Param('userId') userId: string) {
    return this.todo.listTasksForUser(userId);
  }

  @Post('users/:userId/tasks')
  createTask(
    @Param('userId') userId: string,
    @Body() dto: { title: string; priority?: string },
  ) {
    return this.todo.createTask(userId, dto);
  }

  @Post('users/:userId/tasks/reorder')
  reorder(
    @Param('userId') userId: string,
    @Body('orderedIds') orderedIds: string[],
  ) {
    return this.todo.reorderTasks(userId, orderedIds);
  }

  @Patch('tasks/:taskId')
  updateTask(
    @Param('taskId') taskId: string,
    @Body() dto: { title?: string; priority?: string; isDone?: boolean },
  ) {
    return this.todo.updateTask(taskId, dto);
  }

  @Delete('tasks/:taskId')
  deleteTask(@Param('taskId') taskId: string) {
    return this.todo.deleteTask(taskId);
  }

  @Get('tasks/:taskId/notes')
  listNotes(@Param('taskId') taskId: string) {
    return this.todo.listAllNotes(taskId);
  }

  @Post('tasks/:taskId/notes')
  addNote(
    @Param('taskId') taskId: string,
    @Body('content') content: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.todo.addNote(taskId, content, user.userId);
  }

  @Delete('notes/:noteId')
  deleteNote(@Param('noteId') noteId: string) {
    return this.todo.deleteNote(noteId);
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git add apps/api/src/todo/todo.controller.ts
git commit -m "feat(todo): add TodoController with REST routes"
```

### Task 2.3: Create the `TodoModule` and register it in `AppModule`

**Files:**
- Create: `apps/api/src/todo/todo.module.ts`
- Modify: `apps/api/src/app.module.ts`

- [ ] **Step 1: Create the module**

```typescript
// apps/api/src/todo/todo.module.ts
import { Module } from '@nestjs/common';
import { TodoController } from './todo.controller';
import { TodoService } from './todo.service';
import { PrismaModule } from '../prisma/prisma.module';
import { WsModule } from '../ws/ws.module';

@Module({
  imports: [PrismaModule, WsModule],
  controllers: [TodoController],
  providers: [TodoService],
  exports: [TodoService],
})
export class TodoModule {}
```

- [ ] **Step 2: Register the module in `app.module.ts`**

In `apps/api/src/app.module.ts`, add the import line and include in `imports` array:

```typescript
import { TodoModule } from './todo/todo.module';
```
And inside the `imports: [ … ]` of `@Module`, add `TodoModule` between `ProjectsModule` and `WsModule`:
```typescript
    ProjectsModule,
    TodoModule,
    WsModule,
```

- [ ] **Step 3: TypeScript compile check**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms && npx tsc --noEmit -p apps/api/tsconfig.json
```
Expected: no output, exit code 0.

- [ ] **Step 4: Commit**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git add apps/api/src/todo/todo.module.ts apps/api/src/app.module.ts
git commit -m "feat(todo): wire TodoModule into AppModule"
```

### Task 2.4: Smoke-test the API end-to-end with curl

**Files:** None (manual verification only).

- [ ] **Step 1: Start the dev API**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms && npm run dev:api
```
Wait until you see `HQQ OMS API running on http://0.0.0.0:4000`.

- [ ] **Step 2: Authenticate and capture a token**

In a second terminal:

```bash
TOKEN=$(curl -s -X POST http://localhost:4000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hqq.com","password":"admin123"}' \
  | python -c "import sys,json; print(json.load(sys.stdin)['accessToken'])")
echo "TOKEN_LEN=${#TOKEN}"
```
Expected: `TOKEN_LEN=448` (or similar non-zero).

- [ ] **Step 3: List users**

```bash
curl -sS -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/v1/todo/users
```
Expected: JSON array of users, each with `id`, `name`, `email`, `role`, `activeTaskCount: 0`.

- [ ] **Step 4: Capture the admin user id and create a task**

```bash
UID=$(curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/api/v1/todo/users \
  | python -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"title":"First todo","priority":"HIGH"}' \
  "http://localhost:4000/api/v1/todo/users/$UID/tasks"
```
Expected: JSON of the created task with `priority: "HIGH"`, `orderIndex: 0`, `isDone: false`.

- [ ] **Step 5: List tasks (should show the new task in `active`)**

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/v1/todo/users/$UID/tasks" \
  | python -m json.tool
```
Expected: `{ owner: {...}, active: [{...HIGH task...}], done: [] }`.

- [ ] **Step 6: Capture task id, add a note, then list notes**

```bash
TID=$(curl -s -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/v1/todo/users/$UID/tasks" \
  | python -c "import sys,json; print(json.load(sys.stdin)['active'][0]['id'])")
curl -sS -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"Started this task"}' \
  "http://localhost:4000/api/v1/todo/tasks/$TID/notes"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/v1/todo/tasks/$TID/notes" \
  | python -m json.tool
```
Expected: note creation returns the created note with `createdBy: { id, name: "Admin User" }`; list returns an array of length 1.

- [ ] **Step 7: Mark done, then re-list**

```bash
curl -sS -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"isDone":true}' \
  "http://localhost:4000/api/v1/todo/tasks/$TID"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "http://localhost:4000/api/v1/todo/users/$UID/tasks" \
  | python -c "import sys,json; d=json.load(sys.stdin); print('active:',len(d['active']),'done:',len(d['done']))"
```
Expected: `active: 0 done: 1`.

- [ ] **Step 8: Stop the dev API (Ctrl+C in the api terminal)**

- [ ] **Step 9: No code changes in this task; no commit.**

---

## Phase 3 — Frontend: Install dependencies

### Task 3.1: Install `@dnd-kit`

**Files:**
- Modify: `apps/web/package.json` (via npm)
- Modify: `package-lock.json` (auto)

- [ ] **Step 1: Install the three dnd-kit packages into the web workspace**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
npm -w apps/web install @dnd-kit/core@^6.1.0 @dnd-kit/sortable@^8.0.0 @dnd-kit/utilities@^3.2.2
```
Expected: npm shows the three packages added with no audit errors.

- [ ] **Step 2: Confirm they are in `apps/web/package.json`**

```bash
grep -E "@dnd-kit" C:/Users/Lenovo/Projects/hqq-oms/apps/web/package.json
```
Expected: three matching lines.

- [ ] **Step 3: Commit**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git add apps/web/package.json package-lock.json
git commit -m "feat(todo): add @dnd-kit dependencies"
```

---

## Phase 4 — Frontend: Sidebar entry + types

### Task 4.1: Add the To-Do entry to the sidebar

**Files:**
- Modify: `apps/web/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add `CheckSquare` to the lucide-react import**

In `apps/web/src/components/layout/sidebar.tsx`, change the import block (around lines 9-20) so `CheckSquare` is included:

```typescript
import {
  Package,
  Users,
  Box,
  Handshake,
  BarChart3,
  Shield,
  LogOut,
  Menu,
  X,
  FolderKanban,
  CheckSquare,
} from 'lucide-react';
```

- [ ] **Step 2: Insert a new nav section between Projects and Reports**

In the `navSections` array (lines 39-59), change the structure so that there is a new dedicated section between Projects and Reports:

```typescript
const navSections: NavSection[] = [
  {
    items: [
      { href: '/customers', label: 'Customers', icon: Users },
      { href: '/products', label: 'Products', icon: Box },
      { href: '/vendors', label: 'Vendors', icon: Handshake },
      { href: '/orders', label: 'Orders', icon: Package },
    ],
  },
  {
    items: [
      { href: '/projects', label: 'Projects', icon: FolderKanban },
    ],
  },
  {
    items: [
      { href: '/todo', label: 'To-Do', icon: CheckSquare },
    ],
  },
  {
    items: [
      { href: '/reports', label: 'Reports', icon: BarChart3, permission: PERMISSIONS.VIEW_REPORTS },
      { href: '/users', label: 'Users', icon: Shield },
    ],
  },
];
```

- [ ] **Step 3: Commit**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git add apps/web/src/components/layout/sidebar.tsx
git commit -m "feat(todo): add To-Do entry to sidebar"
```

### Task 4.2: Create shared types for the To-Do frontend

**Files:**
- Create: `apps/web/src/app/(dashboard)/todo/_types.ts`

- [ ] **Step 1: Create the types file**

```typescript
// apps/web/src/app/(dashboard)/todo/_types.ts

export type TodoPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export interface TodoUser {
  id: string;
  name: string;
  email: string;
  role: string;
  activeTaskCount: number;
}

export interface TodoNote {
  id: string;
  taskId: string;
  content: string;
  createdAt: string;
  createdByUserId: string | null;
  createdBy: { id: string; name: string } | null;
}

export interface TodoTask {
  id: string;
  ownerUserId: string;
  title: string;
  priority: TodoPriority;
  orderIndex: number;
  isDone: boolean;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  notes: TodoNote[];
  _count: { notes: number };
}

export interface TodoTasksResponse {
  owner: { id: string; name: string; email: string };
  active: TodoTask[];
  done: TodoTask[];
}

export const PRIORITY_LABEL: Record<TodoPriority, string> = {
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

export const PRIORITY_COLOR: Record<TodoPriority, { bg: string; text: string; ring: string }> = {
  HIGH:   { bg: 'bg-red-500',    text: 'text-white', ring: 'ring-red-600' },
  MEDIUM: { bg: 'bg-amber-500',  text: 'text-white', ring: 'ring-amber-600' },
  LOW:    { bg: 'bg-emerald-600',text: 'text-white', ring: 'ring-emerald-700' },
};
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git add apps/web/src/app/(dashboard)/todo/_types.ts
git commit -m "feat(todo): add shared frontend types"
```

---

## Phase 5 — Frontend: Page 1 (User picker)

### Task 5.1: Build the `/todo` user picker page

**Files:**
- Create: `apps/web/src/app/(dashboard)/todo/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/use-auth';
import { useSocketEvent } from '@/hooks/use-socket';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TodoUser } from './_types';

export default function TodoUserPickerPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['todo-users'],
    queryFn: () => api.get<TodoUser[]>('/api/v1/todo/users'),
  });

  const invalidate = React.useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['todo-users'] });
  }, [queryClient]);

  useSocketEvent('todo.task.created', invalidate, [invalidate]);
  useSocketEvent('todo.task.updated', invalidate, [invalidate]);
  useSocketEvent('todo.task.deleted', invalidate, [invalidate]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#DC2626]" />
      </div>
    );
  }

  const users = data ?? [];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6 flex items-center gap-3">
        <CheckSquare className="h-7 w-7 text-[#DC2626]" />
        <h1 className="text-2xl font-bold text-gray-900">To-Do</h1>
      </div>

      {users.length === 0 ? (
        <div className="rounded-xl border-2 border-dashed border-gray-300 py-16 text-center text-gray-400">
          <p className="text-sm">لا يوجد مستخدمين بعد</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {users.map((u) => {
            const isSelf = u.id === user?.id;
            return (
              <Link
                key={u.id}
                href={`/todo/${u.id}`}
                className={cn(
                  'flex flex-col items-center rounded-xl border bg-white p-5 text-center shadow-sm transition hover:shadow-md',
                  isSelf ? 'border-[#DC2626] ring-2 ring-red-200' : 'border-gray-200',
                )}
              >
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#DC2626] to-[#1E3F8B] text-xl font-bold text-white shadow">
                  {u.name?.charAt(0)?.toUpperCase() ?? '?'}
                </div>
                <p className="truncate w-full text-sm font-semibold text-gray-900">{u.name}</p>
                <p className="truncate w-full text-xs text-gray-500">{u.email}</p>
                <div className="mt-3 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                  {u.activeTaskCount} {u.activeTaskCount === 1 ? 'task' : 'tasks'}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the dev web server picks it up**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms && npm run dev
```
In a browser open `http://localhost:3000/todo` (login as `admin@hqq.com / admin123` if redirected).
Expected: page with a "To-Do" header and a grid of user cards. Your own card has a red ring.

- [ ] **Step 3: Stop the dev server (Ctrl+C). Commit.**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git add apps/web/src/app/(dashboard)/todo/page.tsx
git commit -m "feat(todo): add /todo user picker page"
```

---

## Phase 6 — Frontend: Page 2 (Task list)

### Task 6.1: Create the priority pill component

**Files:**
- Create: `apps/web/src/app/(dashboard)/todo/_components/priority-pill.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { PRIORITY_COLOR, PRIORITY_LABEL, type TodoPriority } from '../_types';

export function PriorityPill({
  value,
  onChange,
  disabled,
}: {
  value: TodoPriority;
  onChange: (next: TodoPriority) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const colors = PRIORITY_COLOR[value];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center justify-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide min-w-[64px] h-[28px]',
          colors.bg,
          colors.text,
          'disabled:opacity-50',
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {PRIORITY_LABEL[value]}
      </button>

      {open && (
        <>
          {/* Mobile bottom-sheet */}
          <div className="fixed inset-0 z-40 bg-black/30 sm:hidden" onClick={() => setOpen(false)} />
          <div
            className={cn(
              'sm:absolute sm:top-full sm:start-0 sm:mt-1 sm:w-36 sm:rounded-lg sm:shadow-xl sm:border sm:border-gray-200 sm:bg-white',
              'fixed bottom-0 inset-x-0 z-50 rounded-t-2xl bg-white shadow-2xl sm:bottom-auto sm:inset-x-auto',
            )}
          >
            <div className="p-2 space-y-1">
              {(Object.keys(PRIORITY_LABEL) as TodoPriority[]).map((p) => {
                const c = PRIORITY_COLOR[p];
                const active = p === value;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (p !== value) onChange(p);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm',
                      active ? 'bg-gray-100' : 'hover:bg-gray-50',
                    )}
                  >
                    <span className={cn('h-3 w-3 rounded-full', c.bg)} />
                    <span className="font-medium text-gray-800">{PRIORITY_LABEL[p]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git add apps/web/src/app/(dashboard)/todo/_components/priority-pill.tsx
git commit -m "feat(todo): add PriorityPill with bottom-sheet on mobile"
```

### Task 6.2: Create the relative-time helper

**Files:**
- Create: `apps/web/src/app/(dashboard)/todo/_components/format-time.ts`

- [ ] **Step 1: Create the helper**

```typescript
import { differenceInMinutes, isToday, isYesterday, format } from 'date-fns';
import { ar } from 'date-fns/locale';

export function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diff = differenceInMinutes(new Date(), d);
  if (diff < 1) return 'الآن';
  if (diff < 60) return `قبل ${diff} دقيقة`;
  if (isToday(d)) return `اليوم ${format(d, 'HH:mm')}`;
  if (isYesterday(d)) return `أمس ${format(d, 'HH:mm')}`;
  const daysAgo = Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
  if (daysAgo < 7) return format(d, 'EEEE HH:mm', { locale: ar });
  return format(d, 'd MMM yyyy', { locale: ar });
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git add apps/web/src/app/(dashboard)/todo/_components/format-time.ts
git commit -m "feat(todo): add relative-time formatter"
```

### Task 6.3: Create the task notes component

**Files:**
- Create: `apps/web/src/app/(dashboard)/todo/_components/task-notes.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Loader2, Send, Trash2 } from 'lucide-react';
import { formatRelative } from './format-time';
import type { TodoNote, TodoTask } from '../_types';

export function TaskNotes({ task, ownerUserId }: { task: TodoTask; ownerUserId: string }) {
  const qc = useQueryClient();
  const [showAll, setShowAll] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const allQuery = useQuery({
    queryKey: ['todo-task-notes', task.id],
    queryFn: () => api.get<TodoNote[]>(`/api/v1/todo/tasks/${task.id}/notes`),
    enabled: showAll,
  });

  const notes = showAll && allQuery.data ? allQuery.data : task.notes;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['todo-tasks', ownerUserId] });
    qc.invalidateQueries({ queryKey: ['todo-task-notes', task.id] });
  };

  const addMut = useMutation({
    mutationFn: (content: string) =>
      api.post<TodoNote>(`/api/v1/todo/tasks/${task.id}/notes`, { content }),
    onSuccess: () => {
      setDraft('');
      invalidate();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (noteId: string) => api.delete(`/api/v1/todo/notes/${noteId}`),
    onSuccess: invalidate,
  });

  const remaining = task._count.notes - notes.length;

  return (
    <div className="mt-3 rounded-lg bg-gray-50 p-3">
      <p className="mb-2 text-xs font-semibold text-gray-500">
        💬 آخر التحديثات ({task._count.notes})
      </p>

      {notes.length === 0 ? (
        <p className="py-2 text-xs text-gray-400">لا يوجد تحديثات</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => (
            <li key={n.id} className="group flex gap-2 text-sm">
              <span className="shrink-0 rounded bg-white px-2 py-0.5 text-[11px] font-mono text-gray-500 border border-gray-200">
                {formatRelative(n.createdAt)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-gray-800 break-words whitespace-pre-wrap">{n.content}</span>
                <span className="ms-2 text-xs text-gray-500">— {n.createdBy?.name ?? '(محذوف)'}</span>
              </span>
              <button
                type="button"
                onClick={() => deleteMut.mutate(n.id)}
                className="invisible shrink-0 rounded p-1 text-gray-400 hover:text-red-500 group-hover:visible"
                aria-label="Delete note"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {!showAll && remaining > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 text-xs font-medium text-blue-600 hover:underline"
        >
          عرض الكل ({task._count.notes})
        </button>
      )}
      {showAll && allQuery.isLoading && (
        <Loader2 className="my-2 h-4 w-4 animate-spin text-gray-400" />
      )}

      <div className="mt-2 flex gap-2">
        <textarea
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && draft.trim()) {
              addMut.mutate(draft.trim());
            }
          }}
          placeholder="أضف تحديث..."
          className="min-h-[36px] flex-1 resize-y rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-red-200"
          maxLength={2000}
        />
        <button
          type="button"
          onClick={() => draft.trim() && addMut.mutate(draft.trim())}
          disabled={!draft.trim() || addMut.isPending}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#DC2626] text-white shadow disabled:opacity-50"
          aria-label="Send"
        >
          {addMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git add apps/web/src/app/(dashboard)/todo/_components/task-notes.tsx
git commit -m "feat(todo): add TaskNotes component"
```

### Task 6.4: Create the task row component (with drag handle, checkbox, expand)

**Files:**
- Create: `apps/web/src/app/(dashboard)/todo/_components/task-row.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import * as React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { GripVertical, ChevronDown, ChevronUp, Trash2, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PriorityPill } from './priority-pill';
import { TaskNotes } from './task-notes';
import type { TodoPriority, TodoTask } from '../_types';

export function TaskRow({
  task,
  ownerUserId,
  sortable = true,
}: {
  task: TodoTask;
  ownerUserId: string;
  sortable?: boolean;
}) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(task.title);

  const sort = useSortable({ id: task.id, disabled: !sortable });
  const style: React.CSSProperties = sortable
    ? {
        transform: CSS.Transform.toString(sort.transform),
        transition: sort.transition,
        opacity: sort.isDragging ? 0.6 : 1,
      }
    : {};

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['todo-tasks', ownerUserId] });

  const patchMut = useMutation({
    mutationFn: (dto: { title?: string; priority?: TodoPriority; isDone?: boolean }) =>
      api.patch(`/api/v1/todo/tasks/${task.id}`, dto),
    onMutate: async (dto) => {
      await qc.cancelQueries({ queryKey: ['todo-tasks', ownerUserId] });
      const prev = qc.getQueryData(['todo-tasks', ownerUserId]);
      qc.setQueryData(['todo-tasks', ownerUserId], (old: any) => {
        if (!old) return old;
        const update = (list: TodoTask[]) =>
          list.map((t) => (t.id === task.id ? { ...t, ...dto } : t));
        return { ...old, active: update(old.active), done: update(old.done) };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['todo-tasks', ownerUserId], ctx.prev);
    },
    onSettled: invalidate,
  });

  const deleteMut = useMutation({
    mutationFn: () => api.delete(`/api/v1/todo/tasks/${task.id}`),
    onSuccess: invalidate,
  });

  const submitTitle = () => {
    const v = titleDraft.trim();
    if (v && v !== task.title) patchMut.mutate({ title: v });
    setEditing(false);
  };

  return (
    <li
      ref={sortable ? sort.setNodeRef : undefined}
      style={style}
      className={cn(
        'flex flex-col rounded-lg border bg-white shadow-sm transition',
        task.isDone ? 'opacity-70 border-gray-200' : 'border-gray-300 hover:border-gray-400',
      )}
    >
      <div className="flex items-center gap-2 p-2">
        {sortable && (
          <button
            type="button"
            {...sort.attributes}
            {...sort.listeners}
            aria-label="Drag to reorder"
            className="touch-none flex h-11 w-9 shrink-0 cursor-grab items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700 active:cursor-grabbing"
          >
            <GripVertical className="h-5 w-5" />
          </button>
        )}

        <PriorityPill
          value={task.priority}
          disabled={task.isDone}
          onChange={(p) => patchMut.mutate({ priority: p })}
        />

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="min-w-0 flex-1 cursor-pointer text-start"
        >
          {editing ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={submitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitTitle();
                if (e.key === 'Escape') {
                  setTitleDraft(task.title);
                  setEditing(false);
                }
              }}
              className="w-full bg-transparent text-sm text-gray-900 focus:outline-none border-b border-gray-300"
              maxLength={500}
            />
          ) : (
            <span
              className={cn(
                'block truncate text-sm',
                task.isDone ? 'line-through text-gray-400' : 'text-gray-900',
              )}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditing(true);
              }}
            >
              {task.title}
            </span>
          )}
          {task._count.notes > 0 && (
            <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-gray-500">
              <MessageSquare className="h-3 w-3" /> {task._count.notes}
            </span>
          )}
        </button>

        <input
          type="checkbox"
          checked={task.isDone}
          onChange={(e) => patchMut.mutate({ isDone: e.target.checked })}
          aria-label={task.isDone ? 'Mark as not done' : 'Mark as done'}
          className="h-6 w-6 shrink-0 cursor-pointer rounded border-gray-300 text-[#DC2626] focus:ring-red-300"
        />

        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="flex h-11 w-9 shrink-0 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-gray-200 p-2">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                if (confirm('Delete this task and all its notes?')) deleteMut.mutate();
              }}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> حذف المهمة
            </button>
          </div>
          <TaskNotes task={task} ownerUserId={ownerUserId} />
        </div>
      )}
    </li>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git add apps/web/src/app/(dashboard)/todo/_components/task-row.tsx
git commit -m "feat(todo): add TaskRow with optimistic updates"
```

### Task 6.5: Create the `add-task-input` component

**Files:**
- Create: `apps/web/src/app/(dashboard)/todo/_components/add-task-input.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import * as React from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Plus, Loader2 } from 'lucide-react';
import type { TodoTask } from '../_types';

export function AddTaskInput({ ownerUserId }: { ownerUserId: string }) {
  const qc = useQueryClient();
  const [value, setValue] = React.useState('');

  const mut = useMutation({
    mutationFn: (title: string) =>
      api.post<TodoTask>(`/api/v1/todo/users/${ownerUserId}/tasks`, { title }),
    onSuccess: () => {
      setValue('');
      qc.invalidateQueries({ queryKey: ['todo-tasks', ownerUserId] });
    },
  });

  const submit = () => {
    const v = value.trim();
    if (v) mut.mutate(v);
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white p-2 shadow-sm focus-within:border-[#DC2626] focus-within:ring-1 focus-within:ring-red-200">
      <Plus className="h-5 w-5 shrink-0 text-gray-400" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="أضف مهمة جديدة..."
        className="min-h-[36px] flex-1 bg-transparent text-sm text-gray-900 focus:outline-none"
        maxLength={500}
        dir="auto"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!value.trim() || mut.isPending}
        className="inline-flex h-9 items-center rounded-md bg-[#DC2626] px-3 text-sm font-medium text-white shadow disabled:opacity-50"
      >
        {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'أضف'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git add apps/web/src/app/(dashboard)/todo/_components/add-task-input.tsx
git commit -m "feat(todo): add AddTaskInput component"
```

### Task 6.6: Create the done section component

**Files:**
- Create: `apps/web/src/app/(dashboard)/todo/_components/done-section.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import * as React from 'react';
import { ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { TaskRow } from './task-row';
import type { TodoTask } from '../_types';

export function DoneSection({
  tasks,
  ownerUserId,
}: {
  tasks: TodoTask[];
  ownerUserId: string;
}) {
  const [open, setOpen] = React.useState(false);
  if (tasks.length === 0) return null;

  return (
    <div className="mt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-md py-2 text-sm font-semibold text-gray-600 hover:text-gray-900"
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        تم ({tasks.length})
      </button>
      {open && (
        <ul className="mt-2 space-y-2">
          {tasks.map((t) => (
            <TaskRow key={t.id} task={t} ownerUserId={ownerUserId} sortable={false} />
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git add apps/web/src/app/(dashboard)/todo/_components/done-section.tsx
git commit -m "feat(todo): add DoneSection collapsible list"
```

### Task 6.7: Create the user task page `/todo/[userId]`

**Files:**
- Create: `apps/web/src/app/(dashboard)/todo/[userId]/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { ArrowRight, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useSocketEvent } from '@/hooks/use-socket';
import { AddTaskInput } from '../_components/add-task-input';
import { TaskRow } from '../_components/task-row';
import { DoneSection } from '../_components/done-section';
import type { TodoTask, TodoTasksResponse } from '../_types';

export default function TodoTasksPage() {
  const { userId } = useParams<{ userId: string }>();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['todo-tasks', userId],
    queryFn: () => api.get<TodoTasksResponse>(`/api/v1/todo/users/${userId}/tasks`),
  });

  const invalidate = React.useCallback(() => {
    qc.invalidateQueries({ queryKey: ['todo-tasks', userId] });
  }, [qc, userId]);

  useSocketEvent<{ ownerUserId: string }>('todo.task.created', (d) => d.ownerUserId === userId && invalidate(), [userId, invalidate]);
  useSocketEvent<{ ownerUserId: string }>('todo.task.updated', (d) => d.ownerUserId === userId && invalidate(), [userId, invalidate]);
  useSocketEvent<{ ownerUserId: string }>('todo.task.deleted', (d) => d.ownerUserId === userId && invalidate(), [userId, invalidate]);
  useSocketEvent<{ ownerUserId: string }>('todo.tasks.reordered', (d) => d.ownerUserId === userId && invalidate(), [userId, invalidate]);
  useSocketEvent<{ ownerUserId: string }>('todo.note.created', (d) => d.ownerUserId === userId && invalidate(), [userId, invalidate]);
  useSocketEvent<{ ownerUserId: string }>('todo.note.deleted', (d) => d.ownerUserId === userId && invalidate(), [userId, invalidate]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const reorderMut = useMutation({
    mutationFn: (orderedIds: string[]) =>
      api.post(`/api/v1/todo/users/${userId}/tasks/reorder`, { orderedIds }),
    onMutate: async (orderedIds) => {
      await qc.cancelQueries({ queryKey: ['todo-tasks', userId] });
      const prev = qc.getQueryData<TodoTasksResponse>(['todo-tasks', userId]);
      if (prev) {
        const indexMap = new Map(orderedIds.map((id, idx) => [id, idx]));
        const next = {
          ...prev,
          active: [...prev.active].sort(
            (a, b) => (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0),
          ),
        };
        qc.setQueryData(['todo-tasks', userId], next);
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(['todo-tasks', userId], ctx.prev);
    },
    onSettled: invalidate,
  });

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id || !data) return;
    const oldIdx = data.active.findIndex((t) => t.id === e.active.id);
    const newIdx = data.active.findIndex((t) => t.id === e.over!.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(data.active, oldIdx, newIdx).map((t) => t.id);
    reorderMut.mutate(reordered);
  };

  if (isLoading || !data) {
    return (
      <div className="flex h-full items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#DC2626]" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/todo"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          aria-label="Back"
        >
          <ArrowRight className="h-5 w-5 rtl:rotate-180" />
        </Link>
        <h1 className="text-xl font-bold text-gray-900">مهام {data.owner.name}</h1>
      </div>

      <AddTaskInput ownerUserId={userId} />

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-gray-500">
          📌 المهام النشطة ({data.active.length})
        </p>
        {data.active.length === 0 ? (
          <div className="rounded-lg border-2 border-dashed border-gray-300 py-8 text-center text-xs text-gray-400">
            لا توجد مهام نشطة. ابدأ بإضافة مهمة من فوق ↑
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={data.active.map((t) => t.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-2">
                {data.active.map((t) => (
                  <TaskRow key={t.id} task={t} ownerUserId={userId} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
      </div>

      <DoneSection tasks={data.done} ownerUserId={userId} />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git add apps/web/src/app/(dashboard)/todo/[userId]/page.tsx
git commit -m "feat(todo): add /todo/[userId] tasks page with DnD + realtime"
```

---

## Phase 7 — Manual end-to-end verification

### Task 7.1: Run the full app and walk the spec's Verification Plan

**Files:** None.

- [ ] **Step 1: Start the full dev stack**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms && npm run dev
```
Wait for both services. Open `http://localhost:3000` and log in as `admin@hqq.com / admin123`.

- [ ] **Step 2: Desktop checks**

In a desktop browser viewport (≥1024 px wide):
1. Sidebar shows a "To-Do" entry between Projects and Reports.
2. Click it → user grid appears at `/todo`. Your own card has a red ring.
3. Click your card → `/todo/<your id>`. Page renders with an empty active list and no done section.
4. Type "Task A" + Enter → row appears with `MEDIUM` priority.
5. Click the priority pill → switch to `HIGH` → pill turns red.
6. Add "Task B" and "Task C". Drag Task C to top using the grip handle → order persists after page refresh.
7. Click the expand caret on Task A → notes panel appears. Type "started" + Cmd/Ctrl + Enter → note appears with the timestamp "الآن" and your name.
8. Check Task A's checkbox → it slides into the "تم (1)" section at the bottom with strikethrough.
9. Expand "تم", uncheck Task A → it returns to the bottom of the active list (without strikethrough).
10. Expand a task and click "حذف المهمة" → confirm → task disappears, no console errors.

- [ ] **Step 3: Realtime check**

Open a second browser (or incognito) and log in as a different user (or the same one in another tab) at `/todo/<same id>`:
1. Add a task in window A → window B's list updates within ~1 s without a manual refresh.
2. Drag-reorder in A → B's order updates.
3. Mark done in A → moves to "تم" in B.

- [ ] **Step 4: Mobile viewport check**

Open Chrome devtools, switch to a phone preset (e.g. iPhone 12). Reload `/todo`.
1. User grid is 2 columns.
2. Open a user → header sticky, "Add task" input is full-width.
3. Touch + hold the grip for ~200 ms then drag → reorders.
4. Touch without hold scrolls the page (no drag).
5. Tap a priority pill → bottom-sheet slides up from the bottom with 3 options.
6. All buttons are easily tappable (≥44 px).

- [ ] **Step 5: Edge cases**

1. Try to add an empty task → button is disabled; pressing Enter on empty input does nothing.
2. Try a 600-char title — input enforces `maxLength=500` so typing stops.
3. Add 7 notes to a single task; expand → see latest 5 with "عرض الكل (7)" button. Click → loads remaining.

- [ ] **Step 6: Stop the dev stack**

Ctrl+C in the terminal.

- [ ] **Step 7: No code changes; no commit.**

---

## Phase 8 — Deploy to production

### Task 8.1: Deploy via the user (the harness blocks direct prod writes)

**Files:** None (operational).

- [ ] **Step 1: Push code to a remote / send the user the diff to deploy**

Because the harness blocks scp / ssh-writes against production, the operator (the user) must run the deployment commands themselves from PowerShell. Provide them with:

```powershell
# Build the patched assets locally first to confirm there are no build errors
cd C:\Users\Lenovo\Projects\hqq-oms
npm -w apps/api run build
npm -w apps/web run build
```
Expected: both builds succeed with no errors.

- [ ] **Step 2: Have the user (or operator) sync source + migration + assets to the prod server**

The user runs (in their own PowerShell):

```powershell
# Copy modified source files
scp -i ~/.ssh/hqq_oms_ed25519 -r `
  apps/api/src/todo `
  apps/api/src/app.module.ts `
  apps/web/src/components/layout/sidebar.tsx `
  apps/web/src/app/(dashboard)/todo `
  root@46.224.197.38:/opt/hqq-oms/<corresponding paths>

# Copy schema + migration
scp -i ~/.ssh/hqq_oms_ed25519 -r `
  prisma/schema.prisma prisma/migrations `
  root@46.224.197.38:/opt/hqq-oms/prisma/

# Install new web dep, run migration, rebuild, restart
ssh -i ~/.ssh/hqq_oms_ed25519 root@46.224.197.38 "cd /opt/hqq-oms && npm -w apps/web install --no-audit && npx prisma migrate deploy --schema prisma/schema.prisma && npm -w apps/api run build && npm -w apps/web run build && pm2 restart hqq-api hqq-web && echo DEPLOY_OK"
```
Expected last line: `DEPLOY_OK`.

- [ ] **Step 3: Verify on production**

User opens `https://hqq-tech.com/todo` from a phone:
1. The sidebar shows the To-Do entry.
2. The user grid renders.
3. Tapping a user opens their tasks page.
4. Adding and completing a task works.

- [ ] **Step 4: Final commit / tag**

```bash
cd C:/Users/Lenovo/Projects/hqq-oms
git tag v-todo-section-2026-05-12
git log --oneline -20
```

---

## Reference: Files touched

```
prisma/schema.prisma                                                          (modified)
prisma/migrations/<timestamp>_add_todo_tables/                                (created)
apps/api/src/todo/todo.module.ts                                              (created)
apps/api/src/todo/todo.service.ts                                             (created)
apps/api/src/todo/todo.controller.ts                                          (created)
apps/api/src/app.module.ts                                                    (modified)
apps/web/package.json                                                         (modified — @dnd-kit)
apps/web/src/components/layout/sidebar.tsx                                    (modified)
apps/web/src/app/(dashboard)/todo/_types.ts                                   (created)
apps/web/src/app/(dashboard)/todo/page.tsx                                    (created)
apps/web/src/app/(dashboard)/todo/[userId]/page.tsx                           (created)
apps/web/src/app/(dashboard)/todo/_components/priority-pill.tsx               (created)
apps/web/src/app/(dashboard)/todo/_components/format-time.ts                  (created)
apps/web/src/app/(dashboard)/todo/_components/task-notes.tsx                  (created)
apps/web/src/app/(dashboard)/todo/_components/task-row.tsx                    (created)
apps/web/src/app/(dashboard)/todo/_components/add-task-input.tsx              (created)
apps/web/src/app/(dashboard)/todo/_components/done-section.tsx                (created)
```
