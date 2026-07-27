# Order Quotation Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `QUOTATION` stage before `CONFIRMED` so unconfirmed customer requests are tracked and chaseable, and give every order an in-app printable quotation matching `quotation_form_10.html`.

**Architecture:** `Order.status` gains `QUOTATION` at the front of both workflows and `NEW` is renamed `CONFIRMED`. Order creation now produces an unconfirmed quotation (`QT-` number, no stock movement); confirming assigns the `ORD-`/`FO-` numbers, moves stock, and writes the quote total as the `SELLING_PRICE` order cost that Reports and Analytics already read. A new `OrderQuotation` table holds the quote header, `OrderItem` gains per-line pricing, and a new page renders the printable form.

**Tech Stack:** NestJS 11 + Prisma 6 + PostgreSQL (`apps/api`), Next.js 15 App Router + React 19 + Tailwind + TanStack Query (`apps/web`), jest + ts-jest (API tests only).

Spec: `docs/superpowers/specs/2026-07-27-order-quotation-stage-design.md`

## Global Constraints

- **Repo root:** `C:\Users\Lenovo\Desktop\Claude App\hqq-oms`. All paths below are relative to it.
- **`packages/shared` is dead code.** Nothing imports `@hqq/shared`. The workflow arrays are duplicated in `apps/api/src/orders/order-workflow.ts` and `apps/web/src/lib/types.ts` — **both must be edited together**. Update `packages/shared/src/*` too, for consistency only.
- **`apps/web` has no test runner.** No jest, no vitest, no `test` script. Web tasks are verified by `npx tsc --noEmit` and by running the app — never write web test files.
- **API tests:** `npm -w apps/api run test`. Config is `apps/api/jest.config.js` (`rootDir: 'src'`, `testRegex: '.*\.spec\.ts$'`), so specs live under `apps/api/src/**`.
- **A green build does not prove type safety** — lint is disabled, so run `tsc` explicitly. Measured on this branch at 2026-07-27, **both projects are at zero errors**:
  - `npx tsc --noEmit -p apps/api/tsconfig.json` → 0
  - `npx tsc --noEmit -p apps/web/tsconfig.json` → 0

  Zero is the bar. Any `tsc` error you see is one you introduced.
- **Baseline test suite:** `npm -w apps/api run test` → 6 suites, 28 tests, all passing. Never finish a task below that count.
- **Prisma `DateTime`:** always pass real `Date` objects to Prisma writes, never ISO strings.
- **Never run `prisma migrate dev` or `prisma db push` in this repo.** The schema grew under `db push`, so ~35 tables exist that no migration file created. All 9 migrations on disk are recorded as applied, but replaying them would not reproduce the database, and `migrate dev` treats that as drift and demands `migrate reset` — which destroys all data. Migrations here are produced with `prisma migrate diff` and recorded with `prisma migrate resolve --applied`. This is pre-existing and out of scope to fix.
- **Currency is SAR only** for quotations.
- **Mold placeholder:** a product with `requiresLineSpecs = true` carries its specs on the *line*, not the product, and may appear on several lines of one order. Key off that flag — never off the SKU string. The four required spec keys are exactly `machine`, `capacity`, `grams`, `pattern`, matching `Product.specs` (`products.service.ts:45-48`).
- `OrderItem.drawingNumber` and `OrderItem.promotedProductId` are added by Task 4 but **used by nothing in this plan**. They exist so the mold-promotion feature needs no second migration against the live database. Do not build promotion behaviour here.
- **Do not deploy** until Task 11. Production is a live business database.
- Commit after every task. Branch: `feat/order-quotation-stage`.

---

## File Structure

**New files**

| File | Responsibility |
|---|---|
| `apps/api/src/orders/quotation-totals.ts` | Pure arithmetic: line totals, discount clamp, VAT, grand total. Authoritative. |
| `apps/api/src/orders/quotation-defaults.ts` | Pure: builds the quote header defaults from a customer. |
| `apps/api/src/orders/sequence.ts` | Pure: next `QT-`/`ORD-`/`FO-` number from the previous one. |
| `apps/api/src/orders/mold-specs.ts` | Pure: required spec keys, incomplete-line detection, spec label rendering. |
| `apps/api/src/orders/__tests__/order-workflow.spec.ts` | Transition rules. |
| `apps/api/src/orders/__tests__/quotation-totals.spec.ts` | Totals arithmetic. |
| `apps/api/src/orders/__tests__/sequence.spec.ts` | Number sequencing. |
| `apps/api/src/orders/__tests__/orders.service.spec.ts` | The two highest-risk service behaviours (create, confirm). |
| `apps/web/src/lib/quotation-totals.ts` | Literal copy of the API function, display-only. |
| `apps/web/src/app/(dashboard)/orders/[id]/quotation/quotation-css.ts` | The form stylesheet as a plain string, scoped under `.qform`. |
| `apps/web/src/app/(dashboard)/orders/[id]/quotation/page.tsx` | The printable quotation page. |
| `apps/web/public/quotation-letterhead.jpg` | Letterhead extracted from the source HTML. |

**Modified files**

| File | Change |
|---|---|
| `prisma/schema.prisma` | `Order`, `OrderItem`, `Product`, new `OrderQuotation` |
| `apps/api/src/orders/order-workflow.ts` | flows + `REJECTED` |
| `apps/api/src/orders/orders.service.ts` | create, confirm, quotation get/patch |
| `apps/api/src/orders/orders.controller.ts` | two new routes |
| `apps/api/src/analytics/lib/__tests__/operations.spec.ts` | fixtures say `'NEW'` |
| `apps/web/src/lib/types.ts` | `OrderStatus`, both flow arrays |
| `apps/web/src/components/ui/badge.tsx` | status colours |
| `apps/web/src/app/(dashboard)/reports/page.tsx` | status colours |
| `apps/web/src/app/(dashboard)/orders/page.tsx` | Quotations tab, null `orderNumber` |
| `apps/web/src/app/(dashboard)/orders/new/page.tsx` | pricing step |
| `apps/web/src/app/(dashboard)/orders/[id]/page.tsx` | null `orderNumber`, quotation link, reject action |
| `apps/web/src/app/(dashboard)/page.tsx` | null `orderNumber` in recent orders |
| `packages/shared/src/enums.ts`, `packages/shared/src/workflows.ts` | consistency only |

---

## Task 1: Workflow transitions

**Files:**
- Modify: `apps/api/src/orders/order-workflow.ts`
- Test: `apps/api/src/orders/__tests__/order-workflow.spec.ts` (create)

**Interfaces:**
- Consumes: nothing
- Produces: `isValidTransition(orderType: string, currentStatus: string, newStatus: string): boolean` — unchanged signature, new rules.

- [ ] **Step 1: Confirm the baseline**

The branch `feat/order-quotation-stage` already exists and is checked out.

```bash
npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | tail -20
npm -w apps/api run test 2>&1 | tail -6
```

Expected: **zero** `tsc` output, and 6 suites / 28 tests passing. If either differs, stop and report — something changed underneath this plan.

- [ ] **Step 2: Write the failing test**

Create `apps/api/src/orders/__tests__/order-workflow.spec.ts`:

```ts
import { isValidTransition } from '../order-workflow';

describe('isValidTransition', () => {
  it('starts both flows at QUOTATION and moves to CONFIRMED', () => {
    expect(isValidTransition('NEW_MOLD', 'QUOTATION', 'CONFIRMED')).toBe(true);
    expect(isValidTransition('REPEAT', 'QUOTATION', 'CONFIRMED')).toBe(true);
  });

  it('rejects skipping past CONFIRMED', () => {
    expect(isValidTransition('NEW_MOLD', 'QUOTATION', 'SAMPLE_RECEIVED')).toBe(false);
    expect(isValidTransition('REPEAT', 'QUOTATION', 'SENT_TO_FACTORY')).toBe(false);
  });

  it('keeps the rest of each flow in order', () => {
    expect(isValidTransition('NEW_MOLD', 'CONFIRMED', 'SAMPLE_RECEIVED')).toBe(true);
    expect(isValidTransition('REPEAT', 'CONFIRMED', 'SENT_TO_FACTORY')).toBe(true);
    expect(isValidTransition('NEW_MOLD', 'SHIPPED_TO_CUSTOMER', 'COMPLETED')).toBe(true);
  });

  it('rejects backwards moves', () => {
    expect(isValidTransition('NEW_MOLD', 'CONFIRMED', 'QUOTATION')).toBe(false);
    expect(isValidTransition('NEW_MOLD', 'COMPLETED', 'SHIPPED_TO_CUSTOMER')).toBe(false);
  });

  it('allows REJECTED only from QUOTATION', () => {
    expect(isValidTransition('NEW_MOLD', 'QUOTATION', 'REJECTED')).toBe(true);
    expect(isValidTransition('REPEAT', 'QUOTATION', 'REJECTED')).toBe(true);
    expect(isValidTransition('NEW_MOLD', 'CONFIRMED', 'REJECTED')).toBe(false);
    expect(isValidTransition('NEW_MOLD', 'COMPLETED', 'REJECTED')).toBe(false);
  });

  it('makes REJECTED terminal', () => {
    expect(isValidTransition('NEW_MOLD', 'REJECTED', 'QUOTATION')).toBe(false);
    expect(isValidTransition('NEW_MOLD', 'REJECTED', 'CONFIRMED')).toBe(false);
  });

  it('rejects an unknown order type or status', () => {
    expect(isValidTransition('BOGUS', 'QUOTATION', 'CONFIRMED')).toBe(false);
    expect(isValidTransition('BOGUS', 'QUOTATION', 'REJECTED')).toBe(false);
    expect(isValidTransition('NEW_MOLD', 'QUOTATION', 'NOPE')).toBe(false);
  });

  it('no longer knows the NEW status', () => {
    expect(isValidTransition('NEW_MOLD', 'NEW', 'SAMPLE_RECEIVED')).toBe(false);
  });
});
```

- [ ] **Step 3: Run it and confirm it fails**

```bash
npm -w apps/api run test -- order-workflow
```

Expected: failures on the `QUOTATION` and `REJECTED` cases (the flows still start at `NEW`).

- [ ] **Step 4: Replace the flows**

`apps/api/src/orders/order-workflow.ts` in full:

```ts
const NEW_MOLD_FLOW = [
  'QUOTATION',
  'CONFIRMED',
  'SAMPLE_RECEIVED',
  'CAD_DRAWING_READY',
  'SENT_TO_FACTORY',
  'MOLD_READY',
  'SILICONE_CASTING',
  'SHIPPED_FROM_FACTORY',
  'RECEIVED_LOCALLY',
  'SHIPPED_TO_CUSTOMER',
  'COMPLETED',
] as const;

const REPEAT_FLOW = [
  'QUOTATION',
  'CONFIRMED',
  'SENT_TO_FACTORY',
  'SILICONE_CASTING',
  'SHIPPED_FROM_FACTORY',
  'RECEIVED_LOCALLY',
  'SHIPPED_TO_CUSTOMER',
  'COMPLETED',
] as const;

const FLOWS: Record<string, readonly string[]> = {
  NEW_MOLD: NEW_MOLD_FLOW,
  REPEAT: REPEAT_FLOW,
};

/**
 * A quote the customer declined. Off-flow and terminal: it is in neither flow
 * array, so nothing transitions out of it.
 */
export const REJECTED = 'REJECTED';

export function isValidTransition(
  orderType: string,
  currentStatus: string,
  newStatus: string,
): boolean {
  const flow = FLOWS[orderType];
  if (!flow) return false;

  // The one exception to the linear rule: a quotation can be declined.
  if (currentStatus === 'QUOTATION' && newStatus === REJECTED) return true;

  const currentIdx = flow.indexOf(currentStatus);
  const newIdx = flow.indexOf(newStatus);

  if (currentIdx === -1 || newIdx === -1) return false;
  return newIdx === currentIdx + 1;
}
```

- [ ] **Step 5: Run the test again**

```bash
npm -w apps/api run test -- order-workflow
```

Expected: PASS, 8 tests.

- [ ] **Step 6: Mirror into the dead shared package**

In `packages/shared/src/enums.ts`, in `enum OrderStatus`, replace the `NEW = 'NEW',` line with:

```ts
  QUOTATION = 'QUOTATION',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
```

In `packages/shared/src/workflows.ts`, put `OrderStatus.QUOTATION, OrderStatus.CONFIRMED,` at the head of both `NEW_MOLD_FLOW` and `REPEAT_FLOW` in place of `OrderStatus.NEW`, and in `STATUS_LABELS` replace the `[OrderStatus.NEW]: 'New',` entry with:

```ts
  [OrderStatus.QUOTATION]: 'Quotation (Not Confirmed)',
  [OrderStatus.CONFIRMED]: 'Confirmed',
  [OrderStatus.REJECTED]: 'Rejected',
```

`REJECTED` is off-flow, so add it to `STATUS_LABELS` but **not** to either flow array.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/orders/order-workflow.ts apps/api/src/orders/__tests__/order-workflow.spec.ts packages/shared/src
git commit -m "feat(orders): add QUOTATION stage, rename NEW to CONFIRMED, allow REJECTED"
```

---

## Task 2: Quotation totals

**Files:**
- Create: `apps/api/src/orders/quotation-totals.ts`
- Test: `apps/api/src/orders/__tests__/quotation-totals.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `computeQuotationTotals(input: QuotationTotalsInput): QuotationTotals`
  - `QuotationTotalsInput = { lines: { quantity: number; unitPrice: number | null }[]; discountAmount: number; vatEnabled: boolean; vatPercent: number }`
  - `QuotationTotals = { lineTotals: number[]; subtotal: number; discount: number; discountPercent: number; net: number; vat: number; grandTotal: number }`

This is the arithmetic from `calcAll()` in `quotation_form_10.html`. Tasks 5, 6 and 9 all depend on these exact names.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/orders/__tests__/quotation-totals.spec.ts`:

```ts
import { computeQuotationTotals } from '../quotation-totals';

const base = { discountAmount: 0, vatEnabled: true, vatPercent: 15 };

