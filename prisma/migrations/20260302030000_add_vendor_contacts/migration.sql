-- CreateTable
CREATE TABLE "vendor_contacts" (
    "id" TEXT NOT NULL,
    "factory_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "wechat_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vendor_contacts_pkey" PRIMARY KEY ("id")
);

-- Migrate existing wechat_id data to contacts table
INSERT INTO "vendor_contacts" ("id", "factory_id", "name", "role", "wechat_id")
SELECT gen_random_uuid()::text, id, name, 'Main Contact', wechat_id
FROM "factories"
WHERE wechat_id IS NOT NULL AND wechat_id != '';

-- Drop old column
ALTER TABLE "factories" DROP COLUMN IF EXISTS "wechat_id";

-- AddForeignKey
ALTER TABLE "vendor_contacts" ADD CONSTRAINT "vendor_contacts_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "factories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
