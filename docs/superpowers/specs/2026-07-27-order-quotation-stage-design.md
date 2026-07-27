# Order Quotation Stage + Printable Quotation Form

**Date:** 2026-07-27
**Status:** Approved design, ready for implementation planning

## Problem

Orders today begin life at `NEW`, which means "confirmed and in progress". There is
no way to record a customer who *asked* for a price but has not committed. Those
requests live in WhatsApp threads and memory, so nobody chases them.

Separately, quotations are produced outside the system entirely — by hand, in
`quotation_form_10.html`, a standalone browser file. Prices typed there are never
seen by the OMS, so `SELLING_PRICE` order costs (the revenue source for Reports
and Analytics) get entered a second time, or not at all.

## Goals

1. A `QUOTATION` stage before `CONFIRMED`, so unconfirmed requests are tracked
   and chaseable.
2. A printable quotation inside the app, visually identical to
   `quotation_form_10.html`, filled from the order's products and prices.
3. Confirmed quote totals feed `SELLING_PRICE` automatically — price entered once.

## Non-goals

- Multi-currency quotations. SAR only, matching the paper form.
- Partial confirmation (customer accepts 3 of 5 lines). Out of scope.
- Emailing or WhatsApping the quotation from the app. Print / Save-PDF only.
- Wiring up `packages/shared`. See "Known constraints".

---

## 1. Workflow

Both flows gain one stage at the front, and `NEW` is renamed `CONFIRMED`:

```
NEW_MOLD:  QUOTATION → CONFIRMED → SAMPLE_RECEIVED → CAD_DRAWING_READY →
           SENT_TO_FACTORY → MOLD_READY → SILICONE_CASTING →
           SHIPPED_FROM_FACTORY → RECEIVED_LOCALLY → SHIPPED_TO_CUSTOMER → COMPLETED

REPEAT:    QUOTATION → CONFIRMED → SENT_TO_FACTORY → SILICONE_CASTING →
           SHIPPED_FROM_FACTORY → RECEIVED_LOCALLY → SHIPPED_TO_CUSTOMER → COMPLETED
```

`NEW` and `CONFIRMED` mean the same thing, so this is one new stage, not two.
Existing orders sitting at `NEW` become `CONFIRMED` in the migration and are
otherwise untouched.

Labels: `QUOTATION` → "Quotation (Not Confirmed)", `CONFIRMED` → "Confirmed".

### Transition rules

The existing rule — strictly linear, exactly one step forward
(`order-workflow.ts:41`, `newIdx === currentIdx + 1`) — is unchanged for the
main flow.

One exception is added: **`REJECTED`**, a terminal status reachable *only* from
`QUOTATION`. Without it, quotes the customer declines stay in the chase list
forever. `REJECTED` is off-flow: it is not in either flow array, nothing
transitions out of it, and it is excluded from the Quotations tab.

`isValidTransition` becomes:

```
valid if  newIdx === currentIdx + 1        (existing rule)
      or  (from === 'QUOTATION' && to === 'REJECTED')
```

---

## 2. Data model

### `Order`

| Field | Change | Reason |
|---|---|---|
| `status` | default `'NEW'` → `'QUOTATION'` | new orders start unconfirmed |
| `quoteNumber` | **new** `String? @unique @map("quote_number")` | `QT-2026-0001`, assigned at creation; null for pre-migration orders |
| `orderNumber` | `String @unique` → `String? @unique` | assigned on confirm |
| `factoryOrderNumber` | `String @unique` → `String? @unique` | assigned on confirm |
| `confirmedAt` | **new** `DateTime? @map("confirmed_at")` | drives "waiting N days" and Analytics |
| `quotation` | **new** relation `OrderQuotation?` | 1:1 |

Nullable order numbers mean quotes that never confirm do not burn numbers in the
`ORD-` and `FO-` sequences.

### `OrderItem`

| Field | Change | Reason |
|---|---|---|
| `unitPrice` | **new** `Decimal? @db.Decimal(14, 2) @map("unit_price")` | per-line price, typed in the wizard |
| `unitLabel` | **new** `String @default("عدد") @map("unit_label")` | the form's "الوحدة" column |
| `description` | **new** `String?` | overrides the product name in the "البيان" column when needed |
| `orderIndex` | **new** `Int @default(0) @map("order_index")` | stable line order on the printed form |

`Decimal(14, 2)` matches `QuoteLine.unitPrice` and `ClientApprovalPricing.amount`
already in the schema.

### `OrderQuotation` (new, 1:1 with `Order`)

