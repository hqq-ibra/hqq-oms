-- CreateTable: todo_people
CREATE TABLE "todo_people" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "todo_people_pkey" PRIMARY KEY ("id")
);

-- Backfill: copy every existing user that has tasks (or any active user) into todo_people,
-- preserving their id so existing todo_tasks rows still resolve.
INSERT INTO "todo_people" ("id", "name", "email", "created_at", "updated_at")
SELECT DISTINCT u."id", u."name", u."email", u."created_at", NOW()
FROM "users" u
WHERE u."id" IN (SELECT DISTINCT "owner_user_id" FROM "todo_tasks")
   OR u."is_active" = true
ON CONFLICT ("id") DO NOTHING;

-- Drop old FK + index on todo_tasks
ALTER TABLE "todo_tasks" DROP CONSTRAINT "todo_tasks_owner_user_id_fkey";
DROP INDEX "todo_tasks_owner_user_id_is_done_order_index_idx";

-- Rename column
ALTER TABLE "todo_tasks" RENAME COLUMN "owner_user_id" TO "owner_person_id";

-- New FK -> todo_people
ALTER TABLE "todo_tasks" ADD CONSTRAINT "todo_tasks_owner_person_id_fkey"
  FOREIGN KEY ("owner_person_id") REFERENCES "todo_people"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- New index
CREATE INDEX "todo_tasks_owner_person_id_is_done_order_index_idx"
  ON "todo_tasks"("owner_person_id", "is_done", "order_index");
