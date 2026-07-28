-- DropIndex
DROP INDEX "order_items_order_id_product_id_key";

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "description" TEXT,
ADD COLUMN     "drawing_number" TEXT,
ADD COLUMN     "order_index" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "promoted_product_id" TEXT,
ADD COLUMN     "specs" JSONB,
ADD COLUMN     "unit_label" TEXT NOT NULL DEFAULT 'عدد',
ADD COLUMN     "unit_price" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "confirmed_at" TIMESTAMP(3),
ADD COLUMN     "quote_number" TEXT,
ALTER COLUMN "order_number" DROP NOT NULL,
ALTER COLUMN "factory_order_number" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'QUOTATION';

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "requires_line_specs" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "order_quotations" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "quote_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "pay_method" TEXT NOT NULL DEFAULT 'نقداً / تحويل بنكي',
    "client_block" TEXT NOT NULL DEFAULT '',
    "contact" TEXT,
    "attn" TEXT,
    "notes" TEXT,
    "discount_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "vat_enabled" BOOLEAN NOT NULL DEFAULT true,
    "vat_percent" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "language" TEXT NOT NULL DEFAULT 'ar',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_quotations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_quotations_order_id_key" ON "order_quotations"("order_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_quote_number_key" ON "orders"("quote_number");

-- AddForeignKey
ALTER TABLE "order_quotations" ADD CONSTRAINT "order_quotations_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing orders sitting at NEW are confirmed orders under the new vocabulary.
UPDATE "orders" SET "status" = 'CONFIRMED' WHERE "status" = 'NEW';
UPDATE "order_status_history" SET "old_status" = 'CONFIRMED' WHERE "old_status" = 'NEW';
UPDATE "order_status_history" SET "new_status" = 'CONFIRMED' WHERE "new_status" = 'NEW';

-- The one catalogue entry standing in for a mold that does not exist yet.
-- Its specs live on each order line, not here.
INSERT INTO "products" (
  "id", "sku", "name_en", "name_ar", "category_id", "subcategory_id",
  "inventory", "is_active", "requires_line_specs", "created_at", "updated_at"
)
SELECT
  'prod_new_mold_thf',
  'SIL-THF-NEWMOLD',
  'New Mold — Silicone Thermoforming',
  'قالب جديد — سيليكون ثيرموفورمنج',
  c."id",
  s."id",
  0, true, true, NOW(), NOW()
FROM "product_categories" c
LEFT JOIN "product_subcategories" s
  ON s."category_id" = c."id" AND s."sku_code" = 'THF'
WHERE c."sku_prefix" = 'SIL'
LIMIT 1
ON CONFLICT ("sku") DO NOTHING;