describe('computeQuotationTotals', () => {
  it('multiplies each line and sums the subtotal', () => {
    const t = computeQuotationTotals({
      ...base,
      lines: [
        { quantity: 3, unitPrice: 10.5 },
        { quantity: 1, unitPrice: 100 },
      ],
    });
    expect(t.lineTotals).toEqual([31.5, 100]);
    expect(t.subtotal).toBe(131.5);
  });

  it('applies VAT to the net, not the subtotal', () => {
    const t = computeQuotationTotals({
      ...base,
      discountAmount: 10,
      lines: [{ quantity: 1, unitPrice: 100 }],
    });
    expect(t.net).toBe(90);
    expect(t.vat).toBe(13.5);
    expect(t.grandTotal).toBe(103.5);
  });

  it('clamps the discount to the subtotal', () => {
    const t = computeQuotationTotals({
      ...base,
      discountAmount: 500,
      lines: [{ quantity: 1, unitPrice: 100 }],
    });
    expect(t.discount).toBe(100);
    expect(t.net).toBe(0);
    expect(t.vat).toBe(0);
    expect(t.grandTotal).toBe(0);
  });

  it('clamps a negative discount to zero', () => {
    const t = computeQuotationTotals({
      ...base,
      discountAmount: -50,
      lines: [{ quantity: 1, unitPrice: 100 }],
    });
    expect(t.discount).toBe(0);
    expect(t.net).toBe(100);
  });

  it('derives the discount percentage', () => {
    const t = computeQuotationTotals({
      ...base,
      discountAmount: 25,
      lines: [{ quantity: 1, unitPrice: 100 }],
    });
    expect(t.discountPercent).toBe(25);
  });

  it('drops VAT entirely when disabled', () => {
    const t = computeQuotationTotals({
      ...base,
      vatEnabled: false,
      lines: [{ quantity: 2, unitPrice: 50 }],
    });
    expect(t.vat).toBe(0);
    expect(t.grandTotal).toBe(100);
  });

  it('treats a missing unit price as zero', () => {
    const t = computeQuotationTotals({
      ...base,
      lines: [{ quantity: 5, unitPrice: null }],
    });
    expect(t.lineTotals).toEqual([0]);
    expect(t.subtotal).toBe(0);
  });

  it('returns zeros for an empty quote without dividing by zero', () => {
    const t = computeQuotationTotals({ ...base, lines: [] });
    expect(t.subtotal).toBe(0);
    expect(t.discountPercent).toBe(0);
    expect(t.grandTotal).toBe(0);
    expect(Number.isNaN(t.discountPercent)).toBe(false);
  });

  it('rounds to two decimals rather than leaking float noise', () => {
    const t = computeQuotationTotals({
      ...base,
      lines: [{ quantity: 3, unitPrice: 0.1 }],
    });
    expect(t.subtotal).toBe(0.3);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm -w apps/api run test -- quotation-totals
```

Expected: FAIL — `Cannot find module '../quotation-totals'`.

- [ ] **Step 3: Implement**

Create `apps/api/src/orders/quotation-totals.ts`:

```ts
/**
 * The arithmetic from calcAll() in the paper quotation form. Authoritative:
 * the API computes what is printed and what is recorded as SELLING_PRICE.
 * apps/web/src/lib/quotation-totals.ts is a display-only copy of this file.
 */

export interface QuotationLineInput {
  quantity: number;
  unitPrice: number | null;
}

export interface QuotationTotalsInput {
  lines: QuotationLineInput[];
  discountAmount: number;
  vatEnabled: boolean;
  vatPercent: number;
}

export interface QuotationTotals {
  lineTotals: number[];
  subtotal: number;
  discount: number;
  discountPercent: number;
  net: number;
  vat: number;
  grandTotal: number;
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function computeQuotationTotals(
  input: QuotationTotalsInput,
): QuotationTotals {
  const lineTotals = input.lines.map((l) =>
    round2((l.quantity || 0) * (l.unitPrice ?? 0)),
  );
  const subtotal = round2(lineTotals.reduce((sum, t) => sum + t, 0));

  const discount = round2(
    Math.min(Math.max(input.discountAmount || 0, 0), subtotal),
  );
  const discountPercent =
    subtotal > 0 ? round2((discount / subtotal) * 100) : 0;

  const net = round2(subtotal - discount);
  const vat = input.vatEnabled
    ? round2((net * (input.vatPercent || 0)) / 100)
    : 0;
  const grandTotal = round2(net + vat);

  return { lineTotals, subtotal, discount, discountPercent, net, vat, grandTotal };
}
```

- [ ] **Step 4: Run the test again**

```bash
npm -w apps/api run test -- quotation-totals
```

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/orders/quotation-totals.ts apps/api/src/orders/__tests__/quotation-totals.spec.ts
git commit -m "feat(orders): add quotation totals calculation"
```

---

## Task 3: Pure helpers — sequencing, quote defaults, mold specs

**Files:**
- Create: `apps/api/src/orders/sequence.ts`, `apps/api/src/orders/quotation-defaults.ts`, `apps/api/src/orders/mold-specs.ts`
- Test: `apps/api/src/orders/__tests__/sequence.spec.ts`, `apps/api/src/orders/__tests__/mold-specs.spec.ts`

**Interfaces:**
- Produces:
  - `nextSequenceNumber(prefix: string, lastValue: string | null): string`
  - `buildQuotationDefaults(input: QuotationDefaultsInput): QuotationDefaults`
  - `QuotationDefaultsInput = { customerName: string; customerCity: string | null; contactName: string | null; contactPhone: string | null; quoteDate: Date }`
  - `QuotationDefaults = { quoteDate: Date; validUntil: Date; clientBlock: string; contact: string | null; attn: string | null }`
  - `REQUIRED_SPEC_KEYS: readonly ['machine', 'capacity', 'grams', 'pattern']`
  - `MoldSpecs = { machine?: string; capacity?: string; grams?: string; pattern?: string }`
  - `missingSpecKeys(specs: unknown): string[]`
  - `findIncompleteSpecLines(lines: { index: number; requiresLineSpecs: boolean; specs: unknown }[]): { index: number; missing: string[] }[]`
  - `formatSpecs(specs: unknown): string`

`orders.service.ts` currently repeats this sequencing logic twice with `.replace(prefix, '')`, which corrupts the result when the prefix characters recur in the suffix. Extracting it fixes that and makes it testable.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/orders/__tests__/sequence.spec.ts`:

```ts
import { nextSequenceNumber } from '../sequence';
import { buildQuotationDefaults } from '../quotation-defaults';

describe('nextSequenceNumber', () => {
  it('starts at 0001 when there is no previous value', () => {
    expect(nextSequenceNumber('QT-2026-', null)).toBe('QT-2026-0001');
  });

  it('increments the previous value', () => {
    expect(nextSequenceNumber('QT-2026-', 'QT-2026-0007')).toBe('QT-2026-0008');
  });

  it('rolls past four digits without truncating', () => {
    expect(nextSequenceNumber('ORD-2026-', 'ORD-2026-9999')).toBe('ORD-2026-10000');
  });

  it('handles a prefix whose characters recur in the suffix', () => {
    expect(nextSequenceNumber('FO-2026-FO-', 'FO-2026-FO-0003')).toBe('FO-2026-FO-0004');
  });

  it('restarts at 0001 when the previous value is malformed', () => {
    expect(nextSequenceNumber('QT-2026-', 'QT-2026-BROKEN')).toBe('QT-2026-0001');
  });
});

describe('buildQuotationDefaults', () => {
  const quoteDate = new Date('2026-07-27T00:00:00.000Z');

  it('sets validity to 14 days after the quote date', () => {
    const d = buildQuotationDefaults({
      customerName: 'Acme',
      customerCity: null,
      contactName: null,
      contactPhone: null,
      quoteDate,
    });
    expect(d.validUntil.toISOString().slice(0, 10)).toBe('2026-08-10');
  });

  it('builds the client block from name and city', () => {
    const d = buildQuotationDefaults({
      customerName: 'Acme Dates Factory',
      customerCity: 'Dammam',
      contactName: null,
      contactPhone: null,
      quoteDate,
    });
    expect(d.clientBlock).toBe('Acme Dates Factory\nDammam');
  });

  it('omits the city line when there is no city', () => {
    const d = buildQuotationDefaults({
      customerName: 'Acme',
      customerCity: null,
      contactName: null,
      contactPhone: null,
      quoteDate,
    });
    expect(d.clientBlock).toBe('Acme');
  });

  it('carries the contact phone and name across', () => {
    const d = buildQuotationDefaults({
      customerName: 'Acme',
      customerCity: 'Dammam',
      contactName: 'Khaled',
      contactPhone: '0500000000',
      quoteDate,
    });
    expect(d.contact).toBe('0500000000');
    expect(d.attn).toBe('Khaled');
  });

  it('returns Date objects, not strings, for Prisma', () => {
    const d = buildQuotationDefaults({
      customerName: 'Acme',
      customerCity: null,
      contactName: null,
      contactPhone: null,
      quoteDate,
    });
    expect(d.quoteDate).toBeInstanceOf(Date);
    expect(d.validUntil).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm -w apps/api run test -- sequence
```

Expected: FAIL — modules not found.

- [ ] **Step 3: Implement both modules**

Create `apps/api/src/orders/sequence.ts`:

```ts
/**
 * Next value in a zero-padded numeric sequence such as QT-2026-0007.
 * Uses slice() rather than replace() so a prefix whose characters recur in
 * the suffix cannot corrupt the parsed number.
 */
export function nextSequenceNumber(
  prefix: string,
  lastValue: string | null,
): string {
  const parsed = lastValue
    ? parseInt(lastValue.slice(prefix.length), 10)
    : NaN;
  const next = Number.isFinite(parsed) ? parsed + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}
```

Create `apps/api/src/orders/quotation-defaults.ts`:

```ts
export interface QuotationDefaultsInput {
  customerName: string;
  customerCity: string | null;
  contactName: string | null;
  contactPhone: string | null;
  quoteDate: Date;
}

export interface QuotationDefaults {
  quoteDate: Date;
  validUntil: Date;
  clientBlock: string;
  contact: string | null;
  attn: string | null;
}

/** Matches the paper form: validity defaults to two weeks out. */
const VALIDITY_DAYS = 14;

export function buildQuotationDefaults(
  input: QuotationDefaultsInput,
): QuotationDefaults {
  const validUntil = new Date(input.quoteDate);
  validUntil.setDate(validUntil.getDate() + VALIDITY_DAYS);

  return {
    quoteDate: input.quoteDate,
    validUntil,
    clientBlock: [input.customerName, input.customerCity]
      .filter((part): part is string => Boolean(part))
      .join('\n'),
    contact: input.contactPhone ?? null,
    attn: input.contactName ?? null,
  };
}
```

- [ ] **Step 4: Run the test again**

```bash
npm -w apps/api run test -- sequence
```

Expected: PASS, 10 tests.

- [ ] **Step 5: Write the failing mold-spec test**

Create `apps/api/src/orders/__tests__/mold-specs.spec.ts`:

```ts
import {
  REQUIRED_SPEC_KEYS,
  missingSpecKeys,
  findIncompleteSpecLines,
  formatSpecs,
} from '../mold-specs';

const full = { machine: 'MV', capacity: '6K', grams: '250', pattern: 'Rose' };

describe('missingSpecKeys', () => {
  it('returns nothing when all four are present', () => {
    expect(missingSpecKeys(full)).toEqual([]);
  });

  it('lists every absent key', () => {
    expect(missingSpecKeys({ machine: 'MV' }).sort()).toEqual(
      ['capacity', 'grams', 'pattern'],
    );
  });

  it('treats blank and whitespace-only values as missing', () => {
    expect(missingSpecKeys({ ...full, pattern: '   ' })).toEqual(['pattern']);
    expect(missingSpecKeys({ ...full, grams: '' })).toEqual(['grams']);
  });

  it('treats null and non-objects as everything missing', () => {
    expect(missingSpecKeys(null).sort()).toEqual([...REQUIRED_SPEC_KEYS].sort());
    expect(missingSpecKeys('nope').sort()).toEqual([...REQUIRED_SPEC_KEYS].sort());
  });
});

describe('findIncompleteSpecLines', () => {
  it('ignores lines that do not require specs', () => {
    expect(
      findIncompleteSpecLines([
        { index: 0, requiresLineSpecs: false, specs: null },
        { index: 1, requiresLineSpecs: false, specs: { machine: 'MV' } },
      ]),
    ).toEqual([]);
  });

  it('reports each incomplete mold line with its index and missing keys', () => {
    const result = findIncompleteSpecLines([
      { index: 0, requiresLineSpecs: true, specs: full },
      { index: 1, requiresLineSpecs: true, specs: { machine: 'MV', capacity: '6K' } },
      { index: 2, requiresLineSpecs: true, specs: null },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].index).toBe(1);
    expect(result[0].missing.sort()).toEqual(['grams', 'pattern']);
    expect(result[1].index).toBe(2);
  });

  it('returns nothing when every mold line is complete', () => {
    expect(
      findIncompleteSpecLines([{ index: 0, requiresLineSpecs: true, specs: full }]),
    ).toEqual([]);
  });
});

describe('formatSpecs', () => {
  it('joins the four values in a fixed order', () => {
    expect(formatSpecs(full)).toBe('MV · 6K · 250 · Rose');
  });

  it('skips absent values rather than leaving empty separators', () => {
    expect(formatSpecs({ machine: 'MV', pattern: 'Rose' })).toBe('MV · Rose');
  });

  it('returns an empty string for no specs', () => {
    expect(formatSpecs(null)).toBe('');
    expect(formatSpecs({})).toBe('');
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

```bash
npm -w apps/api run test -- mold-specs
```

Expected: FAIL — `Cannot find module '../mold-specs'`.

- [ ] **Step 7: Implement the mold-spec helpers**

Create `apps/api/src/orders/mold-specs.ts`:

```ts
/**
 * A placeholder product (Product.requiresLineSpecs) carries no fixed spec
 * combination — each order line names its own mold. Keys match Product.specs
 * so a promoted mold can copy them straight across later.
 */
export const REQUIRED_SPEC_KEYS = [
  'machine',
  'capacity',
  'grams',
  'pattern',
] as const;

export type SpecKey = (typeof REQUIRED_SPEC_KEYS)[number];

export type MoldSpecs = Partial<Record<SpecKey, string>>;

function readSpecs(specs: unknown): MoldSpecs {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return {};
  return specs as MoldSpecs;
}

export function missingSpecKeys(specs: unknown): string[] {
  const s = readSpecs(specs);
  return REQUIRED_SPEC_KEYS.filter((key) => !s[key] || !String(s[key]).trim());
}

export function findIncompleteSpecLines(
  lines: { index: number; requiresLineSpecs: boolean; specs: unknown }[],
): { index: number; missing: string[] }[] {
  return lines
    .filter((line) => line.requiresLineSpecs)
    .map((line) => ({ index: line.index, missing: missingSpecKeys(line.specs) }))
    .filter((line) => line.missing.length > 0);
}

export function formatSpecs(specs: unknown): string {
  const s = readSpecs(specs);
  return REQUIRED_SPEC_KEYS.map((key) => s[key])
    .filter((value): value is string => Boolean(value && String(value).trim()))
    .join(' · ');
}
```

- [ ] **Step 8: Run the test again**

```bash
npm -w apps/api run test -- mold-specs
```

Expected: PASS, 10 tests.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/orders/sequence.ts apps/api/src/orders/quotation-defaults.ts apps/api/src/orders/mold-specs.ts apps/api/src/orders/__tests__/sequence.spec.ts apps/api/src/orders/__tests__/mold-specs.spec.ts
git commit -m "feat(orders): pure helpers for sequencing, quote defaults and mold specs"
```

---

## Task 4: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<generated>_order_quotation_stage/migration.sql`

**Interfaces:**
- Produces: Prisma client types `Order.quoteNumber`, `Order.confirmedAt`, `Order.quotation`, `OrderItem.unitPrice | unitLabel | description | orderIndex | specs | drawingNumber | promotedProductId`, `Product.requiresLineSpecs`, `OrderQuotation`, and the seeded product `SIL-THF-NEWMOLD`. Tasks 5–11 depend on these names.

**This task runs against your local dev database only.** Production is Task 11.

- [ ] **Step 1: Edit the `Order` model**

In `prisma/schema.prisma`, replace lines 242–248 (`orderNumber` through `status`) with:

```prisma
  orderNumber          String?   @unique @map("order_number")
  factoryOrderNumber   String?   @unique @map("factory_order_number")
  quoteNumber          String?   @unique @map("quote_number")
  orderType            String    @map("order_type")
  customerId           String    @map("customer_id")
  productId            String?   @map("product_id")
  factoryId            String?   @map("factory_id")
  status               String    @default("QUOTATION")
```

Then, after the `completedAt` line, add:

```prisma
  confirmedAt          DateTime? @map("confirmed_at")
```

And in the relation block, after `statusHistory OrderStatusHistory[]`, add:

```prisma
  quotation     OrderQuotation?
```

- [ ] **Step 2: Edit the `OrderItem` model**

Replace the `OrderItem` model body's scalar fields (currently `id`, `orderId`, `productId`, `quantity`, `createdAt`) so it reads:

```prisma
model OrderItem {
  id          String   @id @default(cuid())
  orderId     String   @map("order_id")
  productId   String   @map("product_id")
  quantity    Int      @default(1)
  unitPrice   Decimal? @map("unit_price") @db.Decimal(14, 2)
  unitLabel   String   @default("عدد") @map("unit_label")
  description String?
  orderIndex  Int      @default(0) @map("order_index")
  specs       Json?
  drawingNumber     String? @map("drawing_number")
  promotedProductId String? @map("promoted_product_id")
  createdAt   DateTime @default(now()) @map("created_at")

  order   Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id])

  @@index([orderId])
  @@map("order_items")
}
```

`@@unique([orderId, productId])` is **removed**: the mold placeholder appears once
per design, so one order holds several lines of the same product. It is replaced
by a plain index on `orderId`, which is what the queries actually need. Ordinary
products still merge by quantity — that is enforced in `addItem` (Task 11), not by
the database.

`specs` holds `{ machine, capacity, grams, pattern }`. `drawingNumber` and
`promotedProductId` are for the later mold-promotion feature and are written by
nothing in this plan; they are here so production takes one migration, not two.

- [ ] **Step 2b: Add the placeholder flag to `Product`**

In the `Product` model, after the `inventory` line, add:

```prisma
  requiresLineSpecs Boolean  @default(false) @map("requires_line_specs")
```

A product with this flag carries its specs per order line rather than on the
product. All code keys off this flag, never off the SKU.

- [ ] **Step 3: Add the `OrderQuotation` model**

Immediately after the `OrderStatusHistory` model, add:

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
  discountAmount Decimal   @default(0) @map("discount_amount") @db.Decimal(14, 2)
  vatEnabled     Boolean   @default(true) @map("vat_enabled")
  vatPercent     Decimal   @default(15) @map("vat_percent") @db.Decimal(5, 2)
  language       String    @default("ar")
  createdAt      DateTime  @default(now()) @map("created_at")
  updatedAt      DateTime  @updatedAt @map("updated_at")

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)

  @@map("order_quotations")
}
```

- [ ] **Step 4: Validate the schema**

```bash
npx prisma validate --schema prisma/schema.prisma
```

Expected: "The schema at prisma/schema.prisma is valid."

- [ ] **Step 5: Generate the migration with `migrate diff`, not `migrate dev`**

> **Do not run `prisma migrate dev`.** This project's schema grew for a long time
> under `prisma db push`: the database holds ~35 tables (Projects, quotation
> workspace, client approval, quote comparison) that no migration file ever
> created. All 9 migrations on disk are recorded as applied, but replaying them
> from scratch would not reproduce the database. `migrate dev` sees that as drift
> and demands `migrate reset`, which destroys all local data. This is pre-existing
> and is not yours to fix.
>
> `migrate diff` sidesteps it by diffing the **live database** against the
> **target schema**, which yields exactly this task's delta and nothing else.

```bash
mkdir -p prisma/migrations/20260727000000_order_quotation_stage
npx prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/20260727000000_order_quotation_stage/migration.sql
cat prisma/migrations/20260727000000_order_quotation_stage/migration.sql
```

The timestamp `20260727000000` sorts after the last existing migration
(`20260512000001_todo_person`), which is what `migrate deploy` needs.

- [ ] **Step 6: Append the status backfill to the generated SQL**

Open the generated `migration.sql` and append these three statements at the end. Prisma cannot infer them, and without them Analytics reads a phantom `NEW` stage out of the history table:

```sql
-- Existing orders sitting at NEW are confirmed orders under the new vocabulary.
UPDATE "orders" SET "status" = 'CONFIRMED' WHERE "status" = 'NEW';
UPDATE "order_status_history" SET "old_status" = 'CONFIRMED' WHERE "old_status" = 'NEW';
UPDATE "order_status_history" SET "new_status" = 'CONFIRMED' WHERE "new_status" = 'NEW';
```

Then verify the generated SQL against this expected shape. It was produced from
this exact database on 2026-07-27 and should match:

- `DROP INDEX "order_items_order_id_product_id_key"` — the unique constraint going away
- `ALTER TABLE "order_items" ADD COLUMN` for `description`, `drawing_number`, `order_index`, `promoted_product_id`, `specs`, `unit_label`, `unit_price`
- `ALTER TABLE "orders" ADD COLUMN "confirmed_at"`, `ADD COLUMN "quote_number"`, and crucially **`ALTER COLUMN "order_number" DROP NOT NULL`** and the same for `factory_order_number`
- `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'QUOTATION'`
- `ALTER TABLE "products" ADD COLUMN "requires_line_specs"`
- `CREATE TABLE "order_quotations"` with its unique index and foreign key
- `CREATE INDEX "order_items_order_id_idx"`, `CREATE UNIQUE INDEX "orders_quote_number_key"`

**If you see `DROP COLUMN` against `orders` or `order_items`, stop and report
BLOCKED.** Dropping `order_number` or `factory_order_number` would destroy every
existing order number in production. The expected output contains no `DROP
COLUMN` at all — only the one `DROP INDEX` listed above.

- [ ] **Step 6b: Create the mold placeholder product in the migration**

Append to the same `migration.sql`. The product must exist before anyone can quote
a mold, and seeding it here means dev and production get it identically.

```sql
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
```

The column names above are verified against `prisma/schema.prisma:171-196`:
`product_categories.sku_prefix`, `product_subcategories.sku_code`,
`product_subcategories.category_id`. The dev database has category `cat_sil`
(`skuPrefix: 'SIL'`) with subcategory `sub_sil_thf` (`skuCode: 'THF'`).

The statement selects the category by `sku_prefix` rather than hardcoding
`cat_sil`, because production may have different generated IDs. After applying,
verify a row came back:

```bash
node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.product.findUnique({where:{sku:'SIL-THF-NEWMOLD'}}).then(r=>{console.log(r);return p.\$disconnect()})"
```

Expected: a product with `requiresLineSpecs: true` and a non-null `categoryId`.
If it prints `null`, the silicone category is missing — create it through the
Products UI, then re-run the INSERT.

- [ ] **Step 7: Apply it locally and record it as applied**

Again, **not** `migrate dev`. Execute the file directly, then tell Prisma's
migration history it has been applied, so `migrate deploy` will not try to
re-run it later:

```bash
npx prisma db execute --schema prisma/schema.prisma --file prisma/migrations/20260727000000_order_quotation_stage/migration.sql
npx prisma migrate resolve --schema prisma/schema.prisma --applied 20260727000000_order_quotation_stage
npx prisma generate --schema prisma/schema.prisma
```

If `db execute` fails partway, the migration is half-applied — report BLOCKED with
the exact error and the statement it failed on. Do **not** re-run the file from
the top; re-running `ADD COLUMN` will error on the columns that already landed.

Then verify the data with a real query:

```bash
node -e "
const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();
(async()=>{
  const byStatus=await p.order.groupBy({by:['status'],_count:true});
  console.log('orders by status:',JSON.stringify(byStatus));
  const stale=await p.orderStatusHistory.count({where:{OR:[{oldStatus:'NEW'},{newStatus:'NEW'}]}});
  console.log('stale NEW history rows:',stale);
  console.log('placeholder:',await p.product.findUnique({where:{sku:'SIL-THF-NEWMOLD'},select:{id:true,nameEn:true,requiresLineSpecs:true,categoryId:true,subcategoryId:true}}));
  await p.\$disconnect();
})()"
```

Expected: **no `NEW` bucket** in the status counts, `stale NEW history rows: 0`,
and a placeholder product with `requiresLineSpecs: true` and non-null category
and subcategory ids. Paste this output into your report.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): quotation stage schema, per-line pricing, order_quotations"
```

---

## Task 5: Order creation produces a quotation

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts:127-226` (`getNextOrderNumber`, `getNextFactoryOrderNumber`, `create`)
- Test: `apps/api/src/orders/__tests__/orders.service.spec.ts` (create)

**Interfaces:**
- Consumes: `nextSequenceNumber` (Task 3), `buildQuotationDefaults` (Task 3), Prisma types (Task 4)
- Produces: `OrdersService.create(dto, userId)` where `dto.items` entries now accept `{ productId: string; quantity: number; unitPrice?: number; unitLabel?: string; description?: string }`. Task 9's wizard sends exactly this shape.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/orders/__tests__/orders.service.spec.ts`:

```ts
import { OrdersService } from '../orders.service';

type Mock = jest.Mock;

function createPrismaMock() {
  const mock: Record<string, any> = {
    customer: { findUnique: jest.fn() },
    order: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    orderItem: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    orderCost: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
    orderQuotation: { findUnique: jest.fn(), update: jest.fn() },
    orderStatusHistory: { create: jest.fn() },
    product: { findUnique: jest.fn(), update: jest.fn() },
    customerProduct: { upsert: jest.fn() },
    file: { findMany: jest.fn().mockResolvedValue([]) },
  };
  // Supports both the array form and the callback form of $transaction.
  mock.$transaction = jest.fn((arg: unknown) =>
    Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(mock),
  );
  return mock;
}

function createService(prisma: Record<string, any>) {
  const ws = { emit: jest.fn() };
  return {
    service: new OrdersService(prisma as never, ws as never),
    ws,
  };
}

describe('OrdersService.create', () => {
  it('creates an unconfirmed quotation without burning order numbers or stock', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1',
      customerCode: 'ACME',
      name: 'Acme Dates',
      city: 'Dammam',
      contacts: [{ name: 'Khaled', phone: '0500000000' }],
    });
    prisma.order.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'o1', ...data }),
    );
    const { service } = createService(prisma);

    await service.create(
      {
        orderType: 'NEW_MOLD',
        customerId: 'c1',
        items: [{ productId: 'p1', quantity: 2, unitPrice: 10 }],
      },
      'u1',
    );

    const data = (prisma.order.create as Mock).mock.calls[0][0].data;
    expect(data.status).toBe('QUOTATION');
    expect(data.quoteNumber).toMatch(/^QT-\d{4}-0001$/);
    expect(data.orderNumber).toBeUndefined();
    expect(data.factoryOrderNumber).toBeUndefined();

    // A quotation is not a commitment: stock must not move.
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('links every ordered product to the customer automatically', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1', customerCode: 'ACME', name: 'Acme', city: null, contacts: [],
    });
    prisma.order.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'o1', ...data }),
    );
    const { service } = createService(prisma);

    await service.create(
      {
        orderType: 'REPEAT',
        customerId: 'c1',
        items: [
          { productId: 'p1', quantity: 1, unitPrice: 5 },
          { productId: 'p2', quantity: 3, unitPrice: 7 },
        ],
      },
      'u1',
    );

    expect(prisma.customerProduct.upsert).toHaveBeenCalledTimes(2);
    const linked = (prisma.customerProduct.upsert as Mock).mock.calls.map(
      (c) => c[0].create.productId,
    );
    expect(linked.sort()).toEqual(['p1', 'p2']);
  });

  it('stores the per-line price, unit and description', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1', customerCode: 'ACME', name: 'Acme', city: null, contacts: [],
    });
    prisma.order.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'o1', ...data }),
    );
    const { service } = createService(prisma);

    await service.create(
      {
        orderType: 'REPEAT',
        customerId: 'c1',
        items: [
          { productId: 'p1', quantity: 4, unitPrice: 12.5, unitLabel: 'كرتون', description: 'Custom tray' },
        ],
      },
      'u1',
    );

    const [line] = (prisma.order.create as Mock).mock.calls[0][0].data.items.create;
    expect(line.unitPrice).toBe(12.5);
    expect(line.unitLabel).toBe('كرتون');
    expect(line.description).toBe('Custom tray');
    expect(line.orderIndex).toBe(0);
  });

  it('stores per-line mold specs and allows the same product on several lines', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1', customerCode: 'ACME', name: 'Acme', city: null, contacts: [],
    });
    prisma.order.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'o1', ...data }),
    );
    const { service } = createService(prisma);

    await service.create(
      {
        orderType: 'NEW_MOLD',
        customerId: 'c1',
        items: [
          { productId: 'mold', quantity: 1, unitPrice: 900, specs: { machine: 'MV', capacity: '6K', grams: '250', pattern: 'Rose' } },
          { productId: 'mold', quantity: 1, unitPrice: 950, specs: { machine: 'HI', capacity: '4K', grams: '500', pattern: 'Star' } },
        ],
      },
      'u1',
    );

    const lines = (prisma.order.create as Mock).mock.calls[0][0].data.items.create;
    expect(lines).toHaveLength(2);
    expect(lines[0].specs).toEqual({ machine: 'MV', capacity: '6K', grams: '250', pattern: 'Rose' });
    expect(lines[1].specs.pattern).toBe('Star');
    expect(lines[0].orderIndex).toBe(0);
    expect(lines[1].orderIndex).toBe(1);
  });

  it('refuses a non-positive quantity or a negative price', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1', customerCode: 'ACME', name: 'Acme', city: null, contacts: [],
    });
    const { service } = createService(prisma);

    await expect(
      service.create(
        { orderType: 'REPEAT', customerId: 'c1', items: [{ productId: 'p1', quantity: 0, unitPrice: 5 }] },
        'u1',
      ),
    ).rejects.toThrow(/at least 1/i);

    await expect(
      service.create(
        { orderType: 'REPEAT', customerId: 'c1', items: [{ productId: 'p1', quantity: 1, unitPrice: -5 }] },
        'u1',
      ),
    ).rejects.toThrow(/negative/i);

    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('seeds the quotation header from the customer', async () => {
    const prisma = createPrismaMock();
    prisma.customer.findUnique.mockResolvedValue({
      id: 'c1',
      customerCode: 'ACME',
      name: 'Acme Dates',
      city: 'Dammam',
      contacts: [{ name: 'Khaled', phone: '0500000000' }],
    });
    prisma.order.create.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ id: 'o1', ...data }),
    );
    const { service } = createService(prisma);

    await service.create(
      { orderType: 'REPEAT', customerId: 'c1', items: [{ productId: 'p1', quantity: 1, unitPrice: 1 }] },
      'u1',
    );

    const quote = (prisma.order.create as Mock).mock.calls[0][0].data.quotation.create;
    expect(quote.clientBlock).toBe('Acme Dates\nDammam');
    expect(quote.contact).toBe('0500000000');
    expect(quote.attn).toBe('Khaled');
    expect(quote.validUntil).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
npm -w apps/api run test -- orders.service
```

Expected: FAIL — `data.status` is `'NEW'`, `quoteNumber` is undefined, `product.update` was called.

- [ ] **Step 3: Rewrite the number helpers**

In `apps/api/src/orders/orders.service.ts`, add to the imports at the top:

```ts
import { nextSequenceNumber } from './sequence';
import { buildQuotationDefaults } from './quotation-defaults';
import { computeQuotationTotals } from './quotation-totals';
```

Replace `getNextOrderNumber` and `getNextFactoryOrderNumber` (lines 127–151) with:

```ts
  private async getNextQuoteNumber(): Promise<string> {
    const prefix = `QT-${new Date().getFullYear()}-`;
    const last = await this.prisma.order.findFirst({
      where: { quoteNumber: { startsWith: prefix } },
      orderBy: { quoteNumber: 'desc' },
      select: { quoteNumber: true },
    });
    return nextSequenceNumber(prefix, last?.quoteNumber ?? null);
  }

  private async getNextOrderNumber(): Promise<string> {
    const prefix = `ORD-${new Date().getFullYear()}-`;
    const last = await this.prisma.order.findFirst({
      where: { orderNumber: { startsWith: prefix } },
      orderBy: { orderNumber: 'desc' },
      select: { orderNumber: true },
    });
    return nextSequenceNumber(prefix, last?.orderNumber ?? null);
  }

  private async getNextFactoryOrderNumber(customerCode: string): Promise<string> {
    const prefix = `FO-${new Date().getFullYear()}-${customerCode}-`;
    const last = await this.prisma.order.findFirst({
      where: { factoryOrderNumber: { startsWith: prefix } },
      orderBy: { factoryOrderNumber: 'desc' },
      select: { factoryOrderNumber: true },
    });
    return nextSequenceNumber(prefix, last?.factoryOrderNumber ?? null);
  }
```

- [ ] **Step 4: Rewrite `create`**

Replace the whole `create` method (lines 153–226) with:

```ts
  async create(
    dto: {
      orderType: string;
      customerId: string;
      items: {
        productId: string;
        quantity: number;
        unitPrice?: number;
        unitLabel?: string;
        description?: string;
        specs?: Record<string, string> | null;
      }[];
      expectedDeliveryDate?: string;
      assignedUserId?: string | null;
      internalNotes?: string;
    },
    userId: string,
  ) {
    if (!dto.items?.length) {
      throw new BadRequestException('At least one item is required');
    }

    // Money guard: computeQuotationTotals multiplies these straight through, so
    // a negative slipping in would print a negative line on a customer quotation
    // and be written to the order's selling price.
    for (const item of dto.items) {
      if (!Number.isFinite(item.quantity) || item.quantity < 1) {
        throw new BadRequestException('Quantity must be at least 1');
      }
      if (item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice < 0) {
        throw new BadRequestException('Unit price cannot be negative');
      }
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: dto.customerId },
      include: { contacts: { take: 1 } },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const quoteNumber = await this.getNextQuoteNumber();
    const primaryContact = customer.contacts?.[0] ?? null;
    const defaults = buildQuotationDefaults({
      customerName: customer.name,
      customerCity: customer.city ?? null,
      contactName: primaryContact?.name ?? null,
      contactPhone: primaryContact?.phone ?? null,
      quoteDate: new Date(),
    });

    // No orderNumber / factoryOrderNumber and no stock movement: this is a
    // quotation, not a commitment. Both happen in changeStatus on CONFIRMED.
    const order = await this.prisma.order.create({
      data: {
        orderType: dto.orderType,
        customerId: dto.customerId,
        quoteNumber,
        status: 'QUOTATION',
        ...(dto.expectedDeliveryDate
          ? { expectedDeliveryDate: new Date(dto.expectedDeliveryDate) }
          : {}),
        ...(dto.assignedUserId ? { assignedUserId: dto.assignedUserId } : {}),
        ...(dto.internalNotes ? { internalNotes: dto.internalNotes } : {}),
        items: {
          create: dto.items.map((item, index) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice ?? null,
            ...(item.unitLabel ? { unitLabel: item.unitLabel } : {}),
            description: item.description ?? null,
            orderIndex: index,
            ...(item.specs ? { specs: item.specs } : {}),
          })),
        },
        quotation: {
          create: {
            quoteDate: defaults.quoteDate,
            validUntil: defaults.validUntil,
            clientBlock: defaults.clientBlock,
            contact: defaults.contact,
            attn: defaults.attn,
          },
        },
      },
      include: {
        customer: true,
        product: true,
        factory: true,
        assignedUser: { select: { id: true, name: true, email: true, role: true } },
        items: { include: { product: { include: { factory: true } } } },
        quotation: true,
      },
    });

    // Linking the product to the customer stays here, at order placement:
    // it drives the "Suggested — Previously ordered" list, and a customer who
    // asked for a price should see that product suggested next time.
    for (const item of dto.items) {
      await this.prisma.customerProduct.upsert({
        where: {
          customerId_productId: {
            customerId: dto.customerId,
            productId: item.productId,
          },
        },
        create: { customerId: dto.customerId, productId: item.productId },
        update: {},
      });
    }

    this.wsGateway.emit('order.created', order);
    return order;
  }
```

- [ ] **Step 5: Add `quotation` to the `getById` include**

In `getById` (line ~105), add `quotation: true,` to the `include` block, after `costs: true,`.

- [ ] **Step 6: Run the tests**

```bash
npm -w apps/api run test -- orders.service
```

Expected: PASS, 4 tests.

- [ ] **Step 7: Typecheck against the baseline**

```bash
npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | tail -20
```

Expected: no output at all. Zero errors is the bar.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/orders
git commit -m "feat(orders): create orders as unconfirmed quotations"
```

---

## Task 6: Confirming a quotation

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts` (`changeStatus`)
- Test: `apps/api/src/orders/__tests__/orders.service.spec.ts` (append)

**Interfaces:**
- Consumes: `computeQuotationTotals` (Task 2), `nextSequenceNumber` and `findIncompleteSpecLines` (Task 3)
- Produces: `changeStatus` unchanged signature; on `CONFIRMED` it validates mold specs, assigns numbers, sets `confirmedAt`, decrements stock and upserts the `SELLING_PRICE` cost.

Add `findIncompleteSpecLines` to the imports at the top of `orders.service.ts`:

```ts
import { findIncompleteSpecLines } from './mold-specs';
```

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/orders/__tests__/orders.service.spec.ts`:

```ts
function quotationOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'o1',
    orderType: 'NEW_MOLD',
    status: 'QUOTATION',
    customerId: 'c1',
    orderNumber: null,
    factoryOrderNumber: null,
    customer: { id: 'c1', customerCode: 'ACME', name: 'Acme' },
    items: [
      {
        id: 'i1',
        productId: 'p1',
        quantity: 2,
        unitPrice: 100,
        specs: null,
        product: { nameEn: 'Tray 500g', requiresLineSpecs: false },
      },
    ],
    quotation: {
      discountAmount: 0,
      vatEnabled: true,
      vatPercent: 15,
    },
    ...overrides,
  };
}

const moldLine = (specs: unknown, id = 'm1') => ({
  id,
  productId: 'mold',
  quantity: 1,
  unitPrice: 900,
  specs,
  product: { nameEn: 'New Mold — Silicone Thermoforming', requiresLineSpecs: true },
});

describe('OrdersService.changeStatus — confirming', () => {
  function setup(order = quotationOrder()) {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(order);
    prisma.order.update.mockImplementation(({ data }: { data: any }) =>
      Promise.resolve({ ...order, ...data }),
    );
    prisma.product.findUnique.mockResolvedValue({ inventory: 10 });
    return { prisma, ...createService(prisma) };
  }

  it('assigns the order and factory numbers on confirmation', async () => {
    const { prisma, service } = setup();

    await service.changeStatus('o1', 'CONFIRMED', 'u1');

    const data = (prisma.order.update as Mock).mock.calls[0][0].data;
    expect(data.orderNumber).toMatch(/^ORD-\d{4}-0001$/);
    expect(data.factoryOrderNumber).toMatch(/^FO-\d{4}-ACME-0001$/);
    expect(data.confirmedAt).toBeInstanceOf(Date);
  });

  it('decrements stock only once the customer commits', async () => {
    const { prisma, service } = setup();

    await service.changeStatus('o1', 'CONFIRMED', 'u1');

    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: { inventory: { decrement: 2 } },
      }),
    );
  });

  it('never drives inventory negative', async () => {
    const { prisma, service } = setup();
    prisma.product.findUnique.mockResolvedValue({ inventory: 1 });

    await service.changeStatus('o1', 'CONFIRMED', 'u1');

    expect(prisma.product.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { inventory: { decrement: 1 } } }),
    );
  });

  it('records the quote grand total as the selling price', async () => {
    const { prisma, service } = setup();

    await service.changeStatus('o1', 'CONFIRMED', 'u1');

    // 2 × 100 = 200, +15% VAT = 230
    expect(prisma.orderCost.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          orderId: 'o1',
          costType: 'SELLING_PRICE',
          amount: 230,
          currency: 'SAR',
        }),
      }),
    );
  });

  it('updates rather than duplicates an existing selling price', async () => {
    const { prisma, service } = setup();
    prisma.orderCost.findFirst.mockResolvedValue({ id: 'cost1' });

    await service.changeStatus('o1', 'CONFIRMED', 'u1');

    expect(prisma.orderCost.create).not.toHaveBeenCalled();
    expect(prisma.orderCost.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'cost1' },
        data: expect.objectContaining({ amount: 230 }),
      }),
    );
  });

  it('leaves numbers and stock alone for every other transition', async () => {
    const { prisma, service } = setup(
      quotationOrder({
        status: 'CONFIRMED',
        orderNumber: 'ORD-2026-0001',
        factoryOrderNumber: 'FO-2026-ACME-0001',
      }),
    );

    await service.changeStatus('o1', 'SAMPLE_RECEIVED', 'u1');

    const data = (prisma.order.update as Mock).mock.calls[0][0].data;
    expect(data.orderNumber).toBeUndefined();
    expect(prisma.product.update).not.toHaveBeenCalled();
    expect(prisma.orderCost.create).not.toHaveBeenCalled();
  });

  it('refuses to confirm a mold line that is missing specs', async () => {
    const { prisma, service } = setup(
      quotationOrder({ items: [moldLine({ machine: 'MV', capacity: '6K' })] }),
    );

    await expect(service.changeStatus('o1', 'CONFIRMED', 'u1')).rejects.toThrow(
      /grams/,
    );
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });

  it('confirms a mold line once all four specs are set', async () => {
    const { prisma, service } = setup(
      quotationOrder({
        items: [moldLine({ machine: 'MV', capacity: '6K', grams: '250', pattern: 'Rose' })],
      }),
    );

    await service.changeStatus('o1', 'CONFIRMED', 'u1');

    expect((prisma.order.update as Mock).mock.calls[0][0].data.orderNumber).toMatch(
      /^ORD-\d{4}-0001$/,
    );
  });

  it('does not demand specs from ordinary products', async () => {
    const { prisma, service } = setup();

    await service.changeStatus('o1', 'CONFIRMED', 'u1');

    expect(prisma.order.update).toHaveBeenCalled();
  });

  it('lets an incomplete mold quotation still be rejected', async () => {
    const { prisma, service } = setup(
      quotationOrder({ items: [moldLine(null)] }),
    );

    await service.changeStatus('o1', 'REJECTED', 'u1');

    expect((prisma.order.update as Mock).mock.calls[0][0].data.status).toBe('REJECTED');
  });

  it('rejects a quotation without assigning anything', async () => {
    const { prisma, service } = setup();

    await service.changeStatus('o1', 'REJECTED', 'u1');

    const data = (prisma.order.update as Mock).mock.calls[0][0].data;
    expect(data.status).toBe('REJECTED');
    expect(data.orderNumber).toBeUndefined();
    expect(prisma.product.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npm -w apps/api run test -- orders.service
```

Expected: the seven new tests fail.

- [ ] **Step 3: Rewrite `changeStatus`**

Replace the whole `changeStatus` method with:

```ts
  async changeStatus(
    id: string,
    newStatus: string,
    userId: string,
    note?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        product: true,
        factory: true,
        assignedUser: true,
        items: {
          orderBy: { orderIndex: 'asc' },
          include: {
            product: { select: { nameEn: true, requiresLineSpecs: true } },
          },
        },
        quotation: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (!isValidTransition(order.orderType, order.status, newStatus)) {
      throw new BadRequestException(
        `Invalid status transition from ${order.status} to ${newStatus}`,
      );
    }

    const isConfirming = newStatus === 'CONFIRMED';

    // A mold cannot be cut without all four specs. Quotations may be saved
    // incomplete while pricing; confirmation is where it has to be complete.
    if (isConfirming) {
      const incomplete = findIncompleteSpecLines(
        order.items.map((item, index) => ({
          index,
          requiresLineSpecs: item.product.requiresLineSpecs,
          specs: item.specs,
        })),
      );
      if (incomplete.length > 0) {
        const detail = incomplete
          .map((l) => `line ${l.index + 1} (missing ${l.missing.join(', ')})`)
          .join('; ');
        throw new BadRequestException(
          `Cannot confirm: mold specifications are incomplete — ${detail}`,
        );
      }
    }

    // Everything a quotation deliberately deferred happens here, and only here.
    const confirmationData: Record<string, unknown> = {};
    let sellingPrice = 0;
    if (isConfirming) {
      const [orderNumber, factoryOrderNumber] = await Promise.all([
        this.getNextOrderNumber(),
        this.getNextFactoryOrderNumber(order.customer.customerCode),
      ]);
      confirmationData.orderNumber = orderNumber;
      confirmationData.factoryOrderNumber = factoryOrderNumber;
      confirmationData.confirmedAt = new Date();

      sellingPrice = computeQuotationTotals({
        lines: order.items.map((item) => ({
          quantity: item.quantity,
          unitPrice: item.unitPrice === null ? null : Number(item.unitPrice),
        })),
        discountAmount: Number(order.quotation?.discountAmount ?? 0),
        vatEnabled: order.quotation?.vatEnabled ?? true,
        vatPercent: Number(order.quotation?.vatPercent ?? 15),
      }).grandTotal;
    }

    // One transaction: a half-confirmed order — numbered but with no selling
    // price, or stock moved but status unchanged — would corrupt the books.
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id },
        data: {
          status: newStatus,
          ...confirmationData,
          ...(newStatus === 'COMPLETED' ? { completedAt: new Date() } : {}),
        },
        include: {
          customer: true,
          product: true,
          factory: true,
          assignedUser: { select: { id: true, name: true, email: true, role: true } },
          items: { include: { product: { include: { factory: true } } } },
          quotation: true,
        },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          oldStatus: order.status,
          newStatus,
          changedBy: userId,
          note,
        },
      });

      if (isConfirming) {
        for (const item of order.items) {
          const product = await tx.product.findUnique({
            where: { id: item.productId },
            select: { inventory: true },
          });
          if (product && product.inventory > 0) {
            await tx.product.update({
              where: { id: item.productId },
              data: {
                inventory: { decrement: Math.min(item.quantity, product.inventory) },
              },
            });
          }
        }

        // Revenue in Reports and Analytics is the SELLING_PRICE cost row
        // (analytics/lib/sales.ts). Derive it so the price is entered once.
        const existing = await tx.orderCost.findFirst({
          where: { orderId: id, costType: 'SELLING_PRICE' },
        });
        if (existing) {
          await tx.orderCost.update({
            where: { id: existing.id },
            data: { amount: sellingPrice, currency: 'SAR' },
          });
        } else {
          await tx.orderCost.create({
            data: {
              orderId: id,
              costType: 'SELLING_PRICE',
              amount: sellingPrice,
              currency: 'SAR',
              createdBy: userId,
            },
          });
        }
      }

      return result;
    });

    this.wsGateway.emit('order.status_changed', {
      order: updated,
      oldStatus: order.status,
      newStatus,
    });
    return updated;
  }
