# SLO va kuzatuv (observability)

## Maqsadli ko‘rsatkichlar (SLO)

| Ko‘rsatkich | Maqsad | Izoh |
|-------------|--------|------|
| API javob vaqti (p95) | &lt; 500 ms | Oddiy CRUD va ro‘yxatlar (import/hisobotdan tashqari) |
| `/ready` | HTTP 200, `database: ok` | Deploy va balanserdan keyin tekshirish |
| 5xx ulushi | &lt; 0.1% | Monitoring (Grafana, cloud provider) |
| Mavjudlik | 99.5%+ oylik | Tashqi uptime monitor |

SLO buzilsa: sekin so‘rovlar backend logida `slow_request` (≥ 500 ms) sifatida yoziladi.

## Backend loglari

- **Har bir so‘rov:** `request_complete` (productionda `info`, devda `debug`) — `requestId`, `method`, `path`, `statusCode`, `responseTimeMs`, `tenantId`, `actorUserId` (JWT bo‘lsa).
- **Sekin so‘rovlar:** `slow_request` (`warn`) — yuqoridagi maydonlar bilan.

JSON loglarni to‘plash: Loki, CloudWatch, ELK va hokazo.

## PostgreSQL sekin so‘rovlar

Productionda vaqtincha sekin querylarni topish:

```sql
-- postgresql.conf yoki ALTER SYSTEM
ALTER SYSTEM SET log_min_duration_statement = '500ms';
SELECT pg_reload_conf();
```

Loglarni tahlil qilib, `EXPLAIN (ANALYZE, BUFFERS)` bilan indeks va so‘rovlarni optimallashtiring. Tahlil tugagach, qiymatni oshiring yoki `log_min_duration_statement = -1` bilan o‘chiring.

## Sintetik yuk

Repoda: [scripts/load-smoke.mjs](../scripts/load-smoke.mjs)

```bash
node scripts/load-smoke.mjs --base http://127.0.0.1:4000 --path /health --n 200 --c 20
```

Asosiy API uchun token kerak bo‘ladi — keyinroq k6/autocannon skriptlariga kengaytirish mumkin.

## Audit jurnal retention

Eski `tenant_audit_events` yozuvlarini o‘chirish: [AUDIT_RETENTION.md](./AUDIT_RETENTION.md).
