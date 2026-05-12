-- CreateTable
CREATE TABLE "todo_tasks" (
    "id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "order_index" INTEGER NOT NULL,
    "is_done" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "todo_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "todo_task_notes" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "todo_task_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "todo_tasks_owner_user_id_is_done_order_index_idx" ON "todo_tasks"("owner_user_id", "is_done", "order_index");

-- CreateIndex
CREATE INDEX "todo_task_notes_task_id_created_at_idx" ON "todo_task_notes"("task_id", "created_at");

-- AddForeignKey
ALTER TABLE "todo_tasks" ADD CONSTRAINT "todo_tasks_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_task_notes" ADD CONSTRAINT "todo_task_notes_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "todo_tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "todo_task_notes" ADD CONSTRAINT "todo_task_notes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
