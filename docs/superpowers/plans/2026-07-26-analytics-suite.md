# HQQ OMS Analytics Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the four-card `/reports` page with an `/analytics` section containing four dashboards — Stock & Demand, Sales & Profit, Customers, Operations & Lead Time.

**Architecture:** A new NestJS `analytics` module aggregates in SQL (`$queryRaw`) and delegates all shaping/classification to pure functions in `analytics/lib/`, which are unit-tested without a database. The Next.js side adds an `/analytics` route group with a tab bar, one page per dashboard, reusing the existing `Card`/`Loading`/`DataTable` primitives and `@tanstack/react-query`.

**Tech Stack:** NestJS 10 + Prisma + PostgreSQL; Next.js App Router + React Query + Tailwind; Jest (new); recharts (new).

## Global Constraints

- **Never sum money across currencies.** `order_costs.currency` is `SAR | USD | CNY`. Every monetary aggregate groups by currency. No FX conversion exists and none may be invented.
- **Unknown ≠ zero.** When no `SELLING_PRICE` rows exist, margin fields are `null`, never `0`. The UI renders an explanatory empty state, never `0.00`.
- **Permission:** every analytics endpoint uses `@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@RequirePermissions('VIEW_REPORTS')`. No new permission is introduced.
- **Aggregate in SQL.** Do not copy the `findMany()`-then-loop pattern in `apps/api/src/reports/reports.service.ts`.
- **Column names are snake_case in SQL** (`name_en`, `customer_code`, `is_active`, `cost_type`, `created_at`, `completed_at`, `expected_delivery_date`), camelCase in Prisma.
- Monorepo commands run from the repo root: `npm -w apps/api …`, `npm -w apps/web …`.

---

### Task 1: Jest test harness for the API

There is currently **no test infrastructure in `apps/api`** — no jest, no test script, no test files. Every later task depends on this.

**Files:**
- Modify: `apps/api/package.json` (add devDeps + `test` script)
- Create: `apps/api/jest.config.js`
- Create: `apps/api/src/analytics/lib/__tests__/harness.spec.ts`

**Interfaces:**
- Consumes: nothing
- Produces: working `npm -w apps/api run test` command used by every subsequent task.

- [ ] **Step 1: Install test dependencies**

```bash
npm -w apps/api install -D jest@29 ts-jest@29 @types/jest@29
```

- [ ] **Step 2: Create the Jest config**

