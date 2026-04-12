# Kod bazasi vs hujjat (qisqa)

`ARCHITECTURE.md` — uzoq muddatli **maqsad** va variantlar; quyidagi jadval **hozirgi repodagi** asosiy moslikni ko‘rsatadi.

| Bo‘lim | Hujjatda ko‘pincha | Hozirgi kod |
|--------|-------------------|-------------|
| Backend framework | Fastify | Fastify 4 |
| ORM | Prisma | Prisma 6 |
| DB | PostgreSQL | PostgreSQL (`schema.prisma`) |
| Validatsiya | Zod | Zod |
| Redis | cache / pub-sub / navbat | **ioredis**: order event bus + (ixtiyoriy) BullMQ worker |
| PDF | ba’zan Puppeteer | **pdfkit** (+ Excel exportlar) |
| Real-time | WebSocket | Asosan **SSE** / Redis pub-sub (order stream) |
| Fon navbat | BullMQ | **Worker** `process-background-job.ts` (mijoz/ombor/mahsulot/narx Excel importlari + `ping`); **API** tegishli `.../async` + `GET .../jobs/:jobId` |
| Mobil | Flutter | **Reja** (`docs/ROADMAP.md`); API da `mobile` moduli |
| Fayl storage | MinIO | To‘liq integratsiya **reja** |

**Xulosa:** stack tanlovi loyiha uchun mantiqiy; farqlar — asosan kelajakdagi modullar yoki soddalashtirilgan kutubxonalar. Yangi og‘ir operatsiyalar uchun `docs/BACKGROUND_JOBS_PLAN.md` va worker kengaytiriladi.
