# Masshtab (PM2, bir nechta instance, replica)

## PM2 cluster

Bir serverda CPU yadrolaridan foydalanish:

```bash
pm2 start dist/index.js -i max --name salec-api
```

Har bir protsess alohida Prisma pool ochadi — [DATABASE_POOL.md](./DATABASE_POOL.md) dagi `connection_limit` ni worker soniga bo‘ling.

## Nginx upstream

Bir nechta backend portlari:

```nginx
upstream backend_upstream {
    least_conn;
    server 127.0.0.1:4000;
    server 127.0.0.1:4001;
    server 127.0.0.1:4002;
    server 127.0.0.1:4003;
}
```

## PostgreSQL read replica

Faqat **o‘qish** yuklari (hisobotlar, analytics) og‘ir bo‘lsa:

- Asosiy DB: barcha yozuvlar.
- Replica: `SELECT` so‘rovlarini alohida Prisma client yoki `prisma.$queryRaw` bilan (keyingi bosqichda alohida `DATABASE_READ_URL`).

Yozuvlar doim primaryda qoladi.

## Redis cache

Spravochnik va kam o‘zgaradigan ma’lumotlar uchun qisqa TTL (masalan 60–300 s) — invalidatsiya o‘zgarishda aniq qoida bilan.

## Tekshirish

- `/ready` va `slow_request` loglari [SLO_AND_OBSERVABILITY.md](./SLO_AND_OBSERVABILITY.md).
