# PostgreSQL ulanishi va Prisma pool

## `connection_limit`

Prisma har bir ilova protsessi uchun alohida connection pool ochadi. Bir nechta worker (PM2 cluster, bir nechta konteyner) bo‘lsa, **jami ulanishlar** = `connection_limit × worker_soni` bo‘lmasin — PostgreSQL `max_connections` dan oshmasin.

`DATABASE_URL` oxiriga query qo‘shing (misol, worker boshiga 5 ta ulanish):

```text
postgresql://user:pass@host:5432/savdo_db?connection_limit=5&pool_timeout=20
```

| Deploy | Tavsiya |
|--------|---------|
| 1 × PM2 fork | `connection_limit=10` dan boshlang |
| 4 × PM2 cluster | har biri `connection_limit=3`…`5` |
| Serverless / ko‘p instance | har bir instance uchun past limit |

`pool_timeout` — bo‘sh connection kutish vaqti (soniya).

## Tekshirish

PostgreSQL da:

```sql
SELECT count(*) FROM pg_stat_activity WHERE datname = current_database();
```

## N+1 va sekin so‘rovlar

- Ro‘yxat endpointlarida `findMany` + `include` ni ehtiyotkorlik bilan ishlating; kerak bo‘lsa `select` bilan toraytiring.
- Sekin so‘rovlar: [SLO_AND_OBSERVABILITY.md](./SLO_AND_OBSERVABILITY.md).
