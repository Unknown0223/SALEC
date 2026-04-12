================================================================
SAVDO TIZIMI — FUNDAMENTAL ARXITEKTURA v2.0
Future-proof | Scalable | Secure | Real-time | AI-ready
================================================================
Maqsad: Bir marta to'g'ri qurish, keyinchalik faqat qo'shish
================================================================
Hozirgi kod bilan tezkor solishtirish: docs/CODEBASE_REALITY.md
================================================================
ASOSIY 8 TA PRINSIP (o'zgarmaydi)

MODULAR       — har bo'lim mustaqil, biri buzilsa boshqasi ishlaydi
TENANT-FIRST  — multi-tenant birinchi kundan, keyinchalik emas
API-FIRST     — barcha funksiya API orqali, UI ikkinchi
EVENT-DRIVEN  — o'zgarish bo'lsa event, boshqalar tinglaydi
CACHE-FIRST   — tez ishlash uchun boshliqdan cache (Redis)
SECURE-DEFAULT— xavfsizlik optsiya emas, asos
OBSERVABLE    — har narsa o'lchanadigan va kuzatiladigan
IMPORT-EXPORT — har jadval import/eksport qilish mumkin


1. STACK — NIMA VA NIMA UCHUN
BACKEND
Runtime:    Node.js 20 LTS
Language:   TypeScript 5.x (strict mode)
Framework:  Fastify 4.x         ← Express EMAS — FASTIFY
Sabab: Express dan 2-3x tez (benchmark), schema validation
built-in, TypeScript native, plugin tizimi kuchli,
OpenAPI/Swagger avto-generatsiya, Pino logger native
ORM:        Prisma 5.x          (type-safe, migration, studio)
Validation: Zod 3.x             (schema = docs = TS types)
Queue:      BullMQ              (Redis asosida, background jobs)
Cache:      Redis 7.x           (session, cache, pub/sub, queue)
Real-time:  ws (WebSocket)      (Fastify plugin orqali)
PDF:        Puppeteer           (nakladnoy, hisobotlar)
Excel:      ExcelJS             (import + eksport)
SMS:        Eskiz.uz SDK
AI:         @anthropic-ai/sdk   (kelajakda)
Auth:       JWT custom          (access 15min + refresh 30kun)
Storage:    MinIO               (S3-compatible, o'z serverda)
Logger:     Pino                (Fastify native, JSON, eng tez)
Test:       Vitest + Supertest  (Jest dan tez)
DATABASE
Primary:    PostgreSQL 16
ACID transactions      — pul uchun shart
Row Level Security     — multi-tenant
JSONB                  — moslashuvchan sozlamalar
Materialized Views     — balans, hisobotlar cache
Table Partitioning     — gps_logs, audit_logs (tezlik)
Full-text Search       — mahsulot/klient qidiruv
SELECT FOR UPDATE      — race condition yo'qotish
pg_cron                — scheduled jobs
Cache/Queue: Redis 7.x
Session storage, API cache, WebSocket pub/sub,
BullMQ, Rate limiting counter
WEB FRONTEND
Framework:  Next.js 14 (App Router, TypeScript)
UI:         ShadcnUI + Tailwind CSS v4
Table:      TanStack Table v8 (virtual scroll, server-side)
Charts:     Recharts
Forms:      React Hook Form + Zod
State:      Zustand + TanStack Query v5
Real-time:  Native WebSocket hook (auto-reconnect)
Maps:       Leaflet.js + React-Leaflet
AI Chat:    Vercel AI SDK (kelajak, streaming)
HTTP:       Axios (interceptor, retry)
MOBILE (Flutter)
State:      Riverpod 2.x        (testable, compile-time safe)
HTTP:       Dio 5.x             (interceptor, retry, timeout)
Storage:    Hive 2.x            (offline) + FlutterSecureStorage (token)
GPS:        geolocator + workmanager (background)
Scan:       mobile_scanner      (barcode + QR)
Push:       firebase_messaging  (FCM)
PDF:        flutter_pdfview     (nakladnoy ko'rish)
Camera:     image_picker        (audit foto)
Internet:   connectivity_plus   (offline detect)
INFRA
Server:     Hetzner CX22 ($8/oy) → CX32 → CCX23
OS:         Ubuntu 22.04 LTS
Container:  Docker + Docker Compose
Proxy:      Nginx (SSL, rate limit, subdomain routing)
SSL:        Let's Encrypt wildcard *.sizapp.uz (Certbot)
Process:    PM2 (cluster mode, auto-restart, memory limit)
CI/CD:      GitHub Actions (test → build → deploy)
Backup:     pg_dump + cron → Hetzner Object Storage
DNS:        Cloudflare (CDN, DDoS, free tier)
Monitor:    UptimeRobot (free) → Grafana (kelajak)

1b. API URL KONVENSIYALARI (Fastify backend)

- Health: GET /health
- Auth — ikkala prefiks bir xil xatti-harakat (mijozlar /api yoki ildizdan tanlashi mumkin):
  - /auth/login | /api/auth/login (body: slug, login, password)
  - /auth/refresh | /api/auth/refresh
  - /auth/logout | /api/auth/logout
  - /auth/me | /api/auth/me (Bearer access token)
- Tenant-scoped REST: /api/:slug/... (masalan GET /api/test1/clients). Alternativa: header X-Tenant-Slug
- /auth/* va /api/auth/* tenant middleware dan tashqarida (slug talab qilinmaydi).

Lokal DB: `docker-compose.yml` da `POSTGRES_PASSWORD=0223`; `env.ts` va `.env.example` defaulti `postgresql://postgres:0223@localhost:5432/savdo_db`. GitHub Actions CI alohida `postgres:postgres` ishlatadi.

2. PAPKA TUZILMASI — KENGAYTIRISHGA MO'LJALLANGAN
savdo-tizim/
│
├── .github/
│   └── workflows/
│       ├── ci.yml              # Test har PR da
│       ├── deploy-staging.yml  # develop branch
│       └── deploy-prod.yml     # main branch
│
├── docs/
│   ├── ARCHITECTURE.md         # Bu fayl
│   ├── API.md                  # Swagger avto-export
│   ├── DEPLOYMENT.md           # Server sozlash qo'llanma
│   └── DECISIONS.md            # Nima uchun bu qaror
│
├── infrastructure/
│   ├── docker-compose.yml          # Dev (postgres + redis + minio)
│   ├── docker-compose.prod.yml     # Production
│   ├── nginx/
│   │   ├── nginx.conf
│   │   └── sites/sizapp.conf       # Wildcard subdomain
│   └── scripts/
│       ├── setup-server.sh         # Yangi server o'rnatish
│       ├── backup.sh               # DB backup (cron)
│       └── restore.sh              # DB tiklash
│
├── packages/                       # Frontend + Backend umumiy
│   └── types/
│       ├── order.ts
│       ├── client.ts
│       └── index.ts
│
├── backend/
│   ├── src/
│   │   │
│   │   ├── index.ts                # Entry: Fastify server start
│   │   ├── app.ts                  # Plugin registration
│   │   │
│   │   ├── config/
│   │   │   ├── env.ts              # Zod env validation (startup crash)
│   │   │   ├── database.ts         # Prisma singleton
│   │   │   ├── redis.ts            # Redis singleton
│   │   │   ├── logger.ts           # Pino setup
│   │   │   └── constants.ts        # STATUS, ROLES, PLANS, EVENTS
│   │   │
│   │   ├── plugins/                # Fastify plugins (tartibda yuklanadi)
│   │   │   ├── cors.ts
│   │   │   ├── rate-limit.ts       # Per-tenant + per-IP
│   │   │   ├── auth.plugin.ts      # JWT decode → req.user
│   │   │   ├── tenant.plugin.ts    # Slug → req.tenant
│   │   │   ├── swagger.plugin.ts   # OpenAPI avto-gen
│   │   │   ├── websocket.plugin.ts # WS server
│   │   │   └── error.plugin.ts     # Global error handler
│   │   │
│   │   ├── modules/                # Feature modules (mustaqil)
│   │   │   │
│   │   │   ├── auth/
│   │   │   │   ├── auth.route.ts
│   │   │   │   ├── auth.service.ts
│   │   │   │   └── auth.schema.ts
│   │   │   │
│   │   │   ├── tenants/            # Super admin (sizning panelingiz)
│   │   │   │   ├── tenant.route.ts
│   │   │   │   ├── tenant.service.ts
│   │   │   │   └── tenant.schema.ts
│   │   │   │
│   │   │   ├── users/
│   │   │   │   ├── user.route.ts
│   │   │   │   ├── user.service.ts
│   │   │   │   └── user.schema.ts
│   │   │   │
│   │   │   ├── clients/
│   │   │   │   ├── client.route.ts
│   │   │   │   ├── client.service.ts
│   │   │   │   ├── client.schema.ts
│   │   │   │   └── client.balance.ts  # Balans logika alohida
│   │   │   │
│   │   │   ├── products/
│   │   │   │   ├── product.route.ts
│   │   │   │   ├── product.service.ts
│   │   │   │   ├── product.schema.ts
│   │   │   │   └── product.import.ts  # Excel import logika
│   │   │   │
│   │   │   ├── prices/
│   │   │   │   ├── price.route.ts
│   │   │   │   ├── price.service.ts   # getProductPrice()
│   │   │   │   └── price.schema.ts
│   │   │   │
│   │   │   ├── bonuses/
│   │   │   │   ├── bonus.route.ts
│   │   │   │   ├── bonus.engine.ts    # Asosiy logika
│   │   │   │   └── bonus.schema.ts
│   │   │   │
│   │   │   ├── orders/
│   │   │   │   ├── order.route.ts
│   │   │   │   ├── order.service.ts   # Transaction, 10 qadam
│   │   │   │   ├── order.status.ts    # State machine
│   │   │   │   ├── order.schema.ts
│   │   │   │   └── order.events.ts    # EventBus emit
│   │   │   │
│   │   │   ├── warehouse/
│   │   │   │   ├── warehouse.route.ts
│   │   │   │   ├── stock.service.ts
│   │   │   │   ├── picking.service.ts
│   │   │   │   ├── transfer.service.ts
│   │   │   │   └── adjustment.service.ts
│   │   │   │
│   │   │   ├── nakladnoy/
│   │   │   │   ├── nakladnoy.route.ts
│   │   │   │   ├── nakladnoy.service.ts
│   │   │   │   ├── counter.service.ts
│   │   │   │   └── templates/
│   │   │   │       ├── 518.html
│   │   │   │       ├── 210.html
│   │   │   │       ├── transfer.html
│   │   │   │       └── akt-sverka.html
│   │   │   │
│   │   │   ├── payments/
│   │   │   │   ├── payment.route.ts
│   │   │   │   ├── payment.service.ts
│   │   │   │   └── payment.schema.ts
│   │   │   │
│   │   │   ├── gps/
│   │   │   │   ├── gps.route.ts
│   │   │   │   ├── gps.service.ts
│   │   │   │   └── visit.service.ts   # Geofence, tashrif
│   │   │   │
│   │   │   ├── reports/
│   │   │   │   ├── report.route.ts
│   │   │   │   ├── sales.report.ts
│   │   │   │   ├── debt.report.ts
│   │   │   │   ├── stock.report.ts
│   │   │   │   ├── payment.report.ts
│   │   │   │   └── excel.service.ts
│   │   │   │
│   │   │   ├── dashboard/
│   │   │   │   ├── dashboard.route.ts
│   │   │   │   └── dashboard.service.ts  # Redis cached
│   │   │   │
│   │   │   ├── notifications/
│   │   │   │   ├── notification.route.ts
│   │   │   │   └── notification.service.ts  # WS + FCM
│   │   │   │
│   │   │   ├── imports/                     # Universal import tizimi
│   │   │   │   ├── import.route.ts          # POST /:slug/import/:type
│   │   │   │   ├── import.service.ts
│   │   │   │   ├── import.worker.ts         # BullMQ worker
│   │   │   │   └── templates/               # Yuklab olish shablonlari
│   │   │   │       ├── products.xlsx
│   │   │   │       ├── prices.xlsx
│   │   │   │       ├── clients.xlsx
│   │   │   │       └── stock.xlsx
│   │   │   │
│   │   │   # === KELAJAK MODULLAR (papka bor, kod yo'q) ===
│   │   │   ├── kpi/                   # KPI scoring tizimi
│   │   │   ├── van-selling/           # Mashina savdosi
│   │   │   ├── tasks/                 # Vazifalar
│   │   │   ├── audit/                 # Merchandising audit
│   │   │   ├── telegram/              # Bot integratsiya
│   │   │   ├── ai/                    # Claude API
│   │   │   ├── integrations/          # 1C, ERP
│   │   │   └── subscriptions/         # Tarif/billing
│   │   │
│   │   ├── shared/
│   │   │   ├── services/
│   │   │   │   ├── cache.service.ts   # Redis wrapper
│   │   │   │   ├── event.bus.ts       # EventEmitter
│   │   │   │   ├── audit.service.ts   # Har o'zgarish log
│   │   │   │   ├── sms.service.ts     # Eskiz.uz
│   │   │   │   ├── storage.service.ts # MinIO/S3
│   │   │   │   └── queue.service.ts   # BullMQ
│   │   │   │
│   │   │   └── helpers/
│   │   │       ├── pagination.ts      # Cursor-based pagination
│   │   │       ├── number-to-words.ts # 1000000 → "bir million"
│   │   │       ├── date.ts
│   │   │       └── response.ts        # Standart { data, meta, error }
│   │   │
│   │   └── types/
│   │       └── fastify.d.ts           # req.user, req.tenant
│   │
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.ts
│   │   └── migrations/
│   │
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── e2e/
│   │
│   ├── .env
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── Dockerfile
│
├── frontend/
│   ├── app/
│   │   ├── (auth)/login/
│   │   └── [slug]/             # Tenant-aware routing
│   │       ├── layout.tsx
│   │       ├── page.tsx        # Dashboard
│   │       ├── orders/
│   │       ├── clients/
│   │       ├── warehouse/
│   │       ├── finance/
│   │       ├── reports/
│   │       ├── gps/
│   │       ├── settings/
│   │       # Kelajak (papka bor, page yo'q):
│   │       ├── kpi/
│   │       ├── tasks/
│   │       ├── audit/
│   │       └── ai/
│   │
│   ├── components/
│   │   ├── ui/                 # ShadcnUI
│   │   ├── layout/
│   │   ├── data-table/         # Universal jadval (virtual scroll)
│   │   ├── forms/
│   │   ├── charts/
│   │   └── maps/
│   │
│   ├── lib/
│   │   ├── api/
│   │   │   ├── client.ts       # Axios instance, tenant header
│   │   │   └── *.api.ts        # Har modul uchun
│   │   ├── hooks/
│   │   │   ├── use-websocket.ts
│   │   │   └── use-import.ts
│   │   └── utils/
│   │
│   └── store/auth.store.ts
│
└── mobile/
    └── lib/
        ├── core/
        │   ├── api/api_client.dart       # Dio setup
        │   ├── storage/
        │   │   ├── hive_storage.dart     # Offline
        │   │   └── secure_storage.dart  # Token
        │   └── services/
        │       ├── sync_service.dart    # Offline→online
        │       ├── gps_service.dart     # Background
        │       └── push_service.dart    # FCM
        │
        └── features/                    # Feature-based
            ├── setup/                   # Server URL ekrani
            ├── auth/
            ├── dashboard/
            ├── orders/
            ├── clients/
            ├── stock/
            ├── delivery/
            └── settings/

3. DATABASE SCHEMA — FUNDAMENTAL
Dizayn qoidalari:

Har jadvalda: id, tenant_id, created_at, updated_at
Soft delete: deleted_at (hech narsa o'chirilmaydi)
Pul: BIGINT tiyinlarda (1000 = 1 so'm), FLOAT emas!
Moslashuvchanlik: JSONB metadata har jadvalda
Index: (tenant_id, ...) composite — har jadvalda
Partitioning: gps_logs, audit_logs (oylik, tezlik uchun)

Jadvallar ro'yxati:
HOZIR YARATILADI (MVP):
tenants              — dilerlar
refresh_tokens       — JWT refresh tokenlar
users                — foydalanuvchilar
territories          — hududlar (daraxtsimom)
product_categories   — kategoriyalar (daraxtsimom)
products             — mahsulotlar
price_types          — narx turlari
prices               — narxlar (muddatli)
bonus_rules          — bonus qoidalari
clients              — mijozlar
warehouses           — omborlar
stock                — qoldiqlar (real-time)
stock_movements      — qoldiq harakati (audit)
nakladnoy_counter    — hujjat raqamlash
suppliers            — yetkazib beruvchilar
purchase_orders      — kirim hujjatlari
purchase_items       — kirim pozitsiyalari
orders               — zakazlar
order_items          — zakaz pozitsiyalari
order_status_logs    — status tarixi
picking_sessions     — yuk yig'ish
picking_items        — yig'ish pozitsiyalari
stock_transfers      — filial ko'chirish
stock_transfer_items — ko'chirish pozitsiyalari
payments             — to'lovlar
client_balances      — materialized view
gps_logs             — GPS (partitioned, BIGSERIAL)
visits               — tashriflar
audit_logs           — barcha o'zgarishlar (partitioned)
notifications        — bildirishnomalar
import_jobs          — import tarix/status
KELAJAKDA QOSHILADI (papka bor, jadval yo'q):
kpi_targets          — KPI rejalar
kpi_results          — KPI natijalar
tasks                — vazifalar
task_types           — vazifa turlari
audit_checklists     — merchandising
audit_results
photos               — suratlar (S3 url)
telegram_bots        — bot config
ai_conversations     — AI suhbatlar
integrations         — 1C, ERP
feature_flags        — A/B test, modul on/off
subscriptions        — tarif tarixi
api_keys             — 3-party integratsiya
Eng muhim jadval misollari (Prisma format):
prisma// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─── TENANTS ─────────────────────────────────────
model Tenant {
  id         Int      @id @default(autoincrement())
  slug       String   @unique                // 'andijon'
  name       String
  phone      String?
  address    String?
  logo_url   String?
  plan       String   @default("basic")      // basic/pro/enterprise
  is_active  Boolean  @default(true)
  settings   Json     @default("{}")         // moslashuvchan
  created_at DateTime @default(now())
  updated_at DateTime @updatedAt

  users          User[]
  clients        Client[]
  orders         Order[]
  warehouses     Warehouse[]
  payments       Payment[]
  gps_logs       GpsLog[]
  bonus_rules    BonusRule[]
  import_jobs    ImportJob[]
  notifications  Notification[]

  @@map("tenants")
}

// ─── USERS ───────────────────────────────────────
model User {
  id            Int      @id @default(autoincrement())
  tenant_id     Int
  tenant        Tenant   @relation(fields: [tenant_id], references: [id])
  name          String
  login         String
  password_hash String
  role          String                       // admin/supervisor/agent/warehouse/delivery
  territory_id  Int?
  phone         String?
  fcm_token     String?                      // Push notification
  is_active     Boolean  @default(true)
  last_login    DateTime?
  metadata      Json     @default("{}")
  created_at    DateTime @default(now())
  updated_at    DateTime @updatedAt

  orders        Order[]
  visits        Visit[]
  gps_logs      GpsLog[]

  @@unique([tenant_id, login])
  @@index([tenant_id, role])
  @@map("users")
}

// ─── PRODUCTS ────────────────────────────────────
model Product {
  id          Int      @id @default(autoincrement())
  tenant_id   Int?                           // null = global (barcha)
  category_id Int?
  sku         String
  name        String
  unit        String   @default("dona")
  barcode     String?
  case_type   String?
  weight      Decimal? @db.Decimal(10, 3)
  image_url   String?
  is_active   Boolean  @default(true)
  metadata    Json     @default("{}")
  created_at  DateTime @default(now())
  updated_at  DateTime @updatedAt
  deleted_at  DateTime?                      // soft delete

  order_items OrderItem[]
  prices      Price[]
  stock       Stock[]

  @@index([tenant_id])
  @@map("products")
}

// ─── ORDERS ──────────────────────────────────────
model Order {
  id               Int      @id @default(autoincrement())
  tenant_id        Int
  tenant           Tenant   @relation(fields: [tenant_id], references: [id])
  number           String                    // NAK-2026-000001
  client_id        Int
  client           Client   @relation(fields: [client_id], references: [id])
  agent_id         Int
  agent            User     @relation(fields: [agent_id], references: [id])
  warehouse_id     Int
  warehouse        Warehouse @relation(fields: [warehouse_id], references: [id])
  delivery_id      Int?                      // dastavchi
  status           String   @default("new") // 7 status
  payment_type     String   @default("cash")
  total_sum        BigInt   @default(0)      // tiyinlarda
  discount_sum     BigInt   @default(0)
  bonus_sum        BigInt   @default(0)
  paid_sum         BigInt   @default(0)
  delivery_date    DateTime?
  note             String?
  credit_override  Boolean  @default(false) // limit oshib o'tilganmi
  override_reason  String?
  override_by      Int?
  client_snapshot  Json?                     // zakaz vaqtidagi klient
  created_at       DateTime @default(now())
  updated_at       DateTime @updatedAt

  items       OrderItem[]
  status_logs OrderStatusLog[]
  payments    Payment[]

  @@unique([tenant_id, number])
  @@index([tenant_id, status])
  @@index([tenant_id, agent_id, created_at])
  @@index([tenant_id, client_id])
  @@map("orders")
}

// ─── STOCK ───────────────────────────────────────
model Stock {
  id           Int      @id @default(autoincrement())
  tenant_id    Int
  warehouse_id Int
  warehouse    Warehouse @relation(fields: [warehouse_id], references: [id])
  product_id   Int
  product      Product   @relation(fields: [product_id], references: [id])
  qty          Decimal   @default(0) @db.Decimal(12, 3)
  reserved_qty Decimal   @default(0) @db.Decimal(12, 3)
  min_qty      Decimal   @default(0) @db.Decimal(12, 3)
  avg_cost     BigInt    @default(0)     // o'rtacha kirim narxi
  updated_at   DateTime  @updatedAt

  @@unique([warehouse_id, product_id])
  @@index([tenant_id, warehouse_id])
  @@map("stock")
}

// ─── PAYMENTS ────────────────────────────────────
model Payment {
  id           Int      @id @default(autoincrement())
  tenant_id    Int
  tenant       Tenant   @relation(fields: [tenant_id], references: [id])
  client_id    Int
  client       Client   @relation(fields: [client_id], references: [id])
  order_id     Int?
  order        Order?   @relation(fields: [order_id], references: [id])
  amount       BigInt                   // tiyinlarda
  payment_type String   @default("cash")
  is_confirmed Boolean  @default(false)
  confirmed_by Int?
  confirmed_at DateTime?
  is_advance   Boolean  @default(false)
  note         String?
  created_by   Int?
  created_at   DateTime @default(now())

  @@index([tenant_id, client_id])
  @@index([tenant_id, created_at])
  @@map("payments")
}

// ─── GPS LOGS (Partitioned) ──────────────────────
// Raw SQL bilan yaratiladi (Prisma partitioning qo'llab-quvvatlamaydi):
// CREATE TABLE gps_logs (...) PARTITION BY RANGE (recorded_at);
model GpsLog {
  id          BigInt   @id @default(autoincrement())
  tenant_id   Int
  tenant      Tenant   @relation(fields: [tenant_id], references: [id])
  user_id     Int
  user        User     @relation(fields: [user_id], references: [id])
  lat         Decimal  @db.Decimal(10, 7)
  lng         Decimal  @db.Decimal(10, 7)
  accuracy    Decimal? @db.Decimal(6, 2)
  speed       Decimal? @db.Decimal(6, 2)
  recorded_at DateTime @default(now())

  @@index([tenant_id, user_id, recorded_at])
  @@map("gps_logs")
}

// ─── IMPORT JOBS ─────────────────────────────────
model ImportJob {
  id           Int      @id @default(autoincrement())
  tenant_id    Int
  tenant       Tenant   @relation(fields: [tenant_id], references: [id])
  type         String                   // products/prices/clients/stock
  filename     String?
  total_rows   Int?
  success_rows Int      @default(0)
  error_rows   Int      @default(0)
  errors       Json     @default("[]")  // [{row, field, message}]
  status       String   @default("processing") // processing/done/failed
  created_by   Int?
  created_at   DateTime @default(now())
  completed_at DateTime?

  @@map("import_jobs")
}

4. REAL-TIME TIZIMI
WebSocket Events:
order:new           Agent       → Warehouse, Operator
order:confirmed     Operator    → Warehouse, Agent
order:picking       Warehouse   → Operator
order:delivering    Operator    → Delivery, Agent
order:delivered     Delivery    → Agent, Operator, Finance
order:returned      Delivery    → Agent, Operator, Warehouse
order:cancelled     Operator    → Agent
payment:received    Delivery    → Operator, Finance
payment:confirmed   Finance     → Agent (balans yangilandi)
stock:low           System      → Warehouse, Admin
gps:update          Agent/Del   → Supervisor (xarita)
visit:start         Agent       → Supervisor
visit:end           Agent       → Supervisor
import:done         System      → Import qilgan user
notification:new    System      → Target user
Redis Cache strategiyasi:
KEY                              TTL       NIMA
tenant:{id}:settings             1 soat    Diler sozlamalari
tenant:{id}:dashboard            30 sek    Dashboard stats
tenant:{id}:stock:{wh_id}        5 daqiqa  Qoldiqlar
tenant:{id}:prices               10 daqiqa Narxlar
tenant:{id}:bonus_rules          10 daqiqa Bonus qoidalari
session:{token_hash}             30 kun    Refresh token
rate:{ip}:{endpoint}             1 daqiqa  Rate limit
BullMQ Queues (Background jobs):
QUEUE         VAZIFA
pdf           Nakladnoy PDF generatsiya
excel         Katta hisobot Excel
sms           Eskiz.uz SMS
push          FCM push notification
import        Excel/CSV import processing
sync          1C/ERP sinxronizatsiya (kelajak)
cleanup       Eski GPS/log o'chirish (kunlik)
backup        DB backup (kunlik 03:00)
refresh-views Materialized view refresh (5 daqiqa)

5. XAVFSIZLIK QATLAMI
Authentication:
bcrypt cost=12         — parol hash
accessToken 15 daqiqa  — stateless, qisqa
refreshToken 30 kun    — DB da, rotation bilan
Token rotation         — yangilanishda eski bekor
Authorization (har so'rovda 4 tekshiruv):

JWT imzosi va muddati
JWT tenant_id === URL slug tenant_id (cross-tenant attack)
User roli bu amalga ruxsat berilganmi?
Resource shu tenantga tegishlimi?

Rate Limiting (Nginx + application):
POST /auth/login        5 urinish / 1 daqiqa / IP
POST /auth/refresh      10 / 1 daqiqa / IP
POST /:slug/orders      100 / 1 daqiqa / tenant
POST /:slug/gps/loc     60 / 1 daqiqa / user (GPS)
GET  /:slug/reports/*   10 / 1 daqiqa / user
POST /:slug/import/*    5 / 10 daqiqa / user

/* (global)        1000 / 1 daqiqa / IP

Input Validation (Zod):
Har endpoint: body + query + params
Sanitization: trim, maxLength, regex
Type coercion: string → number, string → date
SQL Injection:
Prisma parametrized (avto)
Raw SQL: faqat $queryRaw typed params
Audit Trail:
Har create/update/delete: audit_logs ga
Insert-only (o'chirmaydi)
IP, user_agent saqlanadi

6. IMPORT/EXPORT TIZIMI — UNIVERSAL
Import endpoint:
POST /:slug/import/:type
Turlari: products / prices / clients / stock / bonuses / orders
Jarayon:

Fayl qabul (multer, max 10MB, xlsx/csv)
import_jobs jadvaliga log (status: processing)
BullMQ queue ga (background)
Response: { jobId } — darhol
[Background]: parse → validate → batch upsert
[Background]: import_jobs yangilash
[Background]: WebSocket 'import:done' event

Status kuzatish:
GET /:slug/import/status/:jobId
Response: { status, total, success, errors: [{row, field, message}] }
Excel shablon yuklab olish:
GET /:slug/import/template/:type
Response: Excel fayl (to'g'ri ustunlar, misollar, format)
Export:
GET /:slug/reports/*/export?format=xlsx|csv|json
xlsx: ExcelJS (sarlavha yashil, jami sariq, format 1,234,000)
csv:  papaparse
json: to'g'ridan ma'lumot
Og'ir eksport: BullMQ → background → link

7. PERFORMANCE STRATEGIYASI
Database:
Har jadvalda (tenant_id, ...) composite index
GIN index: mahsulot/klient full-text search
Materialized view: client_balances (5 daqiqada refresh)
Partitioning: gps_logs, audit_logs (oylik)
Connection pool: min=2, max=10 (Prisma)
Slow query log: 100ms dan yuqori
API:
Redis cache: narxlar, sozlamalar, dashboard
Cursor-based pagination (offset emas — skala)
Gzip compression (Fastify built-in)
Streaming: katta Excel/PDF fayl
BullMQ: og'ir ishlar background da
Nima uchun Fastify (Express emas):
2-3x tez (json serialize, schema validation)
Schema-based: validation + serialization avto
Plugin encapsulation: modul izolyatsiya
Pino: Node.js eng tez logger (Fastify native)
TypeScript: birinchi klass qo'llab-quvvatlash

8. BOSQICH REJASI — YANGILANGAN
FAZA 0   Kun 1-2    Fundamental zamin (BUGUN)
FAZA 1   Hafta 1-2  Server + DB + Auth + Tenant       70 soat
FAZA 2   Hafta 3-4  Sozlamalar + Import tizimi         70 soat
FAZA 3   Hafta 5    Klientlar + Balans                  35 soat
FAZA 4   Hafta 6-9  Zakaz + Bonus + Status ← ENG MUHIM 120 soat
FAZA 5   Hafta 10-12 Ombor + Nakladnoy 518/210          90 soat
FAZA 6   Hafta 13   Moliya + To'lov + Akt-sverka         35 soat
FAZA 7   Hafta 14   GPS + Tashriflar                    30 soat
FAZA 8   Hafta 15   Dashboard + 5 Hisobot               30 soat
FAZA 9   Hafta 16-18 Flutter Agent + Dostavka           140 soat
FAZA 10  Hafta 19   Test + Deploy + Birinchi Diler       35 soat