# To-Do Section Design

**Date:** 2026-04-27
**Status:** Approved — ready for implementation plan
**Author:** Brainstormed with user

---

## Context & Goal

User reports that his manager keeps saying "you don't follow priorities". The manager mostly works from a phone, not a laptop. We need a lightweight task system inside the existing OMS where:

- Anyone can create a task assigned to any user.
- The manager can reorder tasks (by drag-and-drop) and tag them with High / Medium / Low so the worker knows what to do first.
- The worker can post timestamped progress updates under each task so the manager sees activity without asking.

The feature must be simple to use, mobile-first, and integrate with the existing NestJS / Next.js / Prisma stack and the existing WebSocket realtime layer.

## Decisions (from brainstorming)

| Topic | Decision |
|---|---|
| Permissions | Open — every authenticated user can create, edit, reorder, delete, complete any task and add notes to any task. No role gating in phase 1. |
| Priority mechanism | Two complementary signals: (1) drag-and-drop order in the list, (2) a `HIGH` / `MEDIUM` / `LOW` label with color (red / amber / green). |
| Task fields | Title (required), priority label, done flag. No due dates, no descriptions in phase 1. |
| Completion behavior | When a task is checked done, it moves to a "Done" section at the bottom, rendered with strikethrough and faded styling. Unchecking restores it to the bottom of the active list. |
| Notes | Multiple timestamped notes per task, each shows author name. Comment-thread style. |
| Sidebar | New section after "Projects", labeled "To-Do". |
| Mobile | First-class — drag works via touch, large tap targets, swipe-to-delete, bottom-sheet for priority picker. |
| Realtime | Standard WebSocket broadcasts via the existing `WsGateway`. |

---

## Pages & Flow

### Sidebar entry
Insert a new section in `apps/web/src/components/layout/sidebar.tsx` between the existing "Projects" section and the "Reports / Users" section:

```ts
{ items: [{ href: '/todo', label: 'To-Do', icon: CheckSquare }] }
```

### Page 1 — `/todo` (User picker)
Grid of cards, one per active user in the system. Each card shows:
- Avatar (first-letter circle, same style as sidebar avatar)
- User name + email
- Count of active (not-done) tasks
- The current viewer's own card has a subtle border accent so they spot themselves quickly.

Grid: 4 columns ≥1024px, 3 columns 640–1024px, 2 columns <640px.

Clicking a card navigates to `/todo/[userId]`.

### Page 2 — `/todo/[userId]` (Tasks for one user)

Header row:
- Back arrow → `/todo`
- User name as title
- (No edit/delete controls for the user itself — out of scope.)

Body:
1. **Quick-add input** at the top. Enter creates a new active task at the bottom of the active list with priority `MEDIUM` by default.
2. **Active tasks** — sortable list, default ordered by `orderIndex` ascending.
   - Each row: drag handle (⋮⋮), priority pill (colored, opens a bottom-sheet on tap), title, done checkbox, expand caret.
   - Expanding reveals: notes timeline (latest 5 by default, "show all" button if more), "add note" textarea, and an inline delete button (with confirm dialog).
3. **Done section** — collapsed by default with a count badge. Expanding shows completed tasks ordered by `completedAt DESC`. Unchecking moves the task back to the active list.

### Mobile-specific behaviors
- Sidebar collapses to hamburger (existing behavior).
- Header is sticky.
- Drag handle uses `@dnd-kit` with a `TouchSensor` configured with `delay: 200ms, tolerance: 5px` so scrolling never triggers drag.
- Priority pill opens a bottom sheet on mobile, dropdown on desktop.
- Swipe-left on a task row exposes a "Delete" action with confirm.
- All interactive targets are ≥44×44 px.

---

## Data Model

Two new Prisma models in `prisma/schema.prisma`:

```prisma
model TodoTask {
  id            String   @id @default(cuid())
  ownerUserId   String   @map("owner_user_id")
  title         String
  priority      String   @default("MEDIUM") // HIGH | MEDIUM | LOW
  orderIndex    Int      @map("order_index")
  isDone        Boolean  @default(false) @map("is_done")
  completedAt   DateTime? @map("completed_at")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

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

  task    TodoTask @relation(fields: [taskId], references: [id], onDelete: Cascade)
  createdBy User?   @relation("TodoNoteAuthor", fields: [createdByUserId], references: [id], onDelete: SetNull)

  @@index([taskId, createdAt])
  @@map("todo_task_notes")
}
```

Relations to add on `User`:
```prisma
todoTasks     TodoTask[]     @relation("TodoOwner")
todoNotes     TodoTaskNote[] @relation("TodoNoteAuthor")
```

Validation:
- `title`: 1–500 chars after trim.
- `priority`: must be one of the three string literals.
- `content` (note): 1–2000 chars after trim.

---

## API

New NestJS module at `apps/api/src/todo/`:
- `todo.module.ts`
- `todo.service.ts`
- `todo.controller.ts`

All routes prefixed by the global `/api/v1`. All require JWT auth (`JwtAuthGuard`) but no `PermissionsGuard` — feature is open to any logged-in user (decision above).

| Method | Path | Purpose |
|---|---|---|
| GET | `/todo/users` | List all active users with their active-task counts (for page 1) |
| GET | `/todo/users/:userId/tasks` | Tasks for one user. Returns both active and done lists with notes (last 5 each, count of remaining). |
| POST | `/todo/users/:userId/tasks` | Create a task. Body: `{ title, priority? }`. Appends to bottom of active list. |
| PATCH | `/todo/tasks/:taskId` | Update title / priority / isDone. Setting `isDone=true` sets `completedAt=now()`; setting `false` clears it and re-appends to active list. |
| DELETE | `/todo/tasks/:taskId` | Delete a task (cascades to notes). |
| POST | `/todo/users/:userId/tasks/reorder` | Body: `{ orderedIds: string[] }`. Validates all IDs belong to the user and are active. Applies new `orderIndex` in a single transaction. |
| GET | `/todo/tasks/:taskId/notes` | Full list of notes (for "show all"). |
| POST | `/todo/tasks/:taskId/notes` | Add a note. Body: `{ content }`. |
| DELETE | `/todo/notes/:noteId` | Delete a note. |

