# SalesDoc — katta funksiyalar roadmap (20.2)

Har bir band alohida epik / PR sifatida rejalashtiriladi: migratsiya (agar kerak), API, UI, test.

## 1. Mobil ilova va sinxronizatsiya

- Mavjud: `User.apk_version`, `device_name`, `last_sync_at`.
- Kerak: mobil klient, offline navbat, konflikt siyosati, versiyalangan API.

## 2. Push bildirishnomalar (FCM / APNS)

- Mavjud: `InAppNotification`, polling, buyurtma statusi o‘zgaganda agent/ekspeditor uchun ichki xabar.
- Kerak: FCM qurilma tokenlari, serverdan yuborish, foydalanuvchi sozlamalari.

## 3. Van-selling

- Mavjud: `Warehouse.van_selling`, info sahifa.
- Kerak: mobil savdo oqimi, offline qoldiq, sinxron.

## 4. Buyurtma taklifi (proposal)

- Mavjud: `TradeDirection.use_in_order_proposal`.
- Kerak: backend taklif generatsiyasi, UI tanlash, zakazga bog‘lash.

## 5. Kassa operatsiyalari

- Mavjud: `CashDesk`, `CashDeskShift`, foydalanuvchi biriktirish.
- Kerak: to‘lov qabul, qaytim, chek chop etish, kunlik yopish (Z-report).

## 6. Ombor transferlari

- Mavjud: `Stock`, `GoodsReceipt`, `StockTake`.
- Kerak: `warehouse_id` o‘rtasida hujjat (draft/posted), partiya ixtiyoriy.

## 7. Partiya / yaroqlilik muddati

- Kerak: `batch` / `expiry` modellari, FIFO/FEFO siyosati, UI.

## 8. HR / performans

- Mavjud: KPI guruhlari, hisobotlar.
- Kerak: ish jadvali, zarplata moduli, nadbavki/vychety to‘liq jarayon.

## 9. Bilimlar bazasi

- Kerak: model + API + qidiruv (hozir faqat settings placeholder).

## 10. Byudjet / chiqimlar

- Kerak: `Expense` yoki moliya moduli, hisobotlar.

## 11. Printer integratsiyasi

- Kerak: chek/etiketka shablonlari, lokal yoki cloud print.

## 12. SMS / Email

- Kerak: provayder, shablonlar, hodisalar bilan bog‘lash.

## 13. Narx strategiyasi

- Mavjud: agent `price_type`, `agent_entitlements`.
- Kerak: murakkab qoidalar UI va server validatsiyasi.

## 14. Avtomatik status workflow

- Kerak: qoidalar jadvali yoki DSL (masalan: `delivered` + N kun → avtomatik yopish).

## 15. Hisobotlar vizuallash

- Mavjad: jadval + Excel.
- Kerak: Recharts / Chart.js, dashboard boyitish.

---

Ustuvorlikni loyiha egasi biznes qiymati bo‘yicha belgilaydi; texnik qarz: [API-reference](./API-reference.md) va test qoplamasini saqlab turish.
