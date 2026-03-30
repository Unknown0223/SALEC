# Testing Strategy

## Test layers

- Unit tests: pure business logic
- Integration tests: Fastify routes + Prisma + auth/tenant behavior
- E2E tests: reserved for later phases

## Backend commands

Run from `d:\SALESDOC\backend`:

- `npm run test` - watch mode for local development
- `npm run test:ci` - non-watch run for CI
- `npm run build` - TypeScript compile validation

`tests/db-global-setup.ts` runs before Vitest: it probes PostgreSQL (`DATABASE_URL`). If the DB is unreachable, `clients.integration.test.ts` is skipped so local runs without Docker stay green. With Docker/CI and migrations + seed applied, the clients integration test runs against a real database.

Seed konfiguratsiyasi: [`backend/prisma.config.ts`](../backend/prisma.config.ts) (`migrations.seed`). `prisma/seed.ts` boshida `import "dotenv/config"` — `prisma.config.ts` mavjud bo‘lganda CLI ba’zan `.env` ni avto yuklamasligi mumkin.

## Current minimum coverage (FAZA 0-1)

- Health endpoint contract
- Tenant resolution behavior
- Auth flow (`login`, `refresh`, protected route unauthorized case)

## Principles

- Keep tests deterministic
- Seed only required data
- Use explicit assertions for status and payload