```

- [ ] **Step 4: Run the tests**

```bash
npm -w apps/api run test
```

Expected: PASS across the whole API suite (workflow, totals, sequence, service, analytics).

- [ ] **Step 5: Fix the analytics fixtures**

`apps/api/src/analytics/lib/__tests__/operations.spec.ts` uses `newStatus: 'NEW'` on lines 6, 18, 26 and 27, and asserts `r.status === 'NEW'` on line 10. Replace every `'NEW'` in that file with `'CONFIRMED'` and rename the local `const New` on line 10 to `const confirmed`, updating its usages. Then:

```bash
npm -w apps/api run test -- operations
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src
git commit -m "feat(orders): confirmation assigns numbers, moves stock, records selling price"
```

---

## Task 7: Quotation read and write endpoints

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts` (add two methods), `apps/api/src/orders/orders.controller.ts:250` (add two routes)
- Test: `apps/api/src/orders/__tests__/orders.service.spec.ts` (append)

**Interfaces:**
- Consumes: `computeQuotationTotals` (Task 2)
- Produces:
  - `GET /api/v1/orders/:id/quotation` → `QuotationView`
  - `PATCH /api/v1/orders/:id/quotation` → `QuotationView`
  - `QuotationView = { orderId, quoteNumber, orderNumber, status, quoteDate, validUntil, payMethod, clientBlock, contact, attn, notes, discountAmount, vatEnabled, vatPercent, language, customerName, lines: QuotationLine[], totals: QuotationTotals }`
  - `QuotationLine = { id, description, productName, requiresLineSpecs, specs: Record<string,string> | null, quantity, unitLabel, unitPrice, lineTotal }`

Add `formatSpecs` to the `./mold-specs` import in `orders.service.ts`.

Task 10's page consumes this exact shape.

- [ ] **Step 1: Write the failing tests**

Append to `apps/api/src/orders/__tests__/orders.service.spec.ts`:

```ts
import { ConflictException } from '@nestjs/common';

describe('OrdersService quotation endpoints', () => {
  const fullOrder = {
    id: 'o1',
    quoteNumber: 'QT-2026-0001',
    orderNumber: null,
    status: 'QUOTATION',
    customer: { name: 'Acme Dates' },
    items: [
      { id: 'i1', quantity: 2, unitPrice: 100, unitLabel: 'عدد', description: null, orderIndex: 0, specs: null, product: { nameEn: 'Tray 500g', nameAr: null, requiresLineSpecs: false } },
    ],
    quotation: {
      quoteDate: new Date('2026-07-27'),
      validUntil: new Date('2026-08-10'),
      payMethod: 'نقداً / تحويل بنكي',
      clientBlock: 'Acme Dates\nDammam',
      contact: '0500000000',
      attn: 'Khaled',
      notes: null,
      discountAmount: 0,
      vatEnabled: true,
      vatPercent: 15,
      language: 'ar',
    },
  };

  it('returns the lines with server-computed totals', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    const { service } = createService(prisma);

    const view = await service.getQuotation('o1');

    expect(view.quoteNumber).toBe('QT-2026-0001');
    expect(view.lines[0].lineTotal).toBe(200);
    expect(view.totals.grandTotal).toBe(230);
  });

  it('falls back to the product name when a line has no description', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    const { service } = createService(prisma);

    const view = await service.getQuotation('o1');

    expect(view.lines[0].description).toBe('Tray 500g');
  });

  it('appends the specs to a mold line description', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue({
      ...fullOrder,
      items: [
        {
          id: 'm1', quantity: 1, unitPrice: 900, unitLabel: 'عدد',
          description: null, orderIndex: 0,
          specs: { machine: 'MV', capacity: '6K', grams: '250', pattern: 'Rose' },
          product: { nameEn: 'New Mold — Silicone Thermoforming', nameAr: null, requiresLineSpecs: true },
        },
      ],
    });
    const { service } = createService(prisma);

    const view = await service.getQuotation('o1');

    expect(view.lines[0].description).toBe(
      'New Mold — Silicone Thermoforming\nMV · 6K · 250 · Rose',
    );
    expect(view.lines[0].requiresLineSpecs).toBe(true);
    expect(view.lines[0].specs).toEqual({ machine: 'MV', capacity: '6K', grams: '250', pattern: 'Rose' });
  });

  it('lets an explicit description override the spec label', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue({
      ...fullOrder,
      items: [
        {
          id: 'm1', quantity: 1, unitPrice: 900, unitLabel: 'عدد',
          description: 'Ramadan crescent mold', orderIndex: 0,
          specs: { machine: 'MV', capacity: '6K', grams: '250', pattern: 'Rose' },
          product: { nameEn: 'New Mold — Silicone Thermoforming', nameAr: null, requiresLineSpecs: true },
        },
      ],
    });
    const { service } = createService(prisma);

    expect((await service.getQuotation('o1')).lines[0].description).toBe(
      'Ramadan crescent mold',
    );
  });

  it('refuses a quantity below one', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    const { service } = createService(prisma);

    await expect(
      service.updateQuotation('o1', { lines: [{ id: 'i1', quantity: 0 }] }),
    ).rejects.toThrow(/at least 1/i);
    expect(prisma.orderItem.update).not.toHaveBeenCalled();
  });

  it('refuses a negative unit price', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    const { service } = createService(prisma);

    await expect(
      service.updateQuotation('o1', { lines: [{ id: 'i1', unitPrice: -5 }] }),
    ).rejects.toThrow(/non-negative/i);

    await expect(
      service.updateQuotation('o1', { lines: [{ id: 'i1', unitPrice: NaN }] }),
    ).rejects.toThrow(/non-negative/i);
  });

  it('saves per-line spec edits', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    const { service } = createService(prisma);

    await service.updateQuotation('o1', {
      lines: [{ id: 'i1', specs: { machine: 'HI', capacity: '4K', grams: '500', pattern: 'Star' } }],
    });

    expect(prisma.orderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'i1' },
        data: expect.objectContaining({
          specs: { machine: 'HI', capacity: '4K', grams: '500', pattern: 'Star' },
        }),
      }),
    );
  });

  it('refuses to edit a quotation once the order is confirmed', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue({ ...fullOrder, status: 'CONFIRMED' });
    const { service } = createService(prisma);

    await expect(
      service.updateQuotation('o1', { discountAmount: 50 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('saves header edits while still a quotation', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    const { service } = createService(prisma);

    await service.updateQuotation('o1', { discountAmount: 50, notes: 'Deposit 50%' });

    expect(prisma.orderQuotation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId: 'o1' },
        data: expect.objectContaining({ discountAmount: 50, notes: 'Deposit 50%' }),
      }),
    );
  });

  it('saves per-line price edits', async () => {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue(fullOrder);
    const { service } = createService(prisma);

    await service.updateQuotation('o1', {
      lines: [{ id: 'i1', unitPrice: 120, quantity: 3, unitLabel: 'كرتون', description: 'Custom' }],
    });

    expect(prisma.orderItem.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'i1' },
        data: expect.objectContaining({ unitPrice: 120, quantity: 3 }),
      }),
    );
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npm -w apps/api run test -- orders.service
```

Expected: FAIL — `service.getQuotation is not a function`.

- [ ] **Step 3: Add the service methods**

Add `ConflictException` to the `@nestjs/common` import list at the top of `orders.service.ts`, then add these two methods at the end of the class, before the closing brace:

```ts
  async getQuotation(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        quotation: true,
        items: {
          orderBy: { orderIndex: 'asc' },
          include: { product: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const q = order.quotation;
    const discountAmount = Number(q?.discountAmount ?? 0);
    const vatEnabled = q?.vatEnabled ?? true;
    const vatPercent = Number(q?.vatPercent ?? 15);

    const totals = computeQuotationTotals({
      lines: order.items.map((item) => ({
        quantity: item.quantity,
        unitPrice: item.unitPrice === null ? null : Number(item.unitPrice),
      })),
      discountAmount,
      vatEnabled,
      vatPercent,
    });

    return {
      orderId: order.id,
      quoteNumber: order.quoteNumber,
      orderNumber: order.orderNumber,
      status: order.status,
      quoteDate: q?.quoteDate ?? null,
      validUntil: q?.validUntil ?? null,
      payMethod: q?.payMethod ?? '',
      clientBlock: q?.clientBlock ?? order.customer.name,
      contact: q?.contact ?? null,
      attn: q?.attn ?? null,
      notes: q?.notes ?? null,
      discountAmount,
      vatEnabled,
      vatPercent,
      language: q?.language ?? 'ar',
      customerName: order.customer.name,
      lines: order.items.map((item, index) => {
        const specLabel = formatSpecs(item.specs);
        return {
          id: item.id,
          // An explicit override wins; otherwise a mold line shows its specs
          // under the product name so the customer sees what is being quoted.
          description:
            item.description ??
            (specLabel ? `${item.product.nameEn}\n${specLabel}` : item.product.nameEn),
          productName: item.product.nameEn,
          requiresLineSpecs: item.product.requiresLineSpecs,
          specs: (item.specs ?? null) as Record<string, string> | null,
          quantity: item.quantity,
          unitLabel: item.unitLabel,
          unitPrice: item.unitPrice === null ? null : Number(item.unitPrice),
          lineTotal: totals.lineTotals[index],
        };
      }),
      totals,
    };
  }

  async updateQuotation(
    id: string,
    dto: Partial<{
      quoteDate: string;
      validUntil: string | null;
      payMethod: string;
      clientBlock: string;
      contact: string | null;
      attn: string | null;
      notes: string | null;
      discountAmount: number;
      vatEnabled: boolean;
      vatPercent: number;
      language: string;
      lines: {
        id: string;
        quantity?: number;
        unitPrice?: number | null;
        unitLabel?: string;
        description?: string | null;
        specs?: Record<string, string> | null;
      }[];
    }>,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!order) throw new NotFoundException('Order not found');

    // A quote that has been sent and accepted must not change under the customer.
    if (order.status !== 'QUOTATION') {
      throw new ConflictException(
        'This quotation is locked because the order is already confirmed',
      );
    }

    const { lines, quoteDate, validUntil, ...rest } = dto;

    const headerData: Record<string, unknown> = { ...rest };
    if (quoteDate !== undefined) headerData.quoteDate = new Date(quoteDate);
    if (validUntil !== undefined) {
      headerData.validUntil = validUntil ? new Date(validUntil) : null;
    }

    if (Object.keys(headerData).length > 0) {
      await this.prisma.orderQuotation.update({
        where: { orderId: id },
        data: headerData,
      });
    }

    for (const line of lines ?? []) {
      const { id: lineId, ...lineData } = line;
      if (Object.keys(lineData).length === 0) continue;

      // Same money guard as create(): these feed computeQuotationTotals directly.
      if (lineData.quantity !== undefined) {
        if (!Number.isFinite(lineData.quantity) || lineData.quantity < 1) {
          throw new BadRequestException('Quantity must be at least 1');
        }
      }
      if (lineData.unitPrice !== undefined && lineData.unitPrice !== null) {
        // Number.isFinite, not just `< 0`: the controller casts the raw body
        // with no class-validator DTO, so NaN and Infinity can reach here and
        // would poison every downstream total.
        if (!Number.isFinite(lineData.unitPrice) || lineData.unitPrice < 0) {
          throw new BadRequestException('Unit price must be a non-negative number');
        }
      }

      await this.prisma.orderItem.update({
        where: { id: lineId },
        data: lineData,
      });
    }

    this.wsGateway.emit('order.updated', { orderId: id });
    return this.getQuotation(id);
  }
```

- [ ] **Step 3b: Stop merging quantities for placeholder products**

`addItem` (`orders.service.ts:371`) merges by `productId`, which would fold a
second mold into the first line's quantity — losing the second design. The DB
constraint that forced merging is gone (Task 4), so it becomes conditional.
Task 10's "add line" button calls this endpoint, so it must be right before then.

Replace the opening of `addItem` — the `existing` lookup and everything up to its
`if (existing)` — with:

```ts
  async addItem(orderId: string, dto: { productId: string; quantity: number }, userId: string) {
    const order = await this.getById(orderId);
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: { requiresLineSpecs: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    // A placeholder is a new design every time; ordinary products merge.
    const existing = product.requiresLineSpecs
      ? null
      : await this.prisma.orderItem.findFirst({
          where: { orderId, productId: dto.productId },
        });

    if (existing) {
```

The update branch and the `customerProduct` upsert are unchanged. In the create
branch, give the new line a trailing `orderIndex` so it prints last rather than
tying at position 0:

```ts
    const lineCount = await this.prisma.orderItem.count({ where: { orderId } });
    const item = await this.prisma.orderItem.create({
      data: {
        orderId,
        productId: dto.productId,
        quantity: dto.quantity,
        orderIndex: lineCount,
      },
      include: { product: { include: { factory: true } } },
    });
```

Add the covering test to `orders.service.spec.ts`:

```ts
describe('OrdersService.addItem', () => {
  function setupAdd(requiresLineSpecs: boolean) {
    const prisma = createPrismaMock();
    prisma.order.findUnique.mockResolvedValue({
      id: 'o1', customerId: 'c1', status: 'QUOTATION', items: [], costs: [], statusHistory: [],
    });
    prisma.product.findUnique.mockResolvedValue({ requiresLineSpecs });
    prisma.orderItem.findFirst.mockResolvedValue({ id: 'i1', quantity: 1 });
    prisma.orderItem.count = jest.fn().mockResolvedValue(2);
    prisma.orderItem.create.mockResolvedValue({ id: 'i2' });
    prisma.orderItem.update.mockResolvedValue({ id: 'i1', quantity: 2 });
    return { prisma, ...createService(prisma) };
  }

  it('merges an ordinary product into the existing line', async () => {
    const { prisma, service } = setupAdd(false);
    await service.addItem('o1', { productId: 'p1', quantity: 1 }, 'u1');
    expect(prisma.orderItem.update).toHaveBeenCalled();
    expect(prisma.orderItem.create).not.toHaveBeenCalled();
  });

  it('always starts a new line for a placeholder product', async () => {
    const { prisma, service } = setupAdd(true);
    await service.addItem('o1', { productId: 'mold', quantity: 1 }, 'u1');
    expect(prisma.orderItem.update).not.toHaveBeenCalled();
    expect(prisma.orderItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ productId: 'mold', orderIndex: 2 }),
      }),
    );
  });
});
```

- [ ] **Step 4: Add the controller routes**

In `apps/api/src/orders/orders.controller.ts`, add after the `getFactorySheet` method (line 250–253):

```ts
  @Get(':id/quotation')
  getQuotation(@Param('id') id: string) {
    return this.ordersService.getQuotation(id);
  }

  @Patch(':id/quotation')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('EDIT_ORDERS')
  @UseInterceptors(AuditInterceptor)
  @Audit('ORDER')
  updateQuotation(
    @Param('id') id: string,
    @Body() dto: Record<string, unknown>,
  ) {
    return this.ordersService.updateQuotation(
      id,
      dto as Parameters<OrdersService['updateQuotation']>[1],
    );
  }
```

Quotation prices are what the customer is told, not internal costs, so reading is gated only by `JwtAuthGuard` — do **not** add `VIEW_COSTS`.

- [ ] **Step 5: Run tests and typecheck**

```bash
npm -w apps/api run test
npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | tail -20
```

Expected: all tests PASS; `tsc` silent (zero errors).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/orders
git commit -m "feat(orders): quotation read and write endpoints"
```

---

## Task 8: Web status vocabulary

**Files:**
- Modify: `apps/web/src/lib/types.ts:1-12,60-81`, `apps/web/src/components/ui/badge.tsx:6-17`, `apps/web/src/app/(dashboard)/reports/page.tsx:38`

**Interfaces:**
- Produces: `OrderStatus.QUOTATION | CONFIRMED | REJECTED`, updated `NEW_MOLD_FLOW` / `REPEAT_FLOW`, `ORDER_STATUS_VARIANTS` keys. Tasks 9–11 depend on these.

No test runner in `apps/web` — verification is `tsc` plus running the app.

- [ ] **Step 1: Update the status enum and flows**

In `apps/web/src/lib/types.ts`, replace line 2 (`NEW = 'NEW',`) with:

```ts
  QUOTATION = 'QUOTATION',
  CONFIRMED = 'CONFIRMED',
```

Then add `REJECTED = 'REJECTED',` as the last member of the enum, after `COMPLETED`.

Replace the `'NEW',` entry at the head of `NEW_MOLD_FLOW` (line 61) and of `REPEAT_FLOW` (line 74) with:

```ts
  'QUOTATION',
  'CONFIRMED',
```

`REJECTED` is off-flow — it belongs in the enum but in **neither** flow array, or the detail page would offer it as a next step from every status.

- [ ] **Step 2: Add the badge colours**

In `apps/web/src/components/ui/badge.tsx`, replace line 7 (`NEW: 'bg-blue-100 text-blue-800',`) with:

```ts
  QUOTATION: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-blue-100 text-blue-800',
```

and add before the closing `} as const;`:

```ts
  REJECTED: 'bg-gray-200 text-gray-600',
```

- [ ] **Step 3: Add the report colours**

In `apps/web/src/app/(dashboard)/reports/page.tsx`, replace line 38 (`NEW: 'bg-blue-500',`) with:

```ts
  QUOTATION: 'bg-amber-500',
  CONFIRMED: 'bg-blue-500',
  REJECTED: 'bg-gray-400',
```

- [ ] **Step 4: Typecheck**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | tail -30
```

Expected: any errors point at `orderNumber` being `string` where the API now returns `string | null` — those are fixed in Task 11. Note them; do not fix anything else.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/types.ts apps/web/src/components/ui/badge.tsx "apps/web/src/app/(dashboard)/reports/page.tsx"
git commit -m "feat(web): add QUOTATION, CONFIRMED and REJECTED statuses"
```

---

## Task 9: Pricing step in the New Order wizard

**Files:**
- Modify: `apps/web/src/app/(dashboard)/orders/new/page.tsx`
- Create: `apps/web/src/lib/quotation-totals.ts`

**Interfaces:**
- Consumes: `POST /api/v1/orders` item shape from Task 5
- Produces: `computeQuotationTotals` in the web lib — a literal copy of `apps/api/src/orders/quotation-totals.ts`, used only for live display.

- [ ] **Step 1: Copy the totals function to the web app**

Create `apps/web/src/lib/quotation-totals.ts` as a **byte-for-byte copy** of `apps/api/src/orders/quotation-totals.ts`, replacing only the header comment with:

```ts
/**
 * Display-only copy of apps/api/src/orders/quotation-totals.ts (which is the
 * tested, authoritative version — apps/web has no test runner).
 * Used for optimistic totals while typing; every server response overwrites
 * these numbers, so a divergent copy self-corrects within one save.
 */
