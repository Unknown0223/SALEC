# Doctor SALEC Benchmark Checklist

Bu hujjat mavjud modullarni Doctor SALEC andoza darajasiga yaqinlashtirish uchun moslik mezonlari va qabul kriteriyalarini belgilaydi.

## 1) Auth va Tenant
- Login muvaffaqiyatsiz bo'lsa foydalanuvchiga aniq xabar chiqadi.
- Tenant noto'g'ri bo'lsa API `404 TenantNotFound` yoki `403 CrossTenantDenied` qaytaradi.
- Access token eskirganda refresh oqimi ishlaydi, ishlamasa sessiya tozalanadi.
- Protected endpointlar role va tenant bo'yicha izchil himoyalangan.

## 2) Clients
- Jadvalda ustunlarni ko'rsatish/yashirish saqlanadi (`localStorage`).
- Qidiruv, filter, sort, pagination birgalikda ishlaydi.
- Client kartochkasi (edit) list/detail bilan bir xil maydonlarni ko'rsatadi.
- Bo'sh maydonlar uchun yagona fallback (`—`) ishlatiladi.

## 3) Orders
- Yangi zakaz yaratish, tahrirlash, holat o'zgartirish zanjiri ishlaydi.
- Noto'g'ri transitionlar aniq API xatoga tushadi (`InvalidTransition`).
- SSE orqali zakazlar ro'yxati va detail invalidation bo'ladi.
- Kredit limiti buzilganda aniq biznes xabar qaytadi.

## 4) Stock/Ombor
- Omborlar CRUD ishlaydi va auth bilan himoyalangan.
- Ombor ma'lumotlari sahifalarda bir xil nomlash/holat bilan ko'rsatiladi.
- Order/stock bog'liq endpointlar DB uzilganda 500 emas, kuzatiladigan xatolik beradi.

## 5) Settings/Spravochnik
- Master-data endpointlari (`users`, `product-categories`, `price-types`) barqaror ishlaydi.
- Xatolik holatlarida user-friendly xabar va retry mavjud.

## 6) Operatsion Sifat
- `GET /health` (liveness) va `GET /ready` (readiness) mavjud.
- Readiness DB holatini tekshiradi, Redis holatini `ok/degraded` sifatida ko'rsatadi.
- Startup paytida DB ulanishi tekshiriladi (`prisma.$connect()`).
- CI backend + frontend quality gate bilan ishlaydi.

## Acceptance Criteria (DoD)
- Critical sahifalar (`orders`, `clients`, `products`, `stock/warehouses`) 500 paytida retry bilan tiklana oladi.
- Frontendda texnik stacktrace/message foydalanuvchiga to'g'ridan-to'g'ri chiqmaydi.
- API misconfig va dependency yo'q holatini tez aniqlash mumkin (`/ready`, loglar).
- Lint, typecheck, build CI'da o'tmasdan merge qilinmaydi.
