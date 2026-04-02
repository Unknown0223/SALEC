# Runbook (SALESDOC)

## Lokal ishga tushirish
1. Docker Desktop yoqilganini tekshiring.
2. Loyiha ildizida ishga tushiring:
   - `.\start-dev.cmd`
3. Script quyidagilarni bajaradi:
   - Postgres/Redis ni ko'taradi
   - Health tekshiradi
   - `db:deploy` bajaradi
   - API + web dev serverni ishga tushiradi

## Production muhit (qisqa)
- **`CORS_ALLOWED_ORIGINS`** — vergul bilan ajratilgan ruxsat etilgan `Origin` lar (majburiy, aks holda backend ishga tushmaydi).
- **`AUTH_LOGIN_RATE_MAX`** / **`AUTH_LOGIN_RATE_WINDOW_MS`** — login endpointiga IP bo‘yicha limit (default: 30 / 15 daqiqa).
- **DB pool:** [DATABASE_POOL.md](./DATABASE_POOL.md) · **SLO / loglar:** [SLO_AND_OBSERVABILITY.md](./SLO_AND_OBSERVABILITY.md)

## Health tekshiruvlar
- Liveness: `GET http://127.0.0.1:4000/health`
- Readiness: `GET http://127.0.0.1:4000/ready`
  - `database: ok|down`
  - `redis: ok|degraded`

## Tezkor diagnostika
- `Can't reach database server at localhost:5432`:
  - `docker compose -f infrastructure/docker-compose.yml ps`
  - `docker logs --tail 100 savdo_postgres`
- Redis degradatsiya:
  - API ishlashi davom etadi, lekin SSE pub/sub in-process rejimga o'tadi.
- Frontend 500:
  - Sahifadagi `Qayta urinish` tugmasini bosing.
  - `ready` endpointini tekshiring.

## Favqulodda tiklash
1. Dev serverni to'xtating.
2. `docker compose -f infrastructure/docker-compose.yml up -d`
3. `npm run db:deploy`
4. `.\start-dev.cmd`

## Rollback (kod)
1. Oxirgi ishlagan commit hashni aniqlang.
2. Yangi hotfix branch oching.
3. Kerakli commit(lar)ni `revert` qilib CI'dan o'tkazing.
4. Deploy qiling va `/ready` + kritik sahifalarni tekshiring.