Service follows the same pattern as `quote-comparison.service.ts`: PrismaService + WsGateway injected, helper for activity logging is not needed since notes already serve that purpose.

WebSocket events emitted on the existing `WsGateway`:
- `todo.task.created` → `{ ownerUserId, taskId }`
- `todo.task.updated` → `{ ownerUserId, taskId }`
- `todo.task.deleted` → `{ ownerUserId, taskId }`
- `todo.tasks.reordered` → `{ ownerUserId }`
- `todo.note.created` → `{ ownerUserId, taskId, noteId }`
- `todo.note.deleted` → `{ ownerUserId, taskId, noteId }`

Frontend subscribes per-user-page using existing `useSocketEvent` hook (see `stage-workspace.tsx:261`) and invalidates the React Query cache.

---

## Frontend Structure

New files under `apps/web/src/app/(dashboard)/todo/`:
- `page.tsx` — user picker (page 1).
- `[userId]/page.tsx` — task page (page 2).
- `_components/task-row.tsx` — single task row (drag handle, priority pill, checkbox, expand).
- `_components/task-notes.tsx` — notes timeline + add-note input.
- `_components/priority-pill.tsx` — colored badge that opens a bottom-sheet / dropdown.
- `_components/add-task-input.tsx` — top input.
- `_components/done-section.tsx` — collapsible done list.

State management uses TanStack Query (already in the project). Drag-and-drop uses `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`.

Time formatting uses `date-fns` with Arabic locale for relative strings ("الآن", "قبل 5 دقائق", "اليوم 14:30", "أمس", weekday, then full date).

Colors (matching brand):
- HIGH `#DC2626`
- MEDIUM `#F59E0B`
- LOW `#22963A`

---

## Behavior Details

### Drag-and-drop reorder
- Client maintains the local order while dragging; on drop, sends `POST /reorder` with the new id array.
- Server runs `prisma.$transaction` that updates `orderIndex` for each task in the order received.
- On error, client reverts to the previous order and toasts an error.
- `delay: 200ms, tolerance: 5px` for touch — touching and immediately scrolling does NOT start a drag.

### Done / Undo
- Check the checkbox: optimistic update → `PATCH { isDone: true }` → on success, server sets `completedAt = now()` and emits `todo.task.updated`. The task appears in the Done section ordered by `completedAt DESC`.
- Uncheck in Done section: same flow with `isDone: false`. Server clears `completedAt` and assigns `orderIndex = max(orderIndex of active) + 1` so it lands at the bottom of the active list.

### Notes
- Latest 5 notes load with the task. "Show all (N)" button lazy-loads full list via `GET /tasks/:taskId/notes`.
- Add note: textarea + send button. Cmd/Ctrl + Enter submits.
- Author name shown as `createdBy.name`; if `createdByUserId IS NULL` (user deleted), render "(محذوف)".

### Empty / error states
- Page 1: "لا يوجد مستخدمين بعد" when there are no users (impossible in practice since you're logged in).
- Page 2 active list: "لا توجد مهام نشطة. ابدأ بإضافة مهمة من فوق ↑"
- Page 2 done section header is hidden entirely when there are zero done tasks.
- API errors: toast with the server message, list reverts to last good state.

### Concurrent edits
- WebSocket broadcasts on every change. Each connected client invalidates its query and refetches → eventual consistency.
- Reorder is the only multi-row operation; it's atomic on the server.

---

## Existing Code to Reuse

- `PrismaService` and `WsGateway` — both injected throughout `apps/api/src/projects/*.service.ts`. Same pattern here.
- `api` client at `apps/web/src/lib/api.ts` — already handles auth headers and refresh.
- `useSocketEvent` hook for realtime invalidation.
- `useToast` for success/error toasts.
- Tailwind tokens already configured for the brand palette.

---

## Out of Scope (deferred)

- Due dates / overdue highlighting.
- Task descriptions / file attachments.
- Email notifications.
- Push notifications.
- Cross-user "all tasks" dashboard for managers.
- Filtering / searching / tagging.
- Audit log beyond the user-authored notes.
- Permissions gating (any logged-in user can do anything in phase 1).

---

## Open Questions

None for phase 1 — design is fully specified above. Any item left open is explicitly listed in "Out of Scope".

---

## Verification Plan

Once implemented:
1. Run `npm run db:migrate` and `npm run db:generate` locally.
2. Boot the api + web with `npm run dev`. Open `/todo`.
3. Functional checks (desktop and mobile viewport):
   - Create task for self → appears at bottom of active list.
   - Change priority via the pill → color updates.
   - Drag to reorder → order persists after refresh.
   - Add note → appears in timeline with timestamp + author.
   - Check task done → moves to Done section with strikethrough.
   - Uncheck → returns to bottom of active list.
   - Delete task → confirm dialog, then disappears, notes gone.
   - Open a second browser as a different user → live updates appear without refresh.
   - On a phone-sized viewport: drag with finger works after the 200ms hold; tap-without-hold scrolls the page normally.
   - Swipe-left on a task reveals delete.
4. Edge cases: 0-length title (rejected), 600-char title (rejected), 100 notes (paginated).
5. Sidebar on mobile: hamburger opens, "To-Do" link is visible and routes correctly.