```

- [ ] **Step 2: Extend the wizard's item state**

In `apps/web/src/app/(dashboard)/orders/new/page.tsx`, replace the `OrderItem` interface (lines 112–115) with:

```ts
interface OrderLine {
  lineId: string;
  productId: string;
  productName: string;
  requiresLineSpecs: boolean;
  quantity: number;
  unitPrice: number | null;
  unitLabel: string;
  description: string;
  specs: Record<string, string>;
}
```

Lines are keyed by their own `lineId`, not by `productId`: the mold placeholder
appears once per design, so one product can occupy several lines.

Add `requiresLineSpecs: boolean;` to the `Product` interface (line 86) — the
products endpoint already returns every product column.

- [ ] **Step 3: Rework the add/update/remove helpers**

Replace `addItem`, `updateQuantity`, `removeItem` and `getQuantity` (lines 259–290) with:

```ts
  const addItem = (product: Product) => {
    setItemsError('');
    setOrderItems((prev) => {
      // Ordinary products merge into one line; a mold is a new design each time.
      if (!product.requiresLineSpecs) {
        const existing = prev.find((i) => i.productId === product.id);
        if (existing) {
          return prev.map((i) =>
            i.lineId === existing.lineId ? { ...i, quantity: i.quantity + 1 } : i,
          );
        }
      }
      return [
        ...prev,
        {
          lineId: crypto.randomUUID(),
          productId: product.id,
          productName: product.nameEn,
          requiresLineSpecs: product.requiresLineSpecs,
          quantity: 1,
          unitPrice: null,
          unitLabel: 'عدد',
          description: product.nameEn,
          specs: {},
        },
      ];
    });
  };

  const updateLine = (lineId: string, patch: Partial<OrderLine>) => {
    setOrderItems((prev) =>
      prev.map((i) => (i.lineId === lineId ? { ...i, ...patch } : i)),
    );
  };

  const updateSpec = (lineId: string, key: string, value: string) => {
    setOrderItems((prev) =>
      prev.map((i) =>
        i.lineId === lineId ? { ...i, specs: { ...i.specs, [key]: value } } : i,
      ),
    );
  };

  const updateQuantity = (productId: string, delta: number) => {
    setOrderItems((prev) =>
      prev
        .map((i) =>
          i.productId === productId && !i.requiresLineSpecs
            ? { ...i, quantity: Math.max(0, i.quantity + delta) }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  };

  const removeItem = (productId: string) => {
    setOrderItems((prev) => prev.filter((i) => i.productId !== productId));
  };

  const removeLine = (lineId: string) => {
    setOrderItems((prev) => prev.filter((i) => i.lineId !== lineId));
  };

  /** Total quantity of a product across its lines — drives the grid badge. */
  const getQuantity = (productId: string) =>
    orderItems
      .filter((i) => i.productId === productId)
      .reduce((sum, i) => sum + i.quantity, 0);
```

The product grid's `+`/`−` buttons and its `X` still key off `productId`, so their
JSX needs no change. For the mold placeholder the `−` is a no-op by design — mold
lines are removed individually in step 2, where you can see which design is which.
Change the grid's `onClick={() => !isSelected && addItem(product)}` (lines 562 and
665) to `onClick={() => (product.requiresLineSpecs || !isSelected) && addItem(product)}`
so clicking the mold card repeatedly adds a line each time.

Also change the `orderItems.length` summary bar (line 407) to keep reading
`orderItems.length` — with lines it now counts lines, which is what you want.

- [ ] **Step 4: Add the quote state**

After the `itemsError` state declaration (line 132), add:

```ts
  const [discountAmount, setDiscountAmount] = useState(0);
  const [vatEnabled, setVatEnabled] = useState(true);
  const [vatPercent, setVatPercent] = useState(15);
  const [validUntil, setValidUntil] = useState('');
  const [payMethod, setPayMethod] = useState('نقداً / تحويل بنكي');
  const [quoteNotes, setQuoteNotes] = useState('');
```

Add the import at the top of the file:

```ts
import { computeQuotationTotals } from '@/lib/quotation-totals';
```

and just before the `return (` of the component:

```ts
  const totals = computeQuotationTotals({
    lines: orderItems.map((i) => ({ quantity: i.quantity, unitPrice: i.unitPrice })),
    discountAmount,
    vatEnabled,
    vatPercent,
  });
```

- [ ] **Step 5: Rename step 2 and insert the pricing table**

Change the `STEPS` array (lines 61–65) to:

```ts
const STEPS = [
  { id: 1, label: 'Customer & Products' },
  { id: 2, label: 'Quotation' },
  { id: 3, label: 'Details & Submit' },
];
```

Then replace the entire `{step === 2 && ( ... )}` block (lines 730–773) with a Quotation step. Insert this JSX:

```tsx
      {step === 2 && (
        <div className="space-y-6">
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 text-white">
                <tr>
                  <th className="px-3 py-2 text-left font-semibold">Description</th>
                  <th className="w-24 px-3 py-2 font-semibold">Qty</th>
                  <th className="w-28 px-3 py-2 font-semibold">Unit</th>
                  <th className="w-32 px-3 py-2 font-semibold">Price</th>
                  <th className="w-32 px-3 py-2 font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {orderItems.map((item, index) => (
                  <tr key={item.lineId} className="border-b border-gray-100 align-top">
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateLine(item.lineId, { description: e.target.value })}
                        className="w-full rounded border border-gray-200 px-2 py-1.5 focus:border-[#DC2626] focus:outline-none"
                      />
                      {item.requiresLineSpecs && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <select
                            value={item.specs.machine ?? ''}
                            onChange={(e) => updateSpec(item.lineId, 'machine', e.target.value)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          >
                            <option value="">Machine…</option>
                            {THERMOFORMING_MACHINES.map((m) => (
                              <option key={m.value} value={m.value}>{m.label}</option>
                            ))}
                          </select>
                          <select
                            value={item.specs.capacity ?? ''}
                            onChange={(e) => updateSpec(item.lineId, 'capacity', e.target.value)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          >
                            <option value="">Capacity…</option>
                            {THERMOFORMING_CAPACITIES.map((c) => (
                              <option key={c.value} value={c.value}>{c.label}</option>
                            ))}
                          </select>
                          <select
                            value={item.specs.grams ?? ''}
                            onChange={(e) => updateSpec(item.lineId, 'grams', e.target.value)}
                            className="rounded border border-gray-300 px-2 py-1 text-xs"
                          >
                            <option value="">Grams…</option>
                            {THERMOFORMING_GRAMS.map((g) => (
                              <option key={g.value} value={g.value}>{g.label}</option>
                            ))}
                          </select>
                          <input
                            type="text"
                            value={item.specs.pattern ?? ''}
                            onChange={(e) => updateSpec(item.lineId, 'pattern', e.target.value)}
                            placeholder="Pattern"
                            className="w-28 rounded border border-gray-300 px-2 py-1 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() => removeLine(item.lineId)}
                            className="rounded px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                          >
                            Remove
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onChange={(e) => updateLine(item.lineId, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                        className="w-full rounded border border-gray-200 px-2 py-1.5 text-center focus:border-[#DC2626] focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={item.unitLabel}
                        onChange={(e) => updateLine(item.lineId, { unitLabel: e.target.value })}
                        className="w-full rounded border border-gray-200 px-2 py-1.5 text-center focus:border-[#DC2626] focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={item.unitPrice ?? ''}
                        onChange={(e) => updateLine(item.lineId, { unitPrice: e.target.value === '' ? null : Number(e.target.value) })}
                        className="w-full rounded border border-gray-200 px-2 py-1.5 text-center focus:border-[#DC2626] focus:outline-none"
                      />
                    </td>
                    <td className="px-3 py-2 text-center font-bold text-[#DC2626]">
                      {totals.lineTotals[index].toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Valid until"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
            />
            <Input
              label="Payment terms"
              type="text"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value)}
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center justify-between py-1 text-sm">
              <span className="text-gray-500">Subtotal</span>
              <span className="font-semibold">{totals.subtotal.toFixed(2)} SAR</span>
            </div>
            <div className="flex items-center justify-between py-1 text-sm">
              <span className="text-gray-500">Discount (SAR)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                className="w-28 rounded border border-gray-300 px-2 py-1 text-center"
              />
            </div>
            <div className="flex items-center justify-between py-1 text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-gray-500">
                <input
                  type="checkbox"
                  checked={vatEnabled}
                  onChange={(e) => setVatEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300"
                />
                VAT %
              </label>
              <input
                type="number"
                min={0}
                max={100}
                step="0.5"
                value={vatPercent}
                onChange={(e) => setVatPercent(Number(e.target.value) || 0)}
                disabled={!vatEnabled}
                className="w-28 rounded border border-gray-300 px-2 py-1 text-center disabled:bg-gray-100"
              />
            </div>
            <div className="mt-3 flex items-center justify-between rounded bg-[#DC2626] px-3 py-2 text-white">
              <span className="font-bold">Grand total</span>
              <span className="text-lg font-extrabold">{totals.grandTotal.toFixed(2)} SAR</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              Quotation notes (visible to the customer)
            </label>
            <textarea
              value={quoteNotes}
              onChange={(e) => setQuoteNotes(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
              placeholder="Any additional terms or remarks..."
            />
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="secondary" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
            <Button type="button" variant="primary" onClick={() => setStep(3)}>
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
```

- [ ] **Step 6: Move the old step-2 fields into step 3**

The delivery date, assignee and internal notes fields moved out of step 2. Insert them at the top of the `{step === 3 && (` block, inside its outer `<div className="space-y-6">` and before the Summary card:

```tsx
          <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
            <Input
              label="Expected delivery date"
              type="date"
              {...step2Form.register('expectedDeliveryDate')}
            />
            <Select
              label="Assign user"
              options={userOptions}
              placeholder="Select user (optional)"
              {...step2Form.register('assignedUserId')}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">
                Internal notes
              </label>
              <textarea
                {...step2Form.register('internalNotes')}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#DC2626]"
                placeholder="Optional notes..."
              />
            </div>
          </div>
```

Then change the `usersData` query's `enabled: step === 2` (line 220) to `enabled: step === 3`, and delete the now-unused `onStep2Submit` function (lines 318–320).

The step-3 Summary card still renders items via `getProductById(item.productId)`
(lines 795–812), which shows the same product twice for two mold lines and breaks
once a line's product is not in the current search page. Replace that `.map` body
so it reads from the line itself:

```tsx
                    {orderItems.map((item) => (
                      <div
                        key={item.lineId}
                        className="flex flex-col items-center rounded-lg border border-gray-200 bg-gray-50 p-3 min-w-[100px]"
                      >
                        <span className="text-sm font-medium text-gray-900 text-center">
                          {item.description}
                        </span>
                        <span className="mt-1 inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[#DC2626] px-2 text-xs font-bold text-white">
                          {item.quantity}
                        </span>
                      </div>
                    ))}
```

`getProductById` is then unused — delete it (lines 292–294).

- [ ] **Step 7: Send the new fields on submit**

Replace the `handleSubmit` function (lines 322–338) with:

```tsx
  const handleSubmit = () => {
    const s1 = step1Form.getValues();
    const s2 = step2Form.getValues();
    createMutation.mutate({
      orderType: OrderType.NEW_MOLD,
      customerId: s1.customerId,
      items: orderItems.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
        unitLabel: i.unitLabel,
        description: i.description,
        specs: i.requiresLineSpecs ? i.specs : null,
      })),
      expectedDeliveryDate: s2.expectedDeliveryDate
        ? new Date(s2.expectedDeliveryDate).toISOString()
        : undefined,
      assignedUserId: s2.assignedUserId || undefined,
      internalNotes: s2.internalNotes || undefined,
      quotation: {
        validUntil: validUntil || undefined,
        payMethod,
        notes: quoteNotes || undefined,
        discountAmount,
        vatEnabled,
        vatPercent,
      },
    });
  };
```

- [ ] **Step 8: Accept the quote header on create (API)**

The wizard now sends a `quotation` object. In `apps/api/src/orders/orders.service.ts`, add to the `create` dto type:

```ts
      quotation?: {
        validUntil?: string;
        payMethod?: string;
        notes?: string;
        discountAmount?: number;
        vatEnabled?: boolean;
        vatPercent?: number;
      };
```

and in the `quotation: { create: { ... } }` block, append after `attn: defaults.attn,`:

```ts
            ...(dto.quotation?.validUntil
              ? { validUntil: new Date(dto.quotation.validUntil) }
              : {}),
            ...(dto.quotation?.payMethod ? { payMethod: dto.quotation.payMethod } : {}),
            ...(dto.quotation?.notes ? { notes: dto.quotation.notes } : {}),
            ...(dto.quotation?.discountAmount !== undefined
              ? { discountAmount: dto.quotation.discountAmount }
              : {}),
            ...(dto.quotation?.vatEnabled !== undefined
              ? { vatEnabled: dto.quotation.vatEnabled }
              : {}),
            ...(dto.quotation?.vatPercent !== undefined
              ? { vatPercent: dto.quotation.vatPercent }
              : {}),
```

The explicit `validUntil` spread must come **after** `validUntil: defaults.validUntil` so the user's choice wins over the 14-day default.

- [ ] **Step 9: Route to the quotation after submit**

In the `createMutation.onSuccess` handler (line 226), change:

```ts
      router.push(`/orders/${(data as { id: string }).id}`);
```

to:

```ts
      router.push(`/orders/${(data as { id: string }).id}/quotation`);
```

- [ ] **Step 10: Verify**

```bash
npm -w apps/api run test
npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | tail -30
```

Then run the app and walk the wizard end to end:

```bash
npm run dev
```

Open http://localhost:3001/orders/new, pick a customer, add two products, enter prices, and submit. Expect a 404 on `/orders/<id>/quotation` — that page is Task 10. Confirm in Prisma Studio that the order has `status = QUOTATION`, a `QT-` number, null `order_number`, prices on both `order_items`, and an `order_quotations` row.

Then run it again exercising the mold: search for `SIL-THF-NEWMOLD`, click it
**three** times, and confirm step 2 shows three separate lines each with its own
machine / capacity / grams / pattern controls. Give each different specs, price
them, submit, and check in Prisma Studio that three `order_items` rows exist for
the same `product_id` with different `specs` JSON. Clicking an ordinary product
three times must still produce one line at quantity 3.

- [ ] **Step 11: Commit**

```bash
git add apps/web/src apps/api/src/orders/orders.service.ts
git commit -m "feat(web): price the lines while placing an order"
```

---

## Task 10: The printable quotation page

**Files:**
- Create: `apps/web/public/quotation-letterhead.jpg`, `apps/web/src/app/(dashboard)/orders/[id]/quotation/quotation-css.ts`, `apps/web/src/app/(dashboard)/orders/[id]/quotation/page.tsx`
- Reference: `C:\Users\Lenovo\Desktop\عرض سعر\quotation_form_10.html`

**Interfaces:**
- Consumes: `GET`/`PATCH /api/v1/orders/:id/quotation` (Task 7), `computeQuotationTotals` (Task 9)

The source form's `<style>` block is 345 lines and its `I18N` dictionary is 120. Copy them; do not retype them from memory.

- [ ] **Step 1: Extract the letterhead**

The source HTML's header image is a `data:image/jpeg;base64` URI, ~30 KB. Extract it:

```bash
node -e "const fs=require('fs');const h=fs.readFileSync(String.raw'C:\Users\Lenovo\Desktop\عرض سعر\quotation_form_10.html','utf8');const m=h.match(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/);fs.writeFileSync('apps/web/public/quotation-letterhead.jpg',Buffer.from(m[1],'base64'));console.log('wrote',m[1].length,'b64 chars');"
```

Open `apps/web/public/quotation-letterhead.jpg` and confirm it is the Hassan AlQarqoosh letterhead.

- [ ] **Step 2: Build the stylesheet module**

Create `apps/web/src/app/(dashboard)/orders/[id]/quotation/quotation-css.ts` exporting the source stylesheet as a plain string:

```ts
/**
 * The stylesheet from quotation_form_10.html, scoped under .qform.
 * Kept as a plain string (not a CSS module) because the print window is a
 * fresh document that receives this same text — hashed module class names
 * would not resolve there.
 */
export const QUOTATION_CSS = `
...
`;
```

Fill the template literal by copying the entire contents of the `<style>` element from `quotation_form_10.html` (lines 9–352), then applying exactly these five edits:

1. Prefix every top-level selector with `.qform ` — e.g. `.title-bar {` becomes `.qform .title-bar {`, `table.items thead th {` becomes `.qform table.items thead th {`.
2. Replace `:root {` with `.qform {` (the CSS custom properties then cascade from the wrapper).
3. Replace every `html[dir="rtl"]` with `.qform[dir="rtl"]` and every `html[dir="ltr"]` with `.qform[dir="ltr"]` — the page sets `dir` on the wrapper, not on `<html>`.
4. Replace the `html, body { ... }` and `body { padding: 24px 12px; }` rules with a single `.qform { background: #eef0f3; color: var(--ink); -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 24px 12px; }`.
5. **Delete** every rule for `.img-slot`, `.paste-hint`, `.lightbox`, `td.img-cell`, `th.col-img`, `table.items.no-images`, and the `@keyframes fadeInPulse` block. There is no image column.

Leave `@page` and every `@media print` block exactly as they are — `@page` is document-level and must not be scoped.

Escape any backtick or `${` sequence in the CSS for the template literal. (The source has none, but check.)

- [ ] **Step 3: Build the page**

Create `apps/web/src/app/(dashboard)/orders/[id]/quotation/page.tsx`. It is a client page following the `orders/[id]/factory-sheet` pattern for data loading and the `projects/[id]/client-approval-workspace.tsx` `buildPrintWindow` pattern for printing.

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, useToast } from '@/components/ui';
import { Printer, Languages, ArrowLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { QUOTATION_CSS } from './quotation-css';

interface QuotationLine {
  id: string;
  description: string;
  productName: string;
  requiresLineSpecs: boolean;
  specs: Record<string, string> | null;
  quantity: number;
  unitLabel: string;
  unitPrice: number | null;
  lineTotal: number;
}

interface QuotationTotals {
  lineTotals: number[];
  subtotal: number;
  discount: number;
  discountPercent: number;
  net: number;
  vat: number;
  grandTotal: number;
}

interface QuotationView {
  orderId: string;
  quoteNumber: string | null;
  orderNumber: string | null;
  status: string;
  quoteDate: string | null;
  validUntil: string | null;
  payMethod: string;
  clientBlock: string;
  contact: string | null;
  attn: string | null;
  notes: string | null;
  discountAmount: number;
  vatEnabled: boolean;
  vatPercent: number;
  language: string;
  customerName: string;
  lines: QuotationLine[];
  totals: QuotationTotals;
}
```

Then, in the component:

- Load with `useQuery({ queryKey: ['quotation', id], queryFn: () => api.get<QuotationView>(`/api/v1/orders/${id}/quotation`) })`.
- Keep a local draft in `useState<QuotationView | null>(null)`, seeded from the query in a `useEffect` whenever the server data changes. **Always overwrite `totals` from the server response** — that is the reconciliation described in the spec.
- `const locked = draft?.status !== 'QUOTATION';` — when locked, render every field as plain text instead of an input, and hide the toolbar's save state.
- A `useMutation` calling `api.patch<QuotationView>(`/api/v1/orders/${id}/quotation`, payload)`; on success, `setDraft(response)` and `queryClient.invalidateQueries({ queryKey: ['order', id] })`. On error show `addToast(err.message, 'error')` — a 409 means the order was confirmed in another tab.
- Debounce saves ~800 ms after the last keystroke with a `useRef<ReturnType<typeof setTimeout>>`.
- While typing, recompute totals locally with `computeQuotationTotals` from `@/lib/quotation-totals` so the numbers move immediately; the server response then replaces them.
- Render the whole form inside `<div className="qform" dir={lang === 'ar' ? 'rtl' : 'ltr'} ref={printRef}>`, reproducing the source HTML's structure exactly: `.page` > `img.header-img` (`src="/quotation-letterhead.jpg"`) > `.title-bar` > `.meta` > `.client-box` > `table.items` > `.totals-wrap` (`.notes` + `.totals`) > `.footer-sign` > `.page-foot`. Copy the footer markup — company name, C.R. 2050044548, P.O. Box 8035 Dammam 31482, the two phone numbers, the email, and the IBAN block — verbatim from lines 456–469 of the source.
- Omit the `<th class="col-img">` header and every `td.img-cell` cell. The items table columns are `#`, البيان, الكمية, الوحدة, السعر, الإجمالي.
- Copy the `I18N` object from the source (lines 494–613) into the page, minus the `thImg`, `imgLabel` and `pasteHint` keys. Drive labels off `I18N[lang]`, with `lang` in `useState<'ar' | 'en'>` seeded from `draft.language` and persisted through the same PATCH.
- Hide the discount rows when `totals.discount === 0`, exactly as `calcAll()` does.
- The description cell renders `line.description` with `white-space: pre-line` so
  a mold line's spec label appears on its own second line, as the API composed it.
- **Mold spec editors.** When `!locked && line.requiresLineSpecs`, render the four
  controls under the description cell — machine, capacity and grams as `<select>`,
  pattern as free text — patching through the same debounced save:

  ```tsx
  const setSpec = (line: QuotationLine, key: string, value: string) =>
    save({ lines: [{ id: line.id, specs: { ...(line.specs ?? {}), [key]: value } }] });
  ```

  Copy the option lists — `THERMOFORMING_MACHINES`, `THERMOFORMING_CAPACITIES`,
  `THERMOFORMING_GRAMS` — from `orders/new/page.tsx:23-45`. Wrap the controls in a
  container with `className="qform-specs"` and add `.qform .qform-specs { display: none; }`
  inside the stylesheet's `@media print` block: the customer's copy shows the
  composed spec label, not dropdowns.
- Show an inline warning above the table when any mold line is missing specs —
  `Missing mold specifications — this quotation cannot be confirmed until they are set.`
  It mirrors the API's confirmation check so the block is not a surprise later.
- Inject the stylesheet once: `<style dangerouslySetInnerHTML={{ __html: QUOTATION_CSS }} />`.

Print handler:

```tsx
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    const el = printRef.current;
    if (!el) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(
      `<!DOCTYPE html><html dir="${lang === 'ar' ? 'rtl' : 'ltr'}" lang="${lang}">` +
        `<head><meta charset="utf-8"><title>\u200B</title>` +
        `<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Tajawal:wght@400;500;700&family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@700;900&display=swap" rel="stylesheet">` +
        `<style>${QUOTATION_CSS}</style></head><body>`,
    );
    win.document.write(el.outerHTML);
    win.document.write('</body></html>');
    win.document.close();
    setTimeout(() => win.print(), 600);
  };
```

The 600 ms delay lets the letterhead and the web fonts load; printing sooner produces a blank header. The toolbar sits above the form with `className="print:hidden"` and holds Back, the AR⇄EN toggle, and Print.

- [ ] **Step 4: Add and remove lines while the quote is unconfirmed**

Editing a quotation means more than changing numbers — the paper form has
`+ إضافة بند` and a per-row `✕`. Both reuse endpoints that already exist
(`orders.controller.ts:166` and `:192`); neither needs new API work.

Render these only when `!locked`, and hide them in print (the source CSS already
hides `.table-actions` and `.btn-del` under `@media print`).

Per row, in the last cell:

```tsx
                    <td className="action">
                      <button
                        type="button"
                        className="btn-del"
                        title={I18N[lang].thDel}
                        onClick={() => removeLine.mutate(line.id)}
                      >
                        ✕
                      </button>
                    </td>
```

Below the table, a `.table-actions` bar holding an add-item control. A line must
stay tied to a product — `OrderItem.productId` is required, and the factory sheet
and inventory both read it — so "add item" opens a product search rather than
creating a free-text row:

```tsx
  const addLine = useMutation({
    mutationFn: (productId: string) =>
      api.post(`/api/v1/orders/${id}/items`, { productId, quantity: 1 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quotation', id] }),
    onError: (err: Error) => addToast(err.message, 'error'),
  });

  const removeLine = useMutation({
    mutationFn: (itemId: string) =>
      api.delete(`/api/v1/orders/${id}/items/${itemId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quotation', id] }),
    onError: (err: Error) => addToast(err.message, 'error'),
  });
```

For the picker, reuse the `SearchableSelect` from `@/components/ui` fed by
`api.get<{ data: { id: string; sku: string; nameEn: string }[] }>('/api/v1/products', { search, pageSize: '20' })`,
exactly as `orders/new/page.tsx` does. Selecting a product calls `addLine`.

Deleting the last remaining line must be prevented — an order with no items
cannot be confirmed. Disable the `✕` when `draft.lines.length === 1`.

- [ ] **Step 5: Add the same font link to the app page**

So the on-screen form matches the printed one, add to the top of the returned JSX, next to the `<style>` tag:

```tsx
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;900&family=Tajawal:wght@400;500;700&family=Inter:wght@400;500;600;700;800&family=Playfair+Display:wght@700;900&display=swap"
        rel="stylesheet"
      />
```

- [ ] **Step 6: Verify against the original**

```bash
npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | tail -30
npm run dev
```

Open the order you created in Task 9 at `/orders/<id>/quotation`. Then open `C:\Users\Lenovo\Desktop\عرض سعر\quotation_form_10.html` in the same browser and print both to PDF side by side. Check, in this order:

1. Letterhead renders and is not stretched
2. Red title bar, meta row, client box align the same
3. Items table header is dark, columns in the same order, no image column
4. Totals block: subtotal, discount (hidden at zero), net, VAT, red grand total
5. Signature boxes and the dark footer with the IBAN
6. Toggle to English — direction flips to LTR and every label changes
7. Edit a price, wait a second, reload the page — the change persisted
8. Add a line via the picker and delete a line; the `✕` is disabled at one line
9. Neither control appears in the printed output

- [ ] **Step 7: Commit**

```bash
git add apps/web/public/quotation-letterhead.jpg "apps/web/src/app/(dashboard)/orders/[id]/quotation"
git commit -m "feat(web): printable quotation page"
```

---

## Task 11: Chase list and nullable order numbers

**Files:**
- Modify: `apps/web/src/app/(dashboard)/orders/page.tsx`, `apps/web/src/app/(dashboard)/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `OrderStatus` (Task 8), `GET /api/v1/orders?status=QUOTATION`

Quotations have `orderNumber === null`, so every place that renders it needs a fallback. This is what the Task 8 typecheck flagged.

- [ ] **Step 1: Make the list handle null order numbers**

In `apps/web/src/app/(dashboard)/orders/page.tsx`, change the `OrderRow` interface (lines 26–28):

```ts
  orderNumber: string | null;
  factoryOrderNumber: string | null;
  quoteNumber: string | null;
```

Replace the first column definition (line 103) with:

```tsx
    {
      key: 'orderNumber',
      header: 'Order #',
      render: (row) => row.orderNumber ?? row.quoteNumber ?? '—',
    },
```

and in the mobile card (line 258) replace `{order.orderNumber}` with `{order.orderNumber ?? order.quoteNumber ?? '—'}`.

- [ ] **Step 2: Add the Quotations tab**

After the `const [page, setPage] = useState(1);` line, add:

```tsx
  const [tab, setTab] = useState<'ALL' | 'QUOTATIONS'>('ALL');
```

Change the `filters` object so the tab wins over the dropdown:

```tsx
  const effectiveStatus = tab === 'QUOTATIONS' ? OrderStatus.QUOTATION : status;

  const filters = {
    ...(effectiveStatus && { status: effectiveStatus }),
    ...(orderType && { orderType }),
    ...(search && { search }),
    ...(delayed && { delayed: 'true' }),
    ...(nearDeadline && { nearDeadline: 'true' }),
    page: String(page),
    pageSize: '10',
  };
```

Insert the tab strip directly above the filter bar `<div>`:

```tsx
      <div className="flex gap-1 border-b border-gray-200">
        {(['ALL', 'QUOTATIONS'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setPage(1); }}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'border-[#DC2626] text-[#DC2626]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'ALL' ? 'All Orders' : 'Quotations'}
          </button>
        ))}
      </div>
```

Disable the status dropdown while the Quotations tab is active by adding `disabled={tab === 'QUOTATIONS'}` to its `<Select>`.

- [ ] **Step 3: Add the waiting-time column**

Add near the top of the file, after the imports:

```tsx
const daysSince = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
```

Add `createdAt: string;` and `quotation?: { validUntil: string | null } | null;` to `OrderRow`, then build the columns conditionally:

```tsx
  const quotationColumns: DataTableColumn<OrderRow>[] = [
    {
      key: 'createdAt',
      header: 'Waiting',
      render: (row) => {
        const d = daysSince(row.createdAt);
        return (
          <span className={d >= 7 ? 'font-semibold text-[#DC2626]' : 'text-gray-700'}>
            {d === 0 ? 'today' : `${d} ${d === 1 ? 'day' : 'days'}`}
          </span>
        );
      },
    },
    {
      key: 'validUntil',
      header: 'Valid until',
      render: (row) => {
        const v = row.quotation?.validUntil;
        if (!v) return '—';
        const expired = new Date(v).getTime() < Date.now();
        return (
          <span className={expired ? 'font-semibold text-[#DC2626]' : 'text-gray-700'}>
            {format(new Date(v), 'MMM d, yyyy')}
            {expired ? ' (expired)' : ''}
          </span>
        );
      },
    },
  ];
```

and pass `columns={tab === 'QUOTATIONS' ? [...columns, ...quotationColumns] : columns}` to the `DataTable`.

- [ ] **Step 4: Return the fields the list needs (API)**

The list query must include `quotation` and the new columns. In `apps/api/src/orders/orders.service.ts`, in `list()`, add `quotation: { select: { validUntil: true } },` to the `include` block (after `items: ...`).

Also add oldest-first ordering for the chase list. Add `sort?: string;` to `OrderListFilters`, then replace the `orderBy` line with:

```ts
        orderBy: { createdAt: filters.sort === 'oldest' ? 'asc' : 'desc' },
```

and add `@Query('sort') sort?: string,` to the controller's `list` parameters, passing `sort` through. In the web `filters` object add `...(tab === 'QUOTATIONS' && { sort: 'oldest' }),`.

- [ ] **Step 5: Fix the detail page**

In `apps/web/src/app/(dashboard)/orders/[id]/page.tsx`, change the `OrderDetail` interface (lines 75–76):

```ts
  orderNumber: string | null;
  factoryOrderNumber: string | null;
  quoteNumber: string | null;
```

Replace the header block (lines 489–494) with:

```tsx
            <h1 className="text-2xl font-bold text-gray-900">
              {order.orderNumber ?? order.quoteNumber ?? '—'}
            </h1>
            <p className="text-sm text-gray-500">
              {order.factoryOrderNumber
                ? `Factory: ${order.factoryOrderNumber}`
                : 'Not confirmed yet — no factory order number'}
            </p>
```

- [ ] **Step 6: Add a Quotation link and a Reject action**

In the same header's action area (the `<div className="flex flex-col gap-2 sm:flex-row sm:items-center">` at line 497), add:

```tsx
          <Button
            variant="secondary"
            size="md"
            onClick={() => router.push(`/orders/${id}/quotation`)}
          >
            <FileText className="h-4 w-4" />
            Quotation
          </Button>
          {order.status === 'QUOTATION' && hasPermission(Permission.CHANGE_STATUS) && (
            <Button
              variant="secondary"
              size="md"
              onClick={() => statusMutation.mutate({ newStatus: 'REJECTED' })}
            >
              Mark rejected
            </Button>
          )}
```

`FileText` is already imported on line 30.

- [ ] **Step 7: Fix the dashboard**

`apps/web/src/app/(dashboard)/page.tsx` renders `order.orderNumber` in both the desktop table (line 205) and the mobile list (line 259), and types it as `string` on line 21. Quotations have no order number, so it would render blank.

Change line 21 to:

```ts
    orderNumber: string | null;
    quoteNumber: string | null;
```

and replace `{order.orderNumber}` on **both** lines 205 and 259 with:

```tsx
{order.orderNumber ?? order.quoteNumber ?? '—'}
```

- [ ] **Step 8: Verify end to end**

```bash
npm -w apps/api run test
npx tsc --noEmit -p apps/api/tsconfig.json 2>&1 | tail -20
npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | tail -20
npm run dev
```

`tsc` must be silent on both projects — zero errors. Then walk the whole flow:

1. `/orders/new` — create a quotation with prices
2. Land on the quotation page, edit a price, print
3. `/orders` — the Quotations tab lists it with a waiting time
4. Open it, advance the status to Confirmed
5. Confirm it now has an `ORD-` and `FO-` number, the quotation page is read-only, product inventory dropped, and a `SELLING_PRICE` cost equal to the grand total appears under Costs
6. Create a second quotation and mark it rejected — it leaves the Quotations tab
7. The dashboard's recent-orders list shows the `QT-` number for quotations
8. Quote three molds with different specs; each prints its own spec line
9. Clear one mold's grams and try to confirm — it is refused, naming that line
10. Set the grams and confirm — it succeeds

- [ ] **Step 9: Commit**

```bash
git add apps/web/src apps/api/src
git commit -m "feat(web): quotations chase tab and nullable order numbers"
```

---

## Task 12: Deploy

**Files:** none — production operations.

Do this only after Task 11 verifies clean. Production details come from the project's deployment notes; re-read them before starting.

- [ ] **Step 1: Merge the branch**

```bash
git checkout main
git merge --no-ff feat/order-quotation-stage
```

- [ ] **Step 2: Back up the production database**

The live database is the **`hqq_db`** docker container on port **5434** (user `hqq`, database `hqq_oms`), per `/opt/hqq-oms/.env`. The `hqq_postgres` container on 5432 is unused — do not touch it.

```bash
ssh -i ~/.ssh/hqq_oms_ed25519 root@46.224.197.38 \
  "docker exec hqq_db pg_dump -U hqq hqq_oms | gzip > /root/hqq_oms-before-quotation-$(date +%Y%m%d).sql.gz && ls -lh /root/hqq_oms-before-quotation-*.sql.gz"
```

Confirm the file is non-trivial in size before continuing. **Do not proceed without a verified backup** — the migration rewrites the `status` column on every order.

- [ ] **Step 3: Ship the code**

```bash
git archive --format=tar main apps prisma package.json package-lock.json tsconfig.base.json \
  | tar --delete 'apps/api/uploads' | gzip > deploy.tar.gz
scp -i ~/.ssh/hqq_oms_ed25519 deploy.tar.gz root@46.224.197.38:/tmp/
ssh -i ~/.ssh/hqq_oms_ed25519 root@46.224.197.38 "tar xzf /tmp/deploy.tar.gz -C /opt/hqq-oms"
```

- [ ] **Step 3b: Pre-flight the migration against production**

This repo's migration history drifted from its databases under `db push`
(see Global Constraints). `migrate deploy` does not drift-check — it simply
applies pending migrations — so confirm production is in the state this
migration expects before running it.

```bash
ssh -i ~/.ssh/hqq_oms_ed25519 root@46.224.197.38 \
  "docker exec hqq_db psql -U hqq -d hqq_oms -c \"SELECT migration_name FROM _prisma_migrations ORDER BY started_at;\" -c \"SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name='orders' AND column_name IN ('order_number','factory_order_number','quote_number','confirmed_at');\""
```

Expected: the same 9 migrations as local, `20260727000000_order_quotation_stage`
**absent**, `order_number` and `factory_order_number` present and `NO` (not
nullable), `quote_number` and `confirmed_at` absent.

The migration was generated by diffing the **local dev database**, and this repo
has `db push` drift — so production's starting shape must be confirmed to match,
not assumed. The migration's placeholder INSERT reads `product_categories` and
`product_subcategories`, and its ALTERs assume specific columns exist:

```bash
ssh -i ~/.ssh/hqq_oms_ed25519 root@46.224.197.38 \
  "docker exec hqq_db psql -U hqq -d hqq_oms \
   -c \"SELECT to_regclass('product_categories') AS cats, to_regclass('product_subcategories') AS subs, to_regclass('order_quotations') AS quotations;\" \
   -c \"SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name IN ('category_id','subcategory_id','inventory','specs','requires_line_specs') ORDER BY 1;\" \
   -c \"SELECT indexname FROM pg_indexes WHERE tablename='order_items';\" \
   -c \"SELECT sku_prefix FROM product_categories WHERE sku_prefix='SIL';\" \
   -c \"SELECT count(*) AS orders_at_new FROM orders WHERE status='NEW';\""
```

Expected: `cats` and `subs` non-null, `quotations` **null**; `products` has
`category_id`, `subcategory_id`, `inventory`, `specs` but **not**
`requires_line_specs`; `order_items` still has
`order_items_order_id_product_id_key`; one `SIL` row exists.

`orders_at_new` tells you how many rows the backfill will convert. **Record that
number** — the dev database had zero orders at `NEW`, so the backfill ran against
nothing locally and is unexercised. After the migration, re-run that same count:
it must be 0, and `CONFIRMED` must have risen by exactly that amount.

If any expectation fails, stop. Do not run `migrate deploy` against a database
whose shape differs from the one the migration was generated against.

- [ ] **Step 4: Migrate, build, restart**

```bash
ssh -i ~/.ssh/hqq_oms_ed25519 root@46.224.197.38 \
  "cd /opt/hqq-oms && npm install && npx prisma migrate deploy --schema prisma/schema.prisma && npx prisma generate --schema prisma/schema.prisma && npm -w apps/api run build && npm -w apps/web run build && pm2 restart hqq-api hqq-web"
```

- [ ] **Step 5: Verify the restart actually happened**

```bash
ssh -i ~/.ssh/hqq_oms_ed25519 root@46.224.197.38 "pm2 jlist" | head -c 2000
```

Check `pm_uptime` is seconds old and `restart_time` incremented for **both** processes. A long SSH session sometimes drops between build and restart, leaving the old code serving — the tell is an API route returning 404 where it should return 401.

- [ ] **Step 6: Verify the data**

```bash
ssh -i ~/.ssh/hqq_oms_ed25519 root@46.224.197.38 \
  "docker exec hqq_db psql -U hqq -d hqq_oms -c \"SELECT status, count(*) FROM orders GROUP BY status ORDER BY 2 DESC;\" -c \"SELECT count(*) AS stale_history FROM order_status_history WHERE old_status='NEW' OR new_status='NEW';\""
```

Expected: zero orders at `NEW`, `stale_history` = 0, and the previous `NEW` count now showing under `CONFIRMED`.

- [ ] **Step 7: Smoke-test the live site**

On https://hqq-tech.com: open an existing in-progress order and confirm its number and status still read correctly, then create one new quotation, print it, and confirm it.

- [ ] **Step 8: Push**

```bash
git push origin main
```

---

## Rollback

If the migration lands but the app misbehaves, restore the pre-migration dump:

```bash
ssh -i ~/.ssh/hqq_oms_ed25519 root@46.224.197.38 \
  "gunzip -c /root/hqq_oms-before-quotation-<date>.sql.gz | docker exec -i hqq_db psql -U hqq -d hqq_oms"
```

then check out the previous commit, rebuild, and `pm2 restart hqq-api hqq-web`. The migration is not reversible by `prisma migrate` alone: the `NEW` → `CONFIRMED` backfill has no down script, and rolling back the code without the data leaves every order at a status the old flow does not recognise.
