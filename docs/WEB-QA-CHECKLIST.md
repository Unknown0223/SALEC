# Testlar va veb orqali tekshirish (qadamba-qadam)

Lokal panel odatda **[http://127.0.0.1:3000](http://127.0.0.1:3000)** (yoki **[http://localhost:3000](http://localhost:3000)**). API **[http://127.0.0.1:4000](http://127.0.0.1:4000)**. Boshqa port bo‘lsa, havolalardagi `3000` ni almashtiring.

---

## 1. Avtomatik testlar (barcha qatlamlar)

Quyidagi buyruqlarni **loyiha ildizidan** (`SALEC`) yoki ko‘rsatilgan papkadan ishga tushiring.

| Qadam | Buyruq | Nima qiladi |
|--------|--------|-------------|
| 1 | `npm run test:all` (ildizdan) | **To‘liq minimal gate**: backend+frontend testlar, E2E smoke, load smoke |
| 1a | `npm test` (ildizdan) | Backend **Vitest** (`test:ci`) + frontend **typecheck** + **Vitest** |
| 2 | `npm run test:backend` | Faqat API unit testlari |
| 3 | `npm run test:frontend:ci` | Frontend TypeScript + Vitest |
| 4 | `npm run frontend:lint` | ESLint (Next) |
| 5 | `npm run frontend:typecheck` | `tsc --noEmit` |
| 6 | `npm run build` (ildizdan) | Backend + frontend production yig‘inishi |
| 7 | `npm run test:e2e:smoke` (ildizdan) | Playwright **tezkor paket**: login + dashboard qobig‘i + **asosiy marshrutlar** (server kerak, quyida) |
| 8 | `npm run test:e2e` (ildizdan) | Barcha Playwright senariylari |
| 9 | `npm run load:smoke` (ildizdan) | API **health** smoke (`scripts/load-smoke.mjs`) |

**E2E oldidan server:** `npm run dev` (ildizdan) yoki alohida backend + `npm run dev --prefix frontend`. **CI uslubi** (`next start`): ildizdan `npm run build`, so‘ng `npm run test:e2e:ci --prefix frontend` — batafsil: [`PHASE_PROGRESS.md`](./PHASE_PROGRESS.md) → «E2E».

**To‘liq stack (haqiqiy login + zakaz):** `frontend` da muhit o‘zgaruvchilari: `E2E_TENANT_SLUG`, `E2E_LOGIN`, `E2E_PASSWORD` (masalan `test1` / `admin` + seed parol). Keyin `npx playwright test e2e/login-full-stack.spec.ts e2e/order-create-full-stack.spec.ts` (`frontend` papkasida).

### Playwright fayllari

| Fayl | Maqsad |
|------|--------|
| `frontend/e2e/fake-session.ts` | Sessiyasiz E2E uchun cookie + `localStorage` (admin `test1`) |
| `frontend/e2e/login-smoke.spec.ts` | `/login` formasi ko‘rinadi |
| `frontend/e2e/dashboard-shell-smoke.spec.ts` | `/dashboard` qobig‘i ochiladi |
| `frontend/e2e/dashboard-routes-smoke.spec.ts` | Asosiy panel URL-lari `/login` ga qaytmasligi |
| `frontend/e2e/login-full-stack.spec.ts` | Haqiqiy login (`E2E_*` bo‘lmasa `skip`) |
| `frontend/e2e/order-create-full-stack.spec.ts` | Yangi zakaz zanjiri (`E2E_*` bo‘lmasa `skip`) |

---

## 2. Brauzerda qadamba-qadam tekshirish (silliq)

Har bir bandda havolani oching, sahifa **ochilishini**, **xato sahifasiz** yuklanishini va (mumkin bo‘lsa) jadval yoki tugmalarning ko‘rinishini tekshiring. Avval **[kirish](http://127.0.0.1:3000/login)** qiling (tenant slug, login, parol).

### 2.1 Kirish va bosh sahifa

1. Ochish: [http://127.0.0.1:3000/login](http://127.0.0.1:3000/login) — «Вход», slug, login, parol, **Войти**.
2. Muvaffaqiyatdan keyin: [http://127.0.0.1:3000/dashboard](http://127.0.0.1:3000/dashboard) — boshqaruv paneli, statistika yoki yuklash/xato holati.

### 2.2 Zakazlar

1. [http://127.0.0.1:3000/orders](http://127.0.0.1:3000/orders) — ro‘yxat, filtr, qidiruv.
2. [http://127.0.0.1:3000/orders/new](http://127.0.0.1:3000/orders/new) — yangi zakaz: klient, ombor, miqdor, **Yaratish**.
3. Qaytarishlar: [http://127.0.0.1:3000/returns](http://127.0.0.1:3000/returns).

### 2.3 Mijozlar va maydon

1. [http://127.0.0.1:3000/clients](http://127.0.0.1:3000/clients) — ro‘yxat.
2. [http://127.0.0.1:3000/clients/map](http://127.0.0.1:3000/clients/map) — xarita (Leaflet).
3. [http://127.0.0.1:3000/territories](http://127.0.0.1:3000/territories) — hududlar.

### 2.4 Mahsulotlar

1. [http://127.0.0.1:3000/settings/products](http://127.0.0.1:3000/settings/products) — kartoteka (asosiy). Eslatma: `/products` middleware orqali shu yo‘lga yo‘naltiriladi.

### 2.5 Ombor

1. [http://127.0.0.1:3000/stock](http://127.0.0.1:3000/stock) — qoldiq / kirim.
2. [http://127.0.0.1:3000/stock/picking](http://127.0.0.1:3000/stock/picking) — komplektatsiya.
3. [http://127.0.0.1:3000/stock/correction](http://127.0.0.1:3000/stock/correction) — korrektirovka (admin).
4. [http://127.0.0.1:3000/stock/receipts](http://127.0.0.1:3000/stock/receipts) — postupleniye.
5. [http://127.0.0.1:3000/stock/transfers](http://127.0.0.1:3000/stock/transfers) — ko‘chirish.
6. [http://127.0.0.1:3000/stock/warehouses](http://127.0.0.1:3000/stock/warehouses) — omborlar.
7. [http://127.0.0.1:3000/stock/balances](http://127.0.0.1:3000/stock/balances) — qoldiqlar.
8. [http://127.0.0.1:3000/stock/low](http://127.0.0.1:3000/stock/low) — kam qoldiq.
9. [http://127.0.0.1:3000/stock/inventory-counts](http://127.0.0.1:3000/stock/inventory-counts) — inventarizatsiya.

### 2.6 Marshrut, vazifalar, tashriflar

1. [http://127.0.0.1:3000/visits](http://127.0.0.1:3000/visits) — tashriflar.
2. [http://127.0.0.1:3000/tasks](http://127.0.0.1:3000/tasks) — vazifalar.
3. [http://127.0.0.1:3000/routes](http://127.0.0.1:3000/routes) — marshrut.
4. [http://127.0.0.1:3000/routes/track](http://127.0.0.1:3000/routes/track) — GPS trek.

### 2.7 Moliya

1. [http://127.0.0.1:3000/settings/cash-desks](http://127.0.0.1:3000/settings/cash-desks) — kassa.
2. [http://127.0.0.1:3000/payments](http://127.0.0.1:3000/payments) — to‘lovlar.
3. [http://127.0.0.1:3000/expenses](http://127.0.0.1:3000/expenses) — xarajatlar.

### 2.8 Hisobotlar

1. [http://127.0.0.1:3000/reports](http://127.0.0.1:3000/reports) — yig‘ma hisobotlar (tablar).

### 2.9 Foydalanuvchilar (spravochnik)

1. [http://127.0.0.1:3000/settings/spravochnik](http://127.0.0.1:3000/settings/spravochnik) — umumiy.
2. [http://127.0.0.1:3000/settings/spravochnik/agents](http://127.0.0.1:3000/settings/spravochnik/agents) — agentlar.
3. [http://127.0.0.1:3000/settings/spravochnik/expeditors](http://127.0.0.1:3000/settings/spravochnik/expeditors) — ekspeditorlar.
4. [http://127.0.0.1:3000/settings/spravochnik/supervisors](http://127.0.0.1:3000/settings/spravochnik/supervisors) — supervayzerlar.
5. [http://127.0.0.1:3000/settings/spravochnik/operators](http://127.0.0.1:3000/settings/spravochnik/operators) — operatorlar.

### 2.10 Sozlamalar (tanlangan bo‘limlar)

1. [http://127.0.0.1:3000/settings](http://127.0.0.1:3000/settings) — kirish.
2. [http://127.0.0.1:3000/settings/company](http://127.0.0.1:3000/settings/company) — kompaniya.
3. [http://127.0.0.1:3000/settings/audit](http://127.0.0.1:3000/settings/audit) — audit.
4. [http://127.0.0.1:3000/settings/products](http://127.0.0.1:3000/settings/products) — mahsulotlar sozlamalari.
5. [http://127.0.0.1:3000/settings/prices](http://127.0.0.1:3000/settings/prices) — narxlar.
6. [http://127.0.0.1:3000/settings/prices/price-list](http://127.0.0.1:3000/settings/prices/price-list) — price list.
7. [http://127.0.0.1:3000/settings/prices/matrix](http://127.0.0.1:3000/settings/prices/matrix) — narx matritsasi.
8. [http://127.0.0.1:3000/settings/product-categories](http://127.0.0.1:3000/settings/product-categories) — kategoriyalar.
9. [http://127.0.0.1:3000/settings/units](http://127.0.0.1:3000/settings/units) — o‘lchov birliklari.
10. [http://127.0.0.1:3000/settings/suppliers](http://127.0.0.1:3000/settings/suppliers) — yetkazib beruvchilar.
11. [http://127.0.0.1:3000/settings/branches](http://127.0.0.1:3000/settings/branches) — filiallar.
12. [http://127.0.0.1:3000/settings/payment-methods](http://127.0.0.1:3000/settings/payment-methods) — to‘lov usullari.
13. [http://127.0.0.1:3000/settings/price-types](http://127.0.0.1:3000/settings/price-types) — narx turlari.
14. [http://127.0.0.1:3000/settings/currencies](http://127.0.0.1:3000/settings/currencies) — valyutalar.
15. [http://127.0.0.1:3000/settings/bonus-rules](http://127.0.0.1:3000/settings/bonus-rules) — bonus qoidalari.

**Qo‘shimcha spravochniklar** (`/settings/client-categories`, `/settings/client-types`, sabablar, jihozlar va hokazo) — chap menudan yoki [http://127.0.0.1:3000/settings](http://127.0.0.1:3000/settings) ichidagi havolalar orqali tekshiring.

---

## 3. Real misollar (oddiy)

1. **Release oldidan 1 tugma**: `npm run test:all` ishlatib, test + E2E smoke + load smoke ni birdan yopasiz.
2. **Zakaz oqimi**: `/orders/new` da `Asosiy mijoz (seed)` + `Asosiy ombor` + `1 dona` + **Yaratish** -> `/orders` ga qaytishi kerak.
3. **Hisobot sog‘lomligi**: `/reports` da tablarni almashtirib ko‘ring, keyin `npm run load:smoke` bilan API healthni tekshiring.

## 4. Qisqa eslatmalar

- **401 / kirish qayta:** sessiya tugagan bo‘lishi mumkin — qayta login.
- **API yo‘q:** sahifada «API bilan aloqa yo‘q» kabi matn — avval backend ishga tushganini tekshiring.
- **Rollar:** operator / supervayzer ba’zi sahifalarni ko‘rmasligi mumkin — tekshiruvni **admin** bilan takrorlang.

Gate va fazalar: [`PHASE_GATES.md`](./PHASE_GATES.md), jarayon: [`PHASE_PROGRESS.md`](./PHASE_PROGRESS.md).
