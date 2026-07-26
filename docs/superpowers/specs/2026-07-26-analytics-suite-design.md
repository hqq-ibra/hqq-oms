# HQQ OMS — Analytics Suite (Design)

Date: 2026-07-26
Status: Approved for planning

## Goal

Replace the current four-card `/reports` page with a four-dashboard **Analytics** section:
Stock & Demand, Sales & Profit, Customers, Operations & Lead Time.

The user has explicitly chosen to build all four now, accepting that three will be
sparse until data accumulates. Graceful, explanatory empty states are therefore a
**core requirement**, not polish.

## Data reality (measured on production, 2026-07-26)

| Table | Rows |
|---|---|
| products | 176 |
| customer_products | 154 |
| customers | 47 |
| factories | 5 |
| projects | 7 |
| order_status_history | 30 |
| orders | 4 |
| order_items | 4 |
| **order_costs** | **1** (one `FACTORY` row, 930 SAR) |

Consequences that shape the design:

- **`SELLING_PRICE` is never recorded.** `CostType` supports it, but no row uses it.
  Revenue and margin are therefore **structurally uncomputable today**. Every money
  widget must degrade to a specific empty state, not a zero.
- The existing **"Monthly Profit" report is misnamed** — it sums all `order_costs`
  and labels the total profit. It is renamed **"Monthly Costs"** here, and true
  profit appears only once selling prices exist.
- **Stock & Demand is fully supported now** and is the only dashboard with rich data.

## Architecture

### API — new `analytics` module

`apps/api/src/reports/` stays as-is (its four endpoints keep working during
migration). New work goes in `apps/api/src/analytics/`:

```
analytics/
  analytics.module.ts
  analytics.controller.ts      // thin: routes -> services
  types.ts                     // row types shared by the services
  stock.service.ts             // demand vs inventory, catalogue health
  sales.service.ts             // revenue, cost, margin (currency-grouped)
  customers.service.ts         // segments, reorder, product breadth
  operations.service.ts        // cycle time, status dwell, factory lead time
  lib/                         // pure functions, unit-tested without a database
    stock.ts  sales.ts  customers.ts  operations.ts
```

Types live here rather than in `packages/shared`: that workspace package exists
but is **completely unwired** — nothing in `apps/api` or `apps/web` imports
`@hqq/shared`, and it is not a dependency of `apps/api`. Wiring it up is out of
scope. The web pages declare their own interfaces inline, matching the existing
`reports/page.tsx` pattern.

`apps/api` has **no test infrastructure at all** today (no jest, no test script,
no test files), so the first implementation task establishes it.

Four small services rather than one — each is independently testable and none
grows past a few hundred lines. The existing `reports.service.ts` loads whole
tables with `findMany()` and aggregates in JavaScript; new services **must**
aggregate in SQL (`prisma.$queryRaw` or `groupBy`) so they stay correct as the
order tables grow.

Routes under `GET /api/v1/analytics/*`, guarded exactly like `ReportsController`:
`@UseGuards(JwtAuthGuard, PermissionsGuard)` + `@RequirePermissions('VIEW_REPORTS')`.
No new permission is introduced.

### Currency rule (important)

`order_costs.currency` is SAR | USD | CNY. There is no FX table and inventing
rates would silently corrupt every money figure. **v1 never sums across
currencies.** All monetary aggregates are grouped by currency and rendered as
separate rows/series, with a note when more than one currency is present.
FX normalisation is explicitly out of scope.

### Web

New route group `apps/web/src/app/(dashboard)/analytics/` with a shared tab bar
and one page per dashboard. `/reports` redirects to `/analytics`. Sidebar entry
renamed Reports -> Analytics.

Data fetching follows the existing `@tanstack/react-query` pattern used in
`reports/page.tsx`. Reuse `Card`, `DataTable`, `Badge`, `Loading` from
`components/ui`.

**New dependency:** `recharts` for trend/bar charts. Ranking tables stay tables —
they read better and already match the app's style.

**New shared component:** `components/ui/empty-state.tsx` — takes a reason and an
optional action hint. Used by every widget that can be empty.

## Dashboards

### 1. Stock & Demand — fully populated today

- **Demand vs Stock table**: each product with its linked-customer count and
  `inventory`, sorted by demand. Rows where `customers >= 2 AND inventory = 0`
  are flagged as a stock gap (this is the primary deliverable — it already
  surfaces `THF-HI-4k-1000-22-D084`, `THF-MV-6k-1000-32-D025`, `THF-SP-4k-50-44-D020`).
- **Dead catalogue**: products linked to zero customers (currently 65 of 176).
- **Catalogue health tiles**: total products, % with a drawing (currently 175/176),
  % linked to a customer.
- Source: `products`, `customer_products`, `files (entity_type='PRODUCT')`.

### 2. Sales & Profit — sparse until prices are captured

- Monthly **Costs** by cost type and currency (honest rename of the old card).
- Revenue, cost and margin per month / product / customer — each rendered only
  when `SELLING_PRICE` rows exist, otherwise an empty state reading:
  *"No selling prices recorded. Add a SELLING_PRICE cost to an order to see margin."*
- Source: `order_costs` joined to `orders`, `products`, `customers`.

### 3. Customers — partially populated

- **Product breadth per customer** (from `customer_products`, 154 links) — works today.
- Segments by recency of last order: Active / At-risk / Dormant, replacing the
  standalone "Inactive Customers" card.
- Order count, first/last order, average days between orders — sparse at 4 orders.
- Source: `customers`, `orders`, `customer_products`.

### 4. Operations & Lead Time — sparse

- Cycle time `created_at -> completed_at` for completed orders (1 today).
- **Average dwell per status** from `order_status_history` (30 rows — the most
  usable operational data available).
- Factory lead time and order counts; overdue orders where
  `expected_delivery_date < now()` and not completed.
- Source: `orders`, `order_status_history`, `factories`.

## Testing

- Unit tests per service against a seeded test database, covering the **empty
  case explicitly** (zero orders, zero costs) — that is the current production
  state and the most likely regression.
- Currency grouping test: costs in two currencies must never be summed.
- Stock-gap rule test: `customers >= 2 AND inventory = 0` flags correctly.

## Out of scope

- FX conversion between currencies.
- Making `SELLING_PRICE` mandatory on order creation (recommended separately —
  without it, dashboard 2 stays empty indefinitely).
- Export to Excel/PDF.
- Backfilling historical prices.

## Risks

- Three of four dashboards will look empty on delivery. This is expected and
  accepted; empty states must explain *why* rather than showing 0.00.
- `reports.service.ts` aggregation patterns should not be copied.
