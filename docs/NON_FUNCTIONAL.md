# Platforma talablari (ko‘p foydalanuvchi, barqarorlik, xatolar)

Bu hujjat loyiha bo‘yicha **nofunksional** yo‘nalishlarni belgilaydi; har bir katta o‘zgarishdan oldin qisqacha tekshiriladi.

## Bir vaqtda ko‘pchilik

- **Ma’lumotlar bazasi** — pul/zakaz/stok bilan bog‘liq yozuvlar faqat **transaction** ichida; mumkin bo‘lsa `SELECT … FOR UPDATE` yoki idempotent kalitlar (Faza 4+).
- **Zakaz yaratish / qatorlarni yangilash** — `orders.service` da bitta `prisma.$transaction`: narx, avto-bonus, **kredit tekshiruvi** (`open_orders_total` + yangi summa) va **hisob saldosi** (`client_balances.balance` qo‘shilib «headroom» = `credit_limit + balance`), keyin `order` + `order_item` yozuvlari. Xato — butun tranzaksiya bekor.
- **Mijoz birlashtirish** — `merge`: avvalo zakazlar `client_id` yangilanadi, keyin qo‘shimcha mijozlar `merged_into` + `is_active: false` (bitta tranzaksiya). Keyin **audit** yozuvi.
- **Balans harakati** — `client_balances` upsert + `client_balance_movements` bitta tranzaksiyada.
- **Kilitleme (keyingi bosqich)** — parallel stok rezervi yoki ikki operator bir zakazni tahrirlasa, Faza 5+ da `FOR UPDATE` (stock/qty) yoki versiya maydoni (`updated_at` optimistik) qo‘llanadi.
- **Produksiya: telefon noyobligi** — bir tenantda bir vaqtning o‘zida faol (`merged_into` bo‘sh) va `phone_normalized` to‘ldirilgan yozuvlar uchun DB da **qisman UNIQUE** indeks tavsiya etiladi; mavjud dublikatlar avval `merge` bilan tuzatiladi (seed dublikatlari sinov uchun qoldirilishi mumkin).
- **API** — og‘ir hisobotlar alohida worker/read-replica (keyinchalik); hozircha indekslar va `limit` bilan cheklash.
- **Frontend** — bir xil ma’lumot uchun **optimistic UI** ixtiyoriy; asosan server javobiga tayanadi.

## Xabar va loglar

- Har bir so‘rovda Fastify **`request.id`** — xato JSON javobida **`requestId`** qaytariladi (kuzatish uchun).
- **Pino** loglarida `requestId` bilan bog‘lash tavsiya etiladi (allaqachon `reply`/`request` konteksti orqali).
- Klientda foydalanuvchiga: **qisqa xato matni**; texnik tafsilotlar faqat `requestId` orqali logdan.

## Regressiya va o‘zgarishlar xavfsizligi

- **Backend:** `npm run test:ci` yashil bo‘lishi kerak; integratsiya testlari DB marker bilan.
- **Migratsiyalar** — mavjud ma’lumotni **buzmasdan** (`ADD COLUMN`, backfill, keyin constraint); eski API shartlari saqlanadi yoki deprecation davri.
- Kichik PR — faqat tegishli modul; keng refaktor alohida.

## Yagona klientlar bazasi va dublikatlar

- Barcha klientlar **tenant ichida** bitta `clients` jadvalida; `phone_normalized` telefonni solishtirish uchun.
- **Dublikatlar:** bir xil `phone_normalized` bo‘yicha guruhlar (`GET .../duplicate-groups`), yangi yozuvdan oldin tekshiruv (`POST .../check-duplicates`).
- **Birlashtirish:** `POST .../merge` — zakazlar `keep` mijozga ko‘chiriladi, qolgan yozuvlar `merged_into_client_id` + `is_active: false`; **audit** `client_audit_logs` da `client.merge`.
- **Audit:** `GET .../clients/:id/audit` — PATCH, balans harakatlari, merge; operator/admin ko‘rishi mumkin.
- Kelajak: STIR/INN, fonetik nom, avtomatik merge qoidalari.
