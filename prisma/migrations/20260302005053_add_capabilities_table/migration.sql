-- CreateTable
CREATE TABLE "capabilities" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "capabilities_name_key" ON "capabilities"("name");

-- Seed default capabilities from existing data
INSERT INTO "capabilities" ("id", "name") VALUES
    ('cap_silicone', 'Silicone'),
    ('cap_knife', 'Knife'),
    ('cap_both', 'Both');

-- Add nullable capability_id column first
ALTER TABLE "factories" ADD COLUMN "capability_id" TEXT;

-- Populate capability_id from existing capability string
UPDATE "factories" SET "capability_id" = 'cap_silicone' WHERE "capability" = 'SILICONE';
UPDATE "factories" SET "capability_id" = 'cap_knife' WHERE "capability" = 'KNIFE';
UPDATE "factories" SET "capability_id" = 'cap_both' WHERE "capability" = 'BOTH';
UPDATE "factories" SET "capability_id" = 'cap_both' WHERE "capability_id" IS NULL;

-- Make capability_id required
ALTER TABLE "factories" ALTER COLUMN "capability_id" SET NOT NULL;

-- Drop old columns
ALTER TABLE "factories" DROP COLUMN "capability";
ALTER TABLE "factories" DROP COLUMN "wechat_qr_url";

-- AddForeignKey
ALTER TABLE "factories" ADD CONSTRAINT "factories_capability_id_fkey" FOREIGN KEY ("capability_id") REFERENCES "capabilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
