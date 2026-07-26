# Project status — 2026-07-26

Handoff snapshot. Read with [DEPLOYMENT.md](./DEPLOYMENT.md) for the deploy procedure.

## Where things stand

`main` is the source of truth and matches production. All work below is merged and pushed
to `github.com/hqq-ibra/hqq-oms`. Branches `feat/analytics-suite`, `feat/android-twa`,
`feat/todo-section`, `feat/uploads-dir-hardening`, `feat/analytics-polish`,
`docs/deployment-runbook` and `fix/honesty-and-env` are all merged; keeping or deleting
them is a free choice.

## Shipped today

**Analytics section** (`/analytics`) — four dashboards: Stock & Demand, Sales & Profit,
Customers, Operations. Backed by `apps/api/src/analytics/` (4 services, 10 routes, SQL
aggregation, guarded by `VIEW_REPORTS`). The old `/reports` page is unchanged and still
listed separately in the sidebar.

**Jest for the API.** There were no tests at all before. `npm -w apps/api run test`,
currently 28 passing. Pure logic lives in `analytics/lib/` so it is testable without a
database; the services are thin SQL wrappers verified directly against production.

**Two production incidents fixed.**
- *Uploads 404.* pm2 runs with cwd `/opt/hqq-oms` while nginx served
  `/opt/hqq-oms/apps/api/uploads/`, so every new upload landed somewhere unserved. Files
  migrated, nginx repointed to `/opt/hqq-oms/uploads/`, and all upload paths now resolve
  through `apps/api/src/config/uploads.ts` (`UPLOADS_DIR`, set in the pm2 process env).
- *Sidebar hid gated nav items.* The login response returns raw `UserPermission` rows, so
  `user.permissions` holds objects like `{permissionKey:'VIEW_REPORTS'}`; only the JWT
  payload is flattened to strings. `sidebar.tsx` compared those objects to a string with
  `.includes()`, always false, hiding Reports and Analytics from everyone. Now handles
  both shapes and mirrors the API's ADMIN bypass.

**Search engines blocked.** `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` on all
responses including `/uploads/` PDFs, plus `/robots.txt`. See DEPLOYMENT.md for why
robots.txt deliberately permits crawling.

**Type checking restored.** The 6 pre-existing errors are cleared and
`typescript.ignoreBuildErrors` is back to `false`, so builds fail on type errors again.

**"Monthly Profit" corrected.** It summed every `order_costs` row — including
`SELLING_PRICE` — across currencies, and called the result profit. Now "Monthly Costs":
excludes selling prices, groups by currency, aggregates in SQL.

## The thing that most limits value

Production has **4 orders, one cost row, and zero `SELLING_PRICE` rows**. So three of the
four dashboards are legitimately near-empty and Sales cannot show revenue or margin.

**No feature is missing.** The order detail page already has a full cost-entry form
offering every cost type including Selling Price, and already computes per-order profit.
Open an order → Costs → add a **Selling Price** entry, and the Sales dashboard populates.

Catalogue data is rich by contrast: 176 products, 47 customers, 154 customer-product
links, 3 genuinely overdue orders (119/84/69 days). Stock & Demand is the dashboard with
real signal — it surfaces products several customers want that have zero inventory.

## Two invariants not to break

1. **Never sum money across currencies.** `order_costs.currency` is SAR/USD/CNY and no
   exchange rate exists anywhere. Aggregates group by `(month, currency)`.
2. **Unknown is not zero.** `margin === null` means no selling price was recorded; render
   `—`, never `0.00`. Same for `averageLeadDays` and `daysSinceLastOrder`. Panels must
   distinguish loading, error and genuinely-empty — an `EmptyState` that renders before
   its data arrives asserts something false.

## Known, deliberately unfixed

- **The API never reads `.env`.** No `ConfigModule`, no `dotenv` in `apps/api`. Prisma
  loads it independently for `DATABASE_URL`, which makes it look like the app does.
  Anything else added there is invisible to application code — set it in the pm2 process
  env instead. Adding `@nestjs/config` would fix this but risks changing how
  `DATABASE_URL` resolves on a live system, so it needs deliberate scoping.
- **No ESLint config exists repo-wide**, so `npm run lint` cannot run at all. Adding one
  will surface an unknown volume of pre-existing violations.
- **`apps/api/uploads` is tracked in git** (187 files, 77 MB). Exclude it from deploy
  archives; production's copies are authoritative.
- Two Postgres containers exist on the server. `hqq_db` (5434) is live; `hqq_postgres`
  (5432) is unused and `apps/api/.env` misleadingly points at it.

## Verifying anything

```bash
npm -w apps/api run test          # 28 tests
cd apps/web && npx tsc --noEmit   # must be 0 errors now
npm run build:api && npm run build:web
```

`npm run lint` is broken repo-wide — do not treat its failure as a regression.