Create `apps/api/jest.config.js`:

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  moduleFileExtensions: ['js', 'json', 'ts'],
};
```

- [ ] **Step 3: Add the test script**

In `apps/api/package.json`, add to `"scripts"`:

```json
"test": "jest",
"test:watch": "jest --watch"
```

- [ ] **Step 4: Write a harness test that proves the runner works**

Create `apps/api/src/analytics/lib/__tests__/harness.spec.ts`:

```ts
describe('jest harness', () => {
  it('runs typescript tests', () => {
    const value: number = 1 + 1;
    expect(value).toBe(2);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `npm -w apps/api run test`
Expected: PASS, 1 test.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/jest.config.js apps/api/src/analytics/lib/__tests__/harness.spec.ts package-lock.json
git commit -m "chore(api): add jest test harness"
```

---

### Task 2: Analytics types (local to the API)

> **Why not `packages/shared`?** That workspace package exists but is **completely unwired** — nothing in `apps/api` or `apps/web` imports `@hqq/shared`, and it is not listed in `apps/api`'s dependencies. Wiring it up is a separate concern. This plan follows the codebase's actual pattern: API types live in the API, and web pages declare their own interfaces inline (exactly as `reports/page.tsx` does today).

**Files:**
- Create: `apps/api/src/analytics/types.ts`

**Interfaces:**
- Consumes: nothing
- Produces: all row types below. Services import them as `./types`; files under `lib/` import them as `../types`.

- [ ] **Step 1: Create the types file**

Create `apps/api/src/analytics/types.ts`:

```ts
export interface ProductDemandRow {
  productId: string;
  sku: string;
  nameEn: string;
  inventory: number;
  customers: number;
  stockGap: boolean;
}

export interface CatalogueHealth {
  totalProducts: number;
  productsWithoutCustomer: number;
  productsWithoutDrawing: number;
  totalLinks: number;
}

export interface CostBreakdownRow {
  month: string;
  costType: string;
  currency: string;
  total: number;
  count: number;
}

export interface MonthlyMoneyRow {
  month: string;
  currency: string;
  revenue: number;
  cost: number;
  margin: number | null;
  marginPct: number | null;
}

export interface CustomerBreadthRow {
  customerId: string;
  customerCode: string;
  name: string;
  products: number;
}

export type CustomerSegment = 'ACTIVE' | 'AT_RISK' | 'DORMANT' | 'NEVER_ORDERED';

export interface CustomerSegmentRow {
  customerId: string;
  customerCode: string;
  name: string;
  lastOrderAt: string | null;
  daysSinceLastOrder: number | null;
  segment: CustomerSegment;
}

export interface CycleTimeRow {
  orderId: string;
  orderNumber: string;
  days: number;
}

export interface StatusDwellRow {
  status: string;
  averageDays: number;
  samples: number;
}

export interface OverdueOrderRow {
  orderId: string;
  orderNumber: string;
  customerName: string;
  expectedDeliveryDate: string;
  daysOverdue: number;
}

export interface FactoryLeadTimeRow {
  factoryId: string;
  factoryName: string;
  orderCount: number;
  completedCount: number;
  averageLeadDays: number | null;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run build:api`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/analytics/types.ts
git commit -m "feat(api): add analytics row types"
```

---

### Task 3: Analytics module skeleton wired into the app

**Files:**
- Create: `apps/api/src/analytics/analytics.module.ts`
- Create: `apps/api/src/analytics/analytics.controller.ts`
- Modify: `apps/api/src/app.module.ts` (register `AnalyticsModule`)

**Interfaces:**
- Consumes: `PrismaModule` (existing, same import style as `ReportsModule`)
- Produces: `AnalyticsController` at `api/v1/analytics`, to which Tasks 4–7 add routes.

- [ ] **Step 1: Create the controller**

Create `apps/api/src/analytics/analytics.controller.ts`:

```ts
import { Controller, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@Controller('api/v1/analytics')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('VIEW_REPORTS')
export class AnalyticsController {}
```

- [ ] **Step 2: Create the module**

Create `apps/api/src/analytics/analytics.module.ts`:

```ts
import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';

@Module({
  controllers: [AnalyticsController],
  providers: [],
})
export class AnalyticsModule {}
```

- [ ] **Step 3: Register it**

In `apps/api/src/app.module.ts`, import `AnalyticsModule` and add it to the `imports` array, directly after `ReportsModule`.

- [ ] **Step 4: Verify the API builds**

Run: `npm run build:api`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/analytics apps/api/src/app.module.ts
git commit -m "feat(api): scaffold analytics module"
```

---

### Task 4: Stock & Demand service

The only dashboard with rich data today. The stock-gap rule is the primary deliverable.

**Files:**
- Create: `apps/api/src/analytics/lib/stock.ts`
- Create: `apps/api/src/analytics/lib/__tests__/stock.spec.ts`
- Create: `apps/api/src/analytics/stock.service.ts`
- Modify: `apps/api/src/analytics/analytics.controller.ts`
- Modify: `apps/api/src/analytics/analytics.module.ts`

**Interfaces:**
- Consumes: `ProductDemandRow`, `CatalogueHealth` (Task 2)
- Produces: `flagStockGaps(rows)`; `StockService.getDemand(): Promise<ProductDemandRow[]>`; `StockService.getCatalogueHealth(): Promise<CatalogueHealth>`; routes `GET /api/v1/analytics/stock/demand` and `GET /api/v1/analytics/stock/catalogue-health`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/analytics/lib/__tests__/stock.spec.ts`:

```ts
import { flagStockGaps } from '../stock';

describe('flagStockGaps', () => {
  const base = { productId: 'p1', sku: 'SKU-1', nameEn: 'One' };

  it('flags a product wanted by 2+ customers with zero inventory', () => {
    const [row] = flagStockGaps([{ ...base, customers: 3, inventory: 0 }]);
    expect(row.stockGap).toBe(true);
  });

  it('does not flag when inventory exists', () => {
    const [row] = flagStockGaps([{ ...base, customers: 9, inventory: 36 }]);
    expect(row.stockGap).toBe(false);
  });

  it('does not flag a single-customer product with no stock', () => {
    const [row] = flagStockGaps([{ ...base, customers: 1, inventory: 0 }]);
    expect(row.stockGap).toBe(false);
  });

  it('returns an empty array unchanged', () => {
    expect(flagStockGaps([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm -w apps/api run test -- stock.spec`
Expected: FAIL — cannot find module `../stock`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/analytics/lib/stock.ts`:

```ts
import type { ProductDemandRow } from '../types';

export interface RawDemandRow {
  productId: string;
  sku: string;
  nameEn: string;
  inventory: number;
  customers: number;
}

export const STOCK_GAP_MIN_CUSTOMERS = 2;

export function flagStockGaps(rows: RawDemandRow[]): ProductDemandRow[] {
  return rows.map((row) => ({
    ...row,
    stockGap: row.customers >= STOCK_GAP_MIN_CUSTOMERS && row.inventory === 0,
  }));
}
```

- [ ] **Step 4: Run the tests**

Run: `npm -w apps/api run test -- stock.spec`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the service**

Create `apps/api/src/analytics/stock.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CatalogueHealth, ProductDemandRow } from './types';
import { flagStockGaps, RawDemandRow } from './lib/stock';

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  async getDemand(): Promise<ProductDemandRow[]> {
    const rows = await this.prisma.$queryRaw<RawDemandRow[]>`
      SELECT p.id            AS "productId",
             p.sku           AS "sku",
             p.name_en       AS "nameEn",
             p.inventory     AS "inventory",
             COUNT(cp.customer_id)::int AS "customers"
      FROM products p
      LEFT JOIN customer_products cp ON cp.product_id = p.id
      WHERE p.is_active = true
      GROUP BY p.id, p.sku, p.name_en, p.inventory
      ORDER BY "customers" DESC, p.sku ASC
    `;
    return flagStockGaps(rows);
  }

  async getCatalogueHealth(): Promise<CatalogueHealth> {
    const [row] = await this.prisma.$queryRaw<CatalogueHealth[]>`
      SELECT
        (SELECT COUNT(*)::int FROM products) AS "totalProducts",
        (SELECT COUNT(*)::int FROM products p
           WHERE NOT EXISTS (SELECT 1 FROM customer_products cp WHERE cp.product_id = p.id)
        ) AS "productsWithoutCustomer",
        (SELECT COUNT(*)::int FROM products p
           WHERE NOT EXISTS (SELECT 1 FROM files f
                             WHERE f.entity_type = 'PRODUCT' AND f.entity_id = p.id)
        ) AS "productsWithoutDrawing",
        (SELECT COUNT(*)::int FROM customer_products) AS "totalLinks"
    `;
    return row;
  }
}
```

- [ ] **Step 6: Add the routes**

In `apps/api/src/analytics/analytics.controller.ts`, inject `StockService` and add:

```ts
  @Get('stock/demand')
  getStockDemand() {
    return this.stockService.getDemand();
  }

  @Get('stock/catalogue-health')
  getCatalogueHealth() {
    return this.stockService.getCatalogueHealth();
  }
```

Add `Get` to the `@nestjs/common` import, a constructor `constructor(private readonly stockService: StockService) {}`, and register `StockService` in `analytics.module.ts` `providers`.

- [ ] **Step 7: Verify against the live local database**

Run: `npm run dev:api` in one terminal, then:

```bash
curl -s http://localhost:4000/api/v1/analytics/stock/demand -H "Authorization: Bearer $TOKEN" | head -c 400
```

Expected: JSON array; the top rows have the highest `customers` counts and `stockGap: true` appears on rows with `customers >= 2, inventory: 0`.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/analytics
git commit -m "feat(api): add stock & demand analytics"
```

---

### Task 5: Sales & Profit service (currency-safe)

**Files:**
- Create: `apps/api/src/analytics/lib/sales.ts`
- Create: `apps/api/src/analytics/lib/__tests__/sales.spec.ts`
- Create: `apps/api/src/analytics/sales.service.ts`
- Modify: `apps/api/src/analytics/analytics.controller.ts`, `analytics.module.ts`

**Interfaces:**
- Consumes: `CostBreakdownRow`, `MonthlyMoneyRow` (Task 2)
- Produces: `buildMonthlyMoney(rows)`; `SalesService.getCostBreakdown()`, `SalesService.getMonthlyMoney()`; routes `GET /api/v1/analytics/sales/cost-breakdown` and `GET /api/v1/analytics/sales/monthly`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/analytics/lib/__tests__/sales.spec.ts`:

```ts
import { buildMonthlyMoney } from '../sales';

describe('buildMonthlyMoney', () => {
  it('returns null margin when no selling price exists', () => {
    const [row] = buildMonthlyMoney([
      { month: '2026-03', costType: 'FACTORY', currency: 'SAR', total: 930, count: 1 },
    ]);
    expect(row.cost).toBe(930);
    expect(row.revenue).toBe(0);
    expect(row.margin).toBeNull();
    expect(row.marginPct).toBeNull();
  });

  it('computes margin when a selling price exists', () => {
    const [row] = buildMonthlyMoney([
      { month: '2026-03', costType: 'SELLING_PRICE', currency: 'SAR', total: 1500, count: 1 },
      { month: '2026-03', costType: 'FACTORY', currency: 'SAR', total: 900, count: 1 },
    ]);
    expect(row.revenue).toBe(1500);
    expect(row.cost).toBe(900);
    expect(row.margin).toBe(600);
    expect(row.marginPct).toBe(40);
  });

  it('never sums across currencies', () => {
    const rows = buildMonthlyMoney([
      { month: '2026-03', costType: 'FACTORY', currency: 'SAR', total: 100, count: 1 },
      { month: '2026-03', costType: 'FACTORY', currency: 'USD', total: 50, count: 1 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.currency).sort()).toEqual(['SAR', 'USD']);
    expect(rows.find((r) => r.currency === 'SAR')!.cost).toBe(100);
    expect(rows.find((r) => r.currency === 'USD')!.cost).toBe(50);
  });

  it('returns an empty array for no data', () => {
    expect(buildMonthlyMoney([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm -w apps/api run test -- sales.spec`
Expected: FAIL — cannot find module `../sales`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/analytics/lib/sales.ts`:

```ts
import type { CostBreakdownRow, MonthlyMoneyRow } from '../types';

export const REVENUE_COST_TYPE = 'SELLING_PRICE';

export function buildMonthlyMoney(rows: CostBreakdownRow[]): MonthlyMoneyRow[] {
  const buckets = new Map<string, MonthlyMoneyRow>();

  for (const row of rows) {
    const key = `${row.month}|${row.currency}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        month: row.month,
        currency: row.currency,
        revenue: 0,
        cost: 0,
        margin: null,
        marginPct: null,
      };
      buckets.set(key, bucket);
    }
    if (row.costType === REVENUE_COST_TYPE) bucket.revenue += row.total;
    else bucket.cost += row.total;
  }

  for (const bucket of buckets.values()) {
    if (bucket.revenue > 0) {
      bucket.margin = bucket.revenue - bucket.cost;
      bucket.marginPct = Math.round((bucket.margin / bucket.revenue) * 10000) / 100;
    }
  }

  return [...buckets.values()].sort(
    (a, b) => a.month.localeCompare(b.month) || a.currency.localeCompare(b.currency),
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npm -w apps/api run test -- sales.spec`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the service**

Create `apps/api/src/analytics/sales.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CostBreakdownRow, MonthlyMoneyRow } from './types';
import { buildMonthlyMoney } from './lib/sales';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  async getCostBreakdown(): Promise<CostBreakdownRow[]> {
    return this.prisma.$queryRaw<CostBreakdownRow[]>`
      SELECT to_char(oc.created_at, 'YYYY-MM') AS "month",
             oc.cost_type                      AS "costType",
             oc.currency                       AS "currency",
             SUM(oc.amount)::float8            AS "total",
             COUNT(*)::int                     AS "count"
      FROM order_costs oc
      GROUP BY 1, 2, 3
      ORDER BY 1 ASC, 2 ASC, 3 ASC
    `;
  }

  async getMonthlyMoney(): Promise<MonthlyMoneyRow[]> {
    return buildMonthlyMoney(await this.getCostBreakdown());
  }
}
```

- [ ] **Step 6: Add the routes**

In `analytics.controller.ts`:

```ts
  @Get('sales/cost-breakdown')
  getCostBreakdown() {
    return this.salesService.getCostBreakdown();
  }

  @Get('sales/monthly')
  getMonthlySales() {
    return this.salesService.getMonthlyMoney();
  }
```

Add `SalesService` to the constructor and to `analytics.module.ts` `providers`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/analytics
git commit -m "feat(api): add currency-safe sales & profit analytics"
```

---

### Task 6: Customers service

**Files:**
- Create: `apps/api/src/analytics/lib/customers.ts`
- Create: `apps/api/src/analytics/lib/__tests__/customers.spec.ts`
- Create: `apps/api/src/analytics/customers.service.ts`
- Modify: `apps/api/src/analytics/analytics.controller.ts`, `analytics.module.ts`

**Interfaces:**
- Consumes: `CustomerBreadthRow`, `CustomerSegmentRow`, `CustomerSegment` (Task 2)
- Produces: `segmentCustomers(rows, now)`; `CustomersService.getBreadth()`, `CustomersService.getSegments()`; routes `GET /api/v1/analytics/customers/breadth` and `GET /api/v1/analytics/customers/segments`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/analytics/lib/__tests__/customers.spec.ts`:

```ts
import { segmentCustomers } from '../customers';

const NOW = new Date('2026-07-26T00:00:00.000Z');
const base = { customerId: 'c1', customerCode: 'C-001', name: 'Acme' };

describe('segmentCustomers', () => {
  it('marks a customer who ordered 10 days ago as ACTIVE', () => {
    const [row] = segmentCustomers([{ ...base, lastOrderAt: '2026-07-16T00:00:00.000Z' }], NOW);
    expect(row.segment).toBe('ACTIVE');
    expect(row.daysSinceLastOrder).toBe(10);
  });

  it('marks 120 days as AT_RISK', () => {
    const [row] = segmentCustomers([{ ...base, lastOrderAt: '2026-03-28T00:00:00.000Z' }], NOW);
    expect(row.segment).toBe('AT_RISK');
  });

  it('marks 300 days as DORMANT', () => {
    const [row] = segmentCustomers([{ ...base, lastOrderAt: '2025-09-29T00:00:00.000Z' }], NOW);
    expect(row.segment).toBe('DORMANT');
  });

  it('marks a customer with no orders as NEVER_ORDERED with null days', () => {
    const [row] = segmentCustomers([{ ...base, lastOrderAt: null }], NOW);
    expect(row.segment).toBe('NEVER_ORDERED');
    expect(row.daysSinceLastOrder).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm -w apps/api run test -- customers.spec`
Expected: FAIL — cannot find module `../customers`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/analytics/lib/customers.ts`:

```ts
import type { CustomerSegment, CustomerSegmentRow } from '../types';

export interface RawCustomerRecency {
  customerId: string;
  customerCode: string;
  name: string;
  lastOrderAt: string | null;
}

export const ACTIVE_MAX_DAYS = 90;
export const AT_RISK_MAX_DAYS = 180;

const MS_PER_DAY = 86_400_000;

function classify(days: number | null): CustomerSegment {
  if (days === null) return 'NEVER_ORDERED';
  if (days <= ACTIVE_MAX_DAYS) return 'ACTIVE';
  if (days <= AT_RISK_MAX_DAYS) return 'AT_RISK';
  return 'DORMANT';
}

export function segmentCustomers(
  rows: RawCustomerRecency[],
  now: Date,
): CustomerSegmentRow[] {
  return rows.map((row) => {
    const days = row.lastOrderAt
      ? Math.floor((now.getTime() - new Date(row.lastOrderAt).getTime()) / MS_PER_DAY)
      : null;
    return { ...row, daysSinceLastOrder: days, segment: classify(days) };
  });
}
```

- [ ] **Step 4: Run the tests**

Run: `npm -w apps/api run test -- customers.spec`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the service**

Create `apps/api/src/analytics/customers.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CustomerBreadthRow, CustomerSegmentRow } from './types';
import { segmentCustomers, RawCustomerRecency } from './lib/customers';

@Injectable()
export class CustomersAnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async getBreadth(): Promise<CustomerBreadthRow[]> {
    return this.prisma.$queryRaw<CustomerBreadthRow[]>`
      SELECT c.id            AS "customerId",
             c.customer_code AS "customerCode",
             c.name          AS "name",
             COUNT(cp.product_id)::int AS "products"
      FROM customers c
      LEFT JOIN customer_products cp ON cp.customer_id = c.id
      WHERE c.is_active = true
      GROUP BY c.id, c.customer_code, c.name
      ORDER BY "products" DESC, c.name ASC
    `;
  }

  async getSegments(): Promise<CustomerSegmentRow[]> {
    const rows = await this.prisma.$queryRaw<RawCustomerRecency[]>`
      SELECT c.id            AS "customerId",
             c.customer_code AS "customerCode",
             c.name          AS "name",
             MAX(o.created_at) AS "lastOrderAt"
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id
      WHERE c.is_active = true
      GROUP BY c.id, c.customer_code, c.name
      ORDER BY "lastOrderAt" DESC NULLS LAST
    `;
    return segmentCustomers(rows, new Date());
  }
}
```

> The class is named `CustomersAnalyticsService` to avoid colliding with the existing `CustomersService` in `apps/api/src/customers/`.

- [ ] **Step 6: Add the routes**

In `analytics.controller.ts`:

```ts
  @Get('customers/breadth')
  getCustomerBreadth() {
    return this.customersService.getBreadth();
  }

  @Get('customers/segments')
  getCustomerSegments() {
    return this.customersService.getSegments();
  }
```

Inject as `private readonly customersService: CustomersAnalyticsService` and register in `providers`.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/analytics
git commit -m "feat(api): add customer analytics"
```

---

### Task 7: Operations & Lead Time service

**Files:**
- Create: `apps/api/src/analytics/lib/operations.ts`
- Create: `apps/api/src/analytics/lib/__tests__/operations.spec.ts`
- Create: `apps/api/src/analytics/operations.service.ts`
- Modify: `apps/api/src/analytics/analytics.controller.ts`, `analytics.module.ts`

**Interfaces:**
- Consumes: `CycleTimeRow`, `StatusDwellRow`, `OverdueOrderRow`, `FactoryLeadTimeRow` (Task 2)
- Produces: `averageStatusDwell(entries)`; `OperationsService.getCycleTimes()`, `.getStatusDwell()`, `.getOverdue()`, `.getFactoryLeadTimes()`; routes under `GET /api/v1/analytics/operations/*`.

- [ ] **Step 1: Write the failing test**

Create `apps/api/src/analytics/lib/__tests__/operations.spec.ts`:

```ts
import { averageStatusDwell } from '../operations';

describe('averageStatusDwell', () => {
  it('averages the days an order spent in each status', () => {
    const result = averageStatusDwell([
      { orderId: 'o1', newStatus: 'NEW', changedAt: '2026-01-01T00:00:00.000Z' },
      { orderId: 'o1', newStatus: 'MOLD_READY', changedAt: '2026-01-03T00:00:00.000Z' },
      { orderId: 'o1', newStatus: 'COMPLETED', changedAt: '2026-01-08T00:00:00.000Z' },
    ]);
    const New = result.find((r) => r.status === 'NEW')!;
    const mold = result.find((r) => r.status === 'MOLD_READY')!;
    expect(New.averageDays).toBe(2);
    expect(mold.averageDays).toBe(5);
  });

  it('ignores the final status of an order, which has no successor', () => {
    const result = averageStatusDwell([
      { orderId: 'o1', newStatus: 'NEW', changedAt: '2026-01-01T00:00:00.000Z' },
      { orderId: 'o1', newStatus: 'COMPLETED', changedAt: '2026-01-02T00:00:00.000Z' },
    ]);
    expect(result.find((r) => r.status === 'COMPLETED')).toBeUndefined();
  });

  it('does not bridge across different orders', () => {
    const result = averageStatusDwell([
      { orderId: 'o1', newStatus: 'NEW', changedAt: '2026-01-01T00:00:00.000Z' },
      { orderId: 'o2', newStatus: 'NEW', changedAt: '2026-06-01T00:00:00.000Z' },
    ]);
    expect(result).toEqual([]);
  });

  it('returns an empty array for no history', () => {
    expect(averageStatusDwell([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm -w apps/api run test -- operations.spec`
Expected: FAIL — cannot find module `../operations`.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/analytics/lib/operations.ts`:

```ts
import type { StatusDwellRow } from '../types';

export interface RawStatusEntry {
  orderId: string;
  newStatus: string;
  changedAt: string;
}

const MS_PER_DAY = 86_400_000;

export function averageStatusDwell(entries: RawStatusEntry[]): StatusDwellRow[] {
  const byOrder = new Map<string, RawStatusEntry[]>();
  for (const entry of entries) {
    const list = byOrder.get(entry.orderId) ?? [];
    list.push(entry);
    byOrder.set(entry.orderId, list);
  }

  const totals = new Map<string, { days: number; samples: number }>();

  for (const list of byOrder.values()) {
    list.sort((a, b) => a.changedAt.localeCompare(b.changedAt));
    for (let i = 0; i < list.length - 1; i++) {
      const days =
        (new Date(list[i + 1].changedAt).getTime() - new Date(list[i].changedAt).getTime()) /
        MS_PER_DAY;
      const bucket = totals.get(list[i].newStatus) ?? { days: 0, samples: 0 };
      bucket.days += days;
      bucket.samples += 1;
      totals.set(list[i].newStatus, bucket);
    }
  }

  return [...totals.entries()]
    .map(([status, { days, samples }]) => ({
      status,
      averageDays: Math.round((days / samples) * 100) / 100,
      samples,
    }))
    .sort((a, b) => b.averageDays - a.averageDays);
}
```

- [ ] **Step 4: Run the tests**

Run: `npm -w apps/api run test -- operations.spec`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the service**

Create `apps/api/src/analytics/operations.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CycleTimeRow, FactoryLeadTimeRow, OverdueOrderRow, StatusDwellRow } from './types';
import { averageStatusDwell, RawStatusEntry } from './lib/operations';

@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  async getCycleTimes(): Promise<CycleTimeRow[]> {
    return this.prisma.$queryRaw<CycleTimeRow[]>`
      SELECT o.id           AS "orderId",
             o.order_number AS "orderNumber",
             ROUND((EXTRACT(EPOCH FROM (o.completed_at - o.created_at)) / 86400)::numeric, 2)::float8 AS "days"
      FROM orders o
      WHERE o.completed_at IS NOT NULL
      ORDER BY "days" DESC
    `;
  }

  async getStatusDwell(): Promise<StatusDwellRow[]> {
    const entries = await this.prisma.$queryRaw<RawStatusEntry[]>`
      SELECT h.order_id   AS "orderId",
             h.new_status AS "newStatus",
             h.changed_at AS "changedAt"
      FROM order_status_history h
      ORDER BY h.order_id ASC, h.changed_at ASC
    `;
    return averageStatusDwell(
      entries.map((e) => ({ ...e, changedAt: new Date(e.changedAt).toISOString() })),
    );
  }

  async getOverdue(): Promise<OverdueOrderRow[]> {
    return this.prisma.$queryRaw<OverdueOrderRow[]>`
      SELECT o.id            AS "orderId",
             o.order_number  AS "orderNumber",
             c.name          AS "customerName",
             o.expected_delivery_date AS "expectedDeliveryDate",
             FLOOR(EXTRACT(EPOCH FROM (NOW() - o.expected_delivery_date)) / 86400)::int AS "daysOverdue"
      FROM orders o
      JOIN customers c ON c.id = o.customer_id
      WHERE o.completed_at IS NULL
        AND o.expected_delivery_date IS NOT NULL
        AND o.expected_delivery_date < NOW()
      ORDER BY "daysOverdue" DESC
    `;
  }

  async getFactoryLeadTimes(): Promise<FactoryLeadTimeRow[]> {
    return this.prisma.$queryRaw<FactoryLeadTimeRow[]>`
      SELECT f.id   AS "factoryId",
             f.name AS "factoryName",
             COUNT(o.id)::int AS "orderCount",
             COUNT(o.completed_at)::int AS "completedCount",
             ROUND(AVG(EXTRACT(EPOCH FROM (o.completed_at - o.created_at)) / 86400)::numeric, 2)::float8 AS "averageLeadDays"
      FROM factories f
      LEFT JOIN orders o ON o.factory_id = f.id
      GROUP BY f.id, f.name
      ORDER BY "orderCount" DESC
    `;
  }
}
```

- [ ] **Step 6: Add the routes**

In `analytics.controller.ts`:

```ts
  @Get('operations/cycle-times')
  getCycleTimes() {
    return this.operationsService.getCycleTimes();
  }

  @Get('operations/status-dwell')
  getStatusDwell() {
    return this.operationsService.getStatusDwell();
  }

  @Get('operations/overdue')
  getOverdue() {
    return this.operationsService.getOverdue();
  }

  @Get('operations/factory-lead-times')
  getFactoryLeadTimes() {
    return this.operationsService.getFactoryLeadTimes();
  }
```

Inject `OperationsService` and register it in `providers`.

- [ ] **Step 7: Run the full API test suite**

Run: `npm -w apps/api run test`
Expected: PASS, 17 tests (1 harness + 4 stock + 4 sales + 4 customers + 4 operations).

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/analytics
git commit -m "feat(api): add operations & lead time analytics"
```

---

### Task 8: EmptyState component and recharts

Three of four dashboards will be empty on delivery. This component is what makes that honest rather than misleading.

**Files:**
- Create: `apps/web/src/components/ui/empty-state.tsx`
- Modify: `apps/web/src/components/ui/index.ts`
- Modify: `apps/web/package.json` (recharts)

**Interfaces:**
- Consumes: nothing
- Produces: `<EmptyState reason="…" hint="…" />`, used by every dashboard widget in Tasks 10–13.

- [ ] **Step 1: Install recharts**

```bash
npm -w apps/web install recharts
```

- [ ] **Step 2: Create the component**

Create `apps/web/src/components/ui/empty-state.tsx`:

```tsx
'use client';

import { Inbox } from 'lucide-react';

export interface EmptyStateProps {
  reason: string;
  hint?: string;
}

export function EmptyState({ reason, hint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <Inbox className="h-6 w-6 text-gray-300" />
      <p className="text-sm font-medium text-gray-600">{reason}</p>
      {hint && <p className="max-w-sm text-xs text-gray-400">{hint}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Export it**

In `apps/web/src/components/ui/index.ts`, add:

```ts
export * from './empty-state';
```

- [ ] **Step 4: Verify the web app builds**

Run: `npm run build:web`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/ui apps/web/package.json package-lock.json
git commit -m "feat(web): add EmptyState component and recharts"
```

---

### Task 9: Analytics section shell

**Files:**
- Create: `apps/web/src/app/(dashboard)/analytics/layout.tsx`
- Create: `apps/web/src/app/(dashboard)/analytics/page.tsx` (redirects to `/analytics/stock`)
- Modify: `apps/web/src/app/(dashboard)/reports/page.tsx` (replace body with a redirect to `/analytics`)
- Modify: `apps/web/src/components/layout/sidebar.tsx:61`

**Interfaces:**
- Consumes: nothing
- Produces: the tabbed shell that Tasks 10–13 add pages into, at routes `/analytics/{stock,sales,customers,operations}`.

- [ ] **Step 1: Create the layout with tabs**

Create `apps/web/src/app/(dashboard)/analytics/layout.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/analytics/stock', label: 'Stock & Demand' },
  { href: '/analytics/sales', label: 'Sales & Profit' },
  { href: '/analytics/customers', label: 'Customers' },
  { href: '/analytics/operations', label: 'Operations' },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
      <nav className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              'whitespace-nowrap border-b-2 px-4 py-2 text-sm font-medium transition-colors',
              pathname === tab.href
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-800',
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Redirect the section root**

Create `apps/web/src/app/(dashboard)/analytics/page.tsx`:

```tsx
import { redirect } from 'next/navigation';

export default function AnalyticsIndexPage() {
  redirect('/analytics/stock');
}
```

- [ ] **Step 3: Redirect the old reports route**

Replace the entire contents of `apps/web/src/app/(dashboard)/reports/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';

export default function ReportsPage() {
  redirect('/analytics');
}
```

- [ ] **Step 4: Update the sidebar**

In `apps/web/src/components/layout/sidebar.tsx`, replace line 61 with:

```tsx
      { href: '/analytics', label: 'Analytics', icon: BarChart3, permission: PERMISSIONS.VIEW_REPORTS },
```

- [ ] **Step 5: Verify manually**

Run `npm run dev`, sign in, click **Analytics** in the sidebar.
Expected: lands on `/analytics/stock`, four tabs visible, the active tab is underlined. Visiting `/reports` redirects to `/analytics`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/analytics apps/web/src/app/\(dashboard\)/reports apps/web/src/components/layout/sidebar.tsx
git commit -m "feat(web): add analytics section shell and retire /reports"
```

---

### Task 10: Stock & Demand page

**Files:**
- Create: `apps/web/src/app/(dashboard)/analytics/stock/page.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/analytics/stock/demand`, `GET /api/v1/analytics/stock/catalogue-health` (Task 4); `EmptyState` (Task 8)
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/(dashboard)/analytics/stock/page.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Loading, EmptyState } from '@/components/ui';

interface ProductDemandRow {
  productId: string;
  sku: string;
  nameEn: string;
  inventory: number;
  customers: number;
  stockGap: boolean;
}

interface CatalogueHealth {
  totalProducts: number;
  productsWithoutCustomer: number;
  productsWithoutDrawing: number;
  totalLinks: number;
}

export default function StockAnalyticsPage() {
  const { data: demand, isLoading: loadingDemand } = useQuery({
    queryKey: ['analytics', 'stock', 'demand'],
    queryFn: () => api.get<ProductDemandRow[]>('/api/v1/analytics/stock/demand'),
  });

  const { data: health } = useQuery({
    queryKey: ['analytics', 'stock', 'health'],
    queryFn: () => api.get<CatalogueHealth>('/api/v1/analytics/stock/catalogue-health'),
  });

  const gaps = (demand ?? []).filter((r) => r.stockGap);
  const wanted = (demand ?? []).filter((r) => r.customers > 0);
  const dead = (demand ?? []).filter((r) => r.customers === 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card><p className="text-xs text-gray-500">Products</p><p className="text-2xl font-bold">{health?.totalProducts ?? '—'}</p></Card>
        <Card><p className="text-xs text-gray-500">Customer links</p><p className="text-2xl font-bold">{health?.totalLinks ?? '—'}</p></Card>
        <Card><p className="text-xs text-gray-500">No customer</p><p className="text-2xl font-bold text-amber-600">{health?.productsWithoutCustomer ?? '—'}</p></Card>
        <Card><p className="text-xs text-gray-500">No drawing</p><p className="text-2xl font-bold text-red-600">{health?.productsWithoutDrawing ?? '—'}</p></Card>
      </div>

      <Card title="Stock gaps — wanted by 2+ customers, zero inventory">
        {loadingDemand ? <Loading className="min-h-0 py-8" />
          : gaps.length === 0 ? <EmptyState reason="No stock gaps." hint="Every product wanted by two or more customers currently has inventory." />
          : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="border-b border-gray-200">
                  <th className="px-4 py-2 text-left font-medium text-gray-700">SKU</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">Product</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Customers</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Inventory</th>
                </tr></thead>
                <tbody>
                  {gaps.map((r) => (
                    <tr key={r.productId} className="border-b border-gray-100 bg-red-50/40">
                      <td className="px-4 py-2 font-mono text-xs">{r.sku}</td>
                      <td className="px-4 py-2">{r.nameEn}</td>
                      <td className="px-4 py-2 text-right font-semibold">{r.customers}</td>
                      <td className="px-4 py-2 text-right font-semibold text-red-600">{r.inventory}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <Card title="Demand vs stock">
        {loadingDemand ? <Loading className="min-h-0 py-8" />
          : wanted.length === 0 ? <EmptyState reason="No products are linked to customers yet." hint="Link products to customers from the customer page to build demand data." />
          : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead><tr className="border-b border-gray-200">
                  <th className="px-4 py-2 text-left font-medium text-gray-700">SKU</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Customers</th>
                  <th className="px-4 py-2 text-right font-medium text-gray-700">Inventory</th>
                </tr></thead>
                <tbody>
                  {wanted.map((r) => (
                    <tr key={r.productId} className="border-b border-gray-100">
                      <td className="px-4 py-2 font-mono text-xs">{r.sku}</td>
                      <td className="px-4 py-2 text-right">{r.customers}</td>
                      <td className="px-4 py-2 text-right">{r.inventory}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>

      <Card title={`Dead catalogue — no customer linked (${dead.length})`}>
        {dead.length === 0 ? <EmptyState reason="Every product is linked to at least one customer." />
          : (
            <div className="flex flex-wrap gap-2">
              {dead.map((r) => (
                <span key={r.productId} className="rounded bg-gray-100 px-2 py-1 font-mono text-xs text-gray-600">{r.sku}</span>
              ))}
            </div>
          )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

Run `npm run dev`, open `/analytics/stock`.
Expected against current data: 176 products, 154 links, 65 with no customer, 1 with no drawing; the stock-gap table lists `THF-HI-4k-1000-22-D084`, `THF-MV-6k-1000-32-D025`, `THF-SP-4k-50-44-D020` among others.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/analytics/stock
git commit -m "feat(web): add stock & demand dashboard"
```

---

### Task 11: Sales & Profit page

**Files:**
- Create: `apps/web/src/app/(dashboard)/analytics/sales/page.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/analytics/sales/monthly`, `GET /api/v1/analytics/sales/cost-breakdown` (Task 5); `EmptyState` (Task 8); `recharts` (Task 8)

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/(dashboard)/analytics/sales/page.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { api } from '@/lib/api';
import { Card, Loading, EmptyState } from '@/components/ui';

interface MonthlyMoneyRow {
  month: string;
  currency: string;
  revenue: number;
  cost: number;
  margin: number | null;
  marginPct: number | null;
}

export default function SalesAnalyticsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics', 'sales', 'monthly'],
    queryFn: () => api.get<MonthlyMoneyRow[]>('/api/v1/analytics/sales/monthly'),
  });

  const rows = data ?? [];
  const currencies = [...new Set(rows.map((r) => r.currency))];
  const hasRevenue = rows.some((r) => r.revenue > 0);

  if (isLoading) return <Loading />;

  return (
    <div className="space-y-6">
      {currencies.length > 1 && (
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Costs are recorded in {currencies.join(', ')}. Figures are shown per currency and are never added together.
        </p>
      )}

      <Card title="Margin by month">
        {!hasRevenue ? (
          <EmptyState
            reason="No selling prices recorded."
            hint="Add a SELLING_PRICE cost to an order to see revenue and margin here. Until then only costs can be reported."
          />
        ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Bar dataKey="revenue" fill="#2563eb" name="Revenue" />
                <Bar dataKey="cost" fill="#f59e0b" name="Cost" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Monthly costs">
        {rows.length === 0 ? (
          <EmptyState reason="No costs recorded yet." hint="Costs appear here once orders have cost entries." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b border-gray-200">
                <th className="px-4 py-2 text-left font-medium text-gray-700">Month</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Currency</th>
                <th className="px-4 py-2 text-right font-medium text-gray-700">Cost</th>
                <th className="px-4 py-2 text-right font-medium text-gray-700">Revenue</th>
                <th className="px-4 py-2 text-right font-medium text-gray-700">Margin</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={`${r.month}-${r.currency}`} className="border-b border-gray-100">
                    <td className="px-4 py-2">{r.month}</td>
                    <td className="px-4 py-2">{r.currency}</td>
                    <td className="px-4 py-2 text-right">{r.cost.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">{r.revenue.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">
                      {r.margin === null ? <span className="text-gray-400">—</span> : r.margin.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

Open `/analytics/sales`.
Expected against current data: the margin card shows the "No selling prices recorded" empty state (not a zero bar), and the cost table shows one row — `2026-03 | SAR | 930.00 | 0.00 | —`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/analytics/sales
git commit -m "feat(web): add sales & profit dashboard"
```

---

### Task 12: Customers page

**Files:**
- Create: `apps/web/src/app/(dashboard)/analytics/customers/page.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/analytics/customers/breadth`, `GET /api/v1/analytics/customers/segments` (Task 6); `EmptyState` (Task 8)

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/(dashboard)/analytics/customers/page.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Loading, EmptyState } from '@/components/ui';

type CustomerSegment = 'ACTIVE' | 'AT_RISK' | 'DORMANT' | 'NEVER_ORDERED';

interface CustomerSegmentRow {
  customerId: string;
  customerCode: string;
  name: string;
  lastOrderAt: string | null;
  daysSinceLastOrder: number | null;
  segment: CustomerSegment;
}

interface CustomerBreadthRow {
  customerId: string;
  customerCode: string;
  name: string;
  products: number;
}

const SEGMENT_STYLE: Record<CustomerSegment, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  AT_RISK: 'bg-amber-100 text-amber-700',
  DORMANT: 'bg-red-100 text-red-700',
  NEVER_ORDERED: 'bg-gray-100 text-gray-600',
};

export default function CustomerAnalyticsPage() {
  const { data: segments, isLoading } = useQuery({
    queryKey: ['analytics', 'customers', 'segments'],
    queryFn: () => api.get<CustomerSegmentRow[]>('/api/v1/analytics/customers/segments'),
  });

  const { data: breadth } = useQuery({
    queryKey: ['analytics', 'customers', 'breadth'],
    queryFn: () => api.get<CustomerBreadthRow[]>('/api/v1/analytics/customers/breadth'),
  });

  if (isLoading) return <Loading />;

  const rows = segments ?? [];
  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.segment] = (acc[r.segment] ?? 0) + 1;
    return acc;
  }, {});

  const linked = (breadth ?? []).filter((b) => b.products > 0);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(['ACTIVE', 'AT_RISK', 'DORMANT', 'NEVER_ORDERED'] as CustomerSegment[]).map((s) => (
          <Card key={s}>
            <p className="text-xs text-gray-500">{s.replace('_', ' ')}</p>
            <p className="text-2xl font-bold">{counts[s] ?? 0}</p>
          </Card>
        ))}
      </div>

      <Card title="Products per customer">
        {linked.length === 0 ? (
          <EmptyState reason="No customer is linked to a product yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b border-gray-200">
                <th className="px-4 py-2 text-left font-medium text-gray-700">Code</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Customer</th>
                <th className="px-4 py-2 text-right font-medium text-gray-700">Products</th>
              </tr></thead>
              <tbody>
                {linked.map((b) => (
                  <tr key={b.customerId} className="border-b border-gray-100">
                    <td className="px-4 py-2 font-mono text-xs">{b.customerCode}</td>
                    <td className="px-4 py-2">{b.name}</td>
                    <td className="px-4 py-2 text-right font-semibold">{b.products}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Customer recency">
        {rows.length === 0 ? (
          <EmptyState reason="No customers found." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b border-gray-200">
                <th className="px-4 py-2 text-left font-medium text-gray-700">Customer</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Segment</th>
                <th className="px-4 py-2 text-right font-medium text-gray-700">Days since order</th>
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.customerId} className="border-b border-gray-100">
                    <td className="px-4 py-2">{r.name}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEGMENT_STYLE[r.segment]}`}>
                        {r.segment.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {r.daysSinceLastOrder === null ? <span className="text-gray-400">—</span> : r.daysSinceLastOrder}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Verify manually**

Open `/analytics/customers`.
Expected against current data: 47 customers, the vast majority in `NEVER_ORDERED`; "Products per customer" is well populated (46 customers have links).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/analytics/customers
git commit -m "feat(web): add customer analytics dashboard"
```

---

### Task 13: Operations & Lead Time page

**Files:**
- Create: `apps/web/src/app/(dashboard)/analytics/operations/page.tsx`

**Interfaces:**
- Consumes: the four `GET /api/v1/analytics/operations/*` routes (Task 7); `EmptyState` (Task 8)

- [ ] **Step 1: Create the page**

Create `apps/web/src/app/(dashboard)/analytics/operations/page.tsx`:

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, Loading, EmptyState } from '@/components/ui';

interface StatusDwellRow { status: string; averageDays: number; samples: number }
interface CycleTimeRow { orderId: string; orderNumber: string; days: number }
interface OverdueOrderRow { orderId: string; orderNumber: string; customerName: string; expectedDeliveryDate: string; daysOverdue: number }
interface FactoryLeadTimeRow { factoryId: string; factoryName: string; orderCount: number; completedCount: number; averageLeadDays: number | null }

export default function OperationsAnalyticsPage() {
  const { data: dwell, isLoading } = useQuery({
    queryKey: ['analytics', 'operations', 'dwell'],
    queryFn: () => api.get<StatusDwellRow[]>('/api/v1/analytics/operations/status-dwell'),
  });
  const { data: cycles } = useQuery({
    queryKey: ['analytics', 'operations', 'cycles'],
    queryFn: () => api.get<CycleTimeRow[]>('/api/v1/analytics/operations/cycle-times'),
  });
  const { data: overdue } = useQuery({
    queryKey: ['analytics', 'operations', 'overdue'],
    queryFn: () => api.get<OverdueOrderRow[]>('/api/v1/analytics/operations/overdue'),
  });
  const { data: factories } = useQuery({
    queryKey: ['analytics', 'operations', 'factories'],
    queryFn: () => api.get<FactoryLeadTimeRow[]>('/api/v1/analytics/operations/factory-lead-times'),
  });

  if (isLoading) return <Loading />;

  const avgCycle = (cycles ?? []).length
    ? ((cycles ?? []).reduce((s, c) => s + c.days, 0) / (cycles ?? []).length).toFixed(1)
    : null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><p className="text-xs text-gray-500">Completed orders</p><p className="text-2xl font-bold">{cycles?.length ?? 0}</p></Card>
        <Card><p className="text-xs text-gray-500">Avg cycle (days)</p><p className="text-2xl font-bold">{avgCycle ?? '—'}</p></Card>
        <Card><p className="text-xs text-gray-500">Overdue orders</p><p className="text-2xl font-bold text-red-600">{overdue?.length ?? 0}</p></Card>
      </div>

      <Card title="Where orders wait — average days per status">
        {(dwell ?? []).length === 0 ? (
          <EmptyState reason="Not enough status history yet." hint="Bottlenecks appear once orders have moved through several statuses." />
        ) : (
          <div className="space-y-2">
            {(dwell ?? []).map((d) => {
              const max = Math.max(...(dwell ?? []).map((x) => x.averageDays), 1);
              return (
                <div key={d.status} className="flex items-center gap-3">
                  <span className="w-52 shrink-0 truncate text-xs text-gray-600">{d.status}</span>
                  <div className="h-3 flex-1 rounded bg-gray-100">
                    <div className="h-3 rounded bg-blue-500" style={{ width: `${(d.averageDays / max) * 100}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-xs text-gray-600">{d.averageDays}d ({d.samples})</span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Overdue orders">
        {(overdue ?? []).length === 0 ? (
          <EmptyState reason="No overdue orders." hint="Orders past their expected delivery date and not yet completed appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b border-gray-200">
                <th className="px-4 py-2 text-left font-medium text-gray-700">Order</th>
                <th className="px-4 py-2 text-left font-medium text-gray-700">Customer</th>
                <th className="px-4 py-2 text-right font-medium text-gray-700">Days overdue</th>
              </tr></thead>
              <tbody>
                {(overdue ?? []).map((o) => (
                  <tr key={o.orderId} className="border-b border-gray-100">
                    <td className="px-4 py-2 font-mono text-xs">{o.orderNumber}</td>
                    <td className="px-4 py-2">{o.customerName}</td>
                    <td className="px-4 py-2 text-right font-semibold text-red-600">{o.daysOverdue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Factory lead times">
        {(factories ?? []).length === 0 ? (
          <EmptyState reason="No factories recorded." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead><tr className="border-b border-gray-200">
                <th className="px-4 py-2 text-left font-medium text-gray-700">Factory</th>
                <th className="px-4 py-2 text-right font-medium text-gray-700">Orders</th>
                <th className="px-4 py-2 text-right font-medium text-gray-700">Completed</th>
                <th className="px-4 py-2 text-right font-medium text-gray-700">Avg lead (days)</th>
              </tr></thead>
              <tbody>
                {(factories ?? []).map((f) => (
                  <tr key={f.factoryId} className="border-b border-gray-100">
                    <td className="px-4 py-2">{f.factoryName}</td>
                    <td className="px-4 py-2 text-right">{f.orderCount}</td>
                    <td className="px-4 py-2 text-right">{f.completedCount}</td>
                    <td className="px-4 py-2 text-right">
                      {f.averageLeadDays === null ? <span className="text-gray-400">—</span> : f.averageLeadDays}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Run the full verification**

```bash
npm -w apps/api run test
npm run lint
npm run build:web
npm run build:api
```

Expected: 17 tests pass; lint clean; both builds succeed.

- [ ] **Step 3: Verify manually**

Open `/analytics/operations`.
Expected against current data: 1 completed order, the status-dwell bars populated from 30 history rows, factory table listing 5 factories.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/\(dashboard\)/analytics/operations
git commit -m "feat(web): add operations & lead time dashboard"
```

---

## Deployment note

Deploying this reaches production via `backups/deploy-todo.ps1`, which copies `apps/` and `prisma/` into `/opt/hqq-oms` and restarts pm2. No migration is required — this plan adds **no schema changes**. Uploads now live at `/opt/hqq-oms/uploads` (outside `apps/`) and are unaffected by the copy.
