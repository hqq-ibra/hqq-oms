# HQQ OMS - Order Management System

A production-ready internal Order Management System built as a monorepo with NestJS backend and Next.js frontend.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), TypeScript, Tailwind CSS, TanStack Query |
| Backend | NestJS, TypeScript, Prisma ORM, Socket.IO |
| Database | PostgreSQL 16 |
| Auth | JWT (access + refresh tokens), Argon2 password hashing |
| Real-time | WebSockets via Socket.IO |
| DevOps | Docker Compose |

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- npm 9+

### 1. Clone and install dependencies
```bash
cd hqq-oms
npm install
```

### 2. Start PostgreSQL
```bash
cd docker
docker compose up -d
```

### 3. Setup database
```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed sample data
npm run db:seed
```

### 4. Start development servers
```bash
# Start both API and Web concurrently
npm run dev

# Or start individually:
npm run dev:api    # API on http://localhost:4000
npm run dev:web    # Web on http://localhost:3001
```

## Default Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@hqq.com | admin123 |
| Sales | sales@hqq.com | sales123 |

## Project Structure

```
hqq-oms/
├── apps/
│   ├── api/          # NestJS backend
│   │   └── src/
│   │       ├── auth/          # JWT auth, login, refresh
│   │       ├── common/        # Guards, decorators, interceptors
│   │       ├── customers/     # Customer CRUD
│   │       ├── factories/     # Factory CRUD
│   │       ├── files/         # File metadata management
│   │       ├── orders/        # Orders, costs, status workflow
│   │       ├── prisma/        # Prisma service
│   │       ├── products/      # Product CRUD
│   │       ├── reports/       # Admin reports
│   │       ├── users/         # User management + permissions
│   │       └── ws/            # WebSocket gateway
│   └── web/          # Next.js frontend
│       └── src/
│           ├── app/           # App Router pages
│           ├── components/    # UI + layout components
│           ├── hooks/         # Custom hooks
│           ├── lib/           # API client, utilities
│           └── providers/     # Auth, Query, Socket providers
├── packages/
│   └── shared/       # Shared enums, types, zod schemas
├── prisma/           # Schema + seed
├── docker/           # Docker Compose
└── README.md
```

## RBAC & Permissions

### Roles
- **Admin**: Full access to all features
- **Sales**: Limited to order management, status changes, file uploads

### Configurable Permissions
| Permission | Description |
|-----------|-------------|
| VIEW_REPORTS | Access reports dashboard |
| VIEW_COSTS | View order costs and profit |
| EDIT_COSTS | Create/edit/delete order costs |
| MANAGE_USERS | User administration |
| EDIT_ORDERS | Create and edit orders |
| CHANGE_STATUS | Change order status |
| UPLOAD_FILES | Upload/attach files |

Permissions are stored per-user in the database and checked on both backend (guards) and frontend (UI conditional rendering).

## Order Workflows

### New Mold
```
New → Sample Received → CAD Drawing Ready → Sent to Factory → Mold Ready
→ Silicone Casting → Shipped from Factory → Received Locally
→ Shipped to Customer → Completed
```

### Repeat
```
New → Sent to Factory → Silicone Casting → Shipped from Factory
→ Received Locally → Shipped to Customer → Completed
```

Status transitions are enforced server-side. Every change is logged in OrderStatusHistory and AuditLogs.

## Factory Order Sheet

The factory sheet (printable view) intentionally **never** includes customer name or city. It uses the embedded customer code in the `factory_order_number` (format: `FO-YYYY-{CustomerCode}-####`).

## API Endpoints

```
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
GET    /api/v1/auth/me
POST   /api/v1/auth/logout

GET    /api/v1/users
POST   /api/v1/users
PATCH  /api/v1/users/:id
DELETE /api/v1/users/:id

GET    /api/v1/customers
POST   /api/v1/customers
PATCH  /api/v1/customers/:id
DELETE /api/v1/customers/:id

GET    /api/v1/factories
POST   /api/v1/factories
PATCH  /api/v1/factories/:id

GET    /api/v1/products
POST   /api/v1/products
PATCH  /api/v1/products/:id

GET    /api/v1/orders
POST   /api/v1/orders
PATCH  /api/v1/orders/:id
POST   /api/v1/orders/:id/status
GET    /api/v1/orders/:id/costs
POST   /api/v1/orders/:id/costs
GET    /api/v1/orders/:id/factory-sheet

POST   /api/v1/files
GET    /api/v1/files?entityType=&entityId=
DELETE /api/v1/files/:id

GET    /api/v1/reports/monthly-profit
GET    /api/v1/reports/orders-performance
GET    /api/v1/reports/factory-performance
GET    /api/v1/reports/inactive-customers
```

## WebSocket Events

| Event | Trigger |
|-------|---------|
| order.created | New order created |
| order.updated | Order details updated |
| order.status_changed | Order status transition |
| order.cost_updated | Cost added/updated/deleted |

## Environment Variables

Create `.env` in project root:

```env
DATABASE_URL="postgresql://hqq:hqq_secret@localhost:5432/hqq_oms?schema=public"
JWT_SECRET="change-this-in-production"
JWT_REFRESH_SECRET="change-this-in-production"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
API_PORT=4000
CORS_ORIGIN="http://localhost:3001"
NODE_ENV="development"
```

Create `apps/web/.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
NEXT_PUBLIC_WS_URL=http://localhost:4000
```

## Production Deployment

1. Change all secrets in `.env`
2. Build both apps: `npm run build:api && npm run build:web`
3. Run migrations: `npm run db:migrate`
4. Start: API via `node apps/api/dist/main.js`, Web via `next start` in apps/web
5. Use a reverse proxy (nginx) in front of both services
6. Enable HTTPS
7. Set `CORS_ORIGIN` to your production domain

## Audit Logging

All create/update/delete operations on Orders, Customers, Products, Factories, Users, and Files are captured in the `audit_logs` table with:
- User who made the change
- Entity type and ID
- Action (CREATE/UPDATE/DELETE/STATUS_CHANGE)
- Old and new values as JSON
- Timestamp

## PWA Support

The app is installable as a PWA on both desktop and mobile:
- Add to Home Screen on Android/iOS
- Offline shell caching for fast loading
- App manifest with custom icons and theme color