```prisma
model OrderQuotation {
  id             String    @id @default(cuid())
  orderId        String    @unique @map("order_id")
  quoteDate      DateTime  @default(now()) @map("quote_date")
  validUntil     DateTime? @map("valid_until")
  payMethod      String    @default("نقداً / تحويل بنكي") @map("pay_method")
  clientBlock    String    @default("") @map("client_block")
  contact        String?
  attn           String?
  notes          String?
  discountAmount Decimal   @default(0) @db.Decimal(14, 2) @map("discount_amount")
  vatEnabled     Boolean   @default(true) @map("vat_enabled")
  vatPercent     Decimal   @default(15) @db.Decimal(5, 2) @map("vat_percent")
  language       String    @default("ar")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@map("order_quotations")
}
```

A separate table rather than eleven more columns on `Order`, following the
existing `ProjectClientQuote` precedent.

**Defaults on creation**, all editable afterwards:
- `validUntil` = `quoteDate` + 14 days (matches the HTML form's init)
- `clientBlock` = customer `name`, then `city` on a second line
- `contact` = first `CustomerContact.phone`, `attn` = that contact's `name`

---

## 3. Totals

The paper form's `calcAll()` is the authority on arithmetic:

```
lineTotal = qty × unitPrice
subtotal  = Σ lineTotal
discount  = clamp(discountAmount, 0, subtotal)
net       = subtotal − discount
vat       = vatEnabled ? net × vatPercent / 100 : 0
grand     = net + vat
```

Discount is entered as a SAR **amount**; the percentage is derived for display
and hidden in print (`.disc-info-row`). Discount rows hide entirely when the
discount is zero.

This becomes a pure function. Because `packages/shared` is unwired **and
`apps/web` has no test runner at all** (no jest or vitest in its
devDependencies, no `test` script), it cannot be a tested module on both sides.
So the server is made authoritative rather than pretending the copies are equal:

- `apps/api/src/orders/quotation-totals.ts` — **authoritative and tested**
  (jest, `apps/api/jest.config.js`). Computes the totals returned by the
  quotation endpoints and the `SELLING_PRICE` cost written on confirm.
- `apps/web/src/lib/quotation-totals.ts` — a literal copy, **display only**,
  used for optimistic updates while typing.

Drift is contained by reconciliation, not by duplicated tests: `GET` and `PATCH`
both return server-computed totals, and the page replaces its optimistic numbers
with the server's on every response. A divergent client copy would self-correct
within one autosave rather than print a wrong number.

Adding vitest to `apps/web` so the copy can be tested directly is a worthwhile
follow-up, but it is not in this plan's scope.

---

## 4. API

### `POST /api/v1/orders` — create (modified)

Now creates a quotation:

- assigns `quoteNumber` (`QT-<year>-NNNN`, same sequence pattern as
  `getNextOrderNumber`)
- `status: 'QUOTATION'`
- creates `OrderQuotation` with the defaults above
- saves items with `unitPrice`, `unitLabel`, `description`, `orderIndex`
- upserts the `customerProduct` links — **kept at creation, unchanged**
- **no** `orderNumber` / `factoryOrderNumber`
- **no** inventory decrement

Inventory moves to confirm: today `create()` decrements it at
`orders.service.ts:204`, and a quotation is not a commitment, so stock must not
move until the customer says yes.

The customer↔product link is deliberately **not** moved. Linking is automatic
and must stay automatic — it is what fills the "Suggested — Previously ordered"
row in the wizard and the customer's product list. A customer who asked for a
price on a product is exactly who should see it suggested next time, whether or
not that particular quote closed. The same upsert already runs when items are
added to an existing order (`orders.service.ts:382`, `:394`); that stays too.

### `POST /api/v1/orders/:id/status` — confirm (modified)

When `newStatus === 'CONFIRMED'`, inside one `$transaction`:

1. assign `orderNumber` and `factoryOrderNumber`
2. set `confirmedAt`
3. decrement product inventory (moved from create)
4. upsert the `SELLING_PRICE` `OrderCost` = quotation grand total, currency `SAR`

Step 4 is why prices are entered once. `analytics/lib/sales.ts:3` defines
`REVENUE_COST_TYPE = 'SELLING_PRICE'`, and `reports.service.ts:31` excludes it
from cost sums — so deriving it from the confirmed quote makes revenue reporting
work with no double entry.

Idempotency: if a `SELLING_PRICE` cost already exists for the order it is
updated, not duplicated.

All other transitions behave exactly as today.

### `GET /api/v1/orders/:id/quotation` (new)

Returns everything the printed form needs: quote header, customer block, lines
(description, qty, unit, unitPrice, lineTotal), and computed totals.

### `PATCH /api/v1/orders/:id/quotation` (new)

Updates quote header fields and line prices/units/descriptions. **Rejects with
409 when `order.status !== 'QUOTATION'`** — a quote that has been sent and
confirmed must not silently change under the customer.

Permissions: `EDIT_ORDERS` to edit, `CHANGE_STATUS` to confirm. Quotation prices
are what the customer is told, not internal costs, so they are **not** behind
`VIEW_COSTS`; `OrderCost` stays gated as it is today.

### `GET /api/v1/orders` — list (modified)

Accepts `status=QUOTATION` already. Adds `sort=oldest` so the chase list can
order by `createdAt` ascending.

---

## 5. Web

### New Order wizard — `orders/new/page.tsx`

Three steps, as now:

1. **Customer & Products** — unchanged
2. **Quotation** — per-line description / qty / unit / price / line total; VAT
   toggle (on, 15%); discount amount; valid-until; payment terms; client contact
   and attn; notes. Totals update live.
3. **Details & Submit** — expected delivery, assignee, internal notes.

Submit creates the quotation and routes to `/orders/[id]/quotation` rather than
the order detail page — you almost always want to print or send it immediately.

### Quotation page — `orders/[id]/quotation/page.tsx` (new)

Follows the existing `orders/[id]/factory-sheet` pattern: a client page, sticky
`print:hidden` toolbar, print-optimised body.

Visual fidelity to `quotation_form_10.html`, reproduced exactly:

- letterhead image, red double bottom border
- red gradient title bar ("عرض سعر" / "Quotation")
- meta grid: quote no., date, valid until, payment terms
- client box: client block, contact, attn
- items table: dark header, columns `#` / البيان / الكمية / الوحدة / السعر / الإجمالي
- **no image column** — dropped by decision
- totals panel: subtotal, discount (amount), derived discount %, net, VAT %,
  VAT amount, red grand-total bar
- notes panel beside the totals
- signature boxes: المُعِدّ / موافقة العميل
- dark footer: company name, C.R., P.O. box, phones, email, IBAN block
- AR ⇄ EN toggle driven by the same `I18N` dictionary and `dir` switch
- VAT on/off toggle
- print-tip modal ("uncheck Headers and footers") before `window.print()`
- `@page { margin: 10mm; size: A4 }` and the print rules that hide buttons,
  strip input borders, and hide the discount-% row

The 40 KB base64 letterhead is extracted to `apps/web/public/` and referenced by
URL instead of being inlined.

Fields edit inline and autosave (debounced) via `PATCH`. Once status is past
`QUOTATION` the page is read-only but still printable, matching the API's 409.

### Orders list — `orders/page.tsx`

A **Quotations** tab: `status=QUOTATION`, oldest first, with a "Waiting N days"
column computed from `createdAt`, and `validUntil` in red once passed.
`REJECTED` orders are excluded.

### Status colour registry

`QUOTATION`, `CONFIRMED`, and `REJECTED` need entries in:
- `apps/web/src/components/ui/badge.tsx:7` (`ORDER_STATUS_VARIANTS`)
- `apps/web/src/app/(dashboard)/reports/page.tsx:38`

Suggested: `QUOTATION` amber, `CONFIRMED` blue (inheriting `NEW`'s colour),
`REJECTED` grey.

---

## 6. Files touched

**Schema / migration**
- `prisma/schema.prisma`
- `prisma/migrations/<timestamp>_order_quotation_stage/migration.sql`

**API**
- `apps/api/src/orders/order-workflow.ts` — flows, `REJECTED` exception
- `apps/api/src/orders/orders.service.ts` — create, confirm side effects, quotation get/patch
- `apps/api/src/orders/orders.controller.ts` — two new routes
- `apps/api/src/orders/quotation-totals.ts` + spec — **new**
- `apps/api/src/analytics/lib/__tests__/operations.spec.ts` — fixtures use `'NEW'`

**Web**
- `apps/web/src/lib/types.ts` — `OrderStatus`, `NEW_MOLD_FLOW`, `REPEAT_FLOW`
- `apps/web/src/lib/quotation-totals.ts` + spec — **new**
- `apps/web/src/components/ui/badge.tsx`
- `apps/web/src/app/(dashboard)/reports/page.tsx`
- `apps/web/src/app/(dashboard)/orders/page.tsx`
- `apps/web/src/app/(dashboard)/orders/new/page.tsx`
- `apps/web/src/app/(dashboard)/orders/[id]/page.tsx`
- `apps/web/src/app/(dashboard)/orders/[id]/quotation/page.tsx` — **new**
- `apps/web/public/quotation-letterhead.jpg` — **new**, extracted from the HTML's
  `data:image/jpeg;base64` header image (~30 KB)

**Dead but kept consistent**
- `packages/shared/src/enums.ts`, `packages/shared/src/workflows.ts`

---

## 7. Migration and backfill

The migration must, in order:

1. `ALTER TABLE orders ALTER COLUMN order_number DROP NOT NULL`
2. same for `factory_order_number`
3. add `quote_number`, `confirmed_at`
4. add `unit_price`, `unit_label`, `description`, `order_index` to `order_items`
5. create `order_quotations`
6. change the `status` default to `'QUOTATION'`
7. `UPDATE orders SET status = 'CONFIRMED' WHERE status = 'NEW'`
8. `UPDATE order_status_history SET old_status = 'CONFIRMED' WHERE old_status = 'NEW'`
9. `UPDATE order_status_history SET new_status = 'CONFIRMED' WHERE new_status = 'NEW'`

Steps 8 and 9 matter: Analytics reads `order_status_history` for stage timing,
and leaving `'NEW'` there would produce a phantom stage in the funnel.

Backfilling `quote_number` for existing orders is **not** required — they are all
past the quotation stage. It stays null for them, so `quote_number` is
`String? @unique`, not `String @unique`.

Existing orders keep their `order_number` and `factory_order_number`, and get
`confirmed_at = NULL`; the chase list only reads `QUOTATION` rows, so nothing
displays wrongly.

### Production

The live database is the `hqq_db` docker container on port 5434 (user `hqq`,
database `hqq_oms`) — **not** `hqq_postgres` on 5432. Take a `pg_dump` before
applying. Deploy per the tested procedure: `git archive` → `scp` → `tar x` →
`npm install` → build api → build web → **`pm2 restart hqq-api hqq-web`**.
Verify with `pm2 jlist` that both actually restarted; a dropped SSH session
between build and restart leaves the old code serving and produces 404s where
401s belong.

---

## 8. Testing

**Unit — `quotation-totals`** (API copy; the web copy is display-only, see §3)
- line total = qty × price; subtotal sums lines
- discount clamps to `[0, subtotal]`
- VAT applies to net, not subtotal
- `vatEnabled: false` → vat 0, grand = net
- zero-line quote → all zeros, no division by zero in the derived %

**Unit — `order-workflow`**
- `QUOTATION → CONFIRMED` valid; `QUOTATION → SENT_TO_FACTORY` invalid
- `QUOTATION → REJECTED` valid; `CONFIRMED → REJECTED` invalid
- `REJECTED → anything` invalid
- both flows still reject backwards and skip-ahead moves

**Service — create**
- creates with `status: 'QUOTATION'` and a `QT-` number
- leaves `orderNumber` and `factoryOrderNumber` null
- **does not** change `product.inventory`
- **does** create the `customerProduct` link for every item, on first order and
  on repeat orders alike (upsert, never duplicates)

**Service — confirm**
- assigns both numbers, sets `confirmedAt`
- decrements inventory, clamped so stock never goes negative
- creates one `SELLING_PRICE` cost equal to the quote grand total
- confirming is idempotent on the cost row (updates, never duplicates)

**Service — quotation patch**
- 409 once status has moved past `QUOTATION`

**Manual**
- print the generated quotation next to `quotation_form_10.html` printed from
  the browser and compare page 1 side by side, in both AR and EN

---

## 9. Known constraints

- **`packages/shared` is unwired.** Nothing in `apps/api` or `apps/web` imports
  `@hqq/shared` and it is not a dependency of either. The flow arrays are
  therefore duplicated in `apps/api/src/orders/order-workflow.ts` and
  `apps/web/src/lib/types.ts`, and both must be edited together. Wiring the
  package up is a separate piece of work and out of scope here; this design
  follows the codebase's actual pattern.
- **A green build does not prove type safety.** Lint is disabled and `tsc`
  reports a baseline of 6 pre-existing errors. Run `tsc` and compare against
  that baseline rather than trusting the build.
- **Prisma `DateTime` handling.** Pass real `Date` objects, not ISO strings, to
  Prisma writes — `validUntil` and `quoteDate` are the exposed fields here.
