# Sozlamalar strukturasini bosqichma-bosqich joriy etish

## Maqsad

- Sozlamalar bo'limini yagona katalog ko'rinishiga o'tkazish.
- Mavjud funksional sahifalarni yangi struktura elementlariga moslashtirish.
- Hali yo'q sahifalar uchun "rejalashtirilgan" holatda placeholder saqlash.

## Joriy holat

- Frontendda `settings` katalog sahifasi yaratildi.
- Katalog elementlari uchun universal route ochildi: `/settings/catalog/:section/:item`.
- Mavjud modullarga mos elementlar link orqali bog'landi.
- Qolgan elementlar "rejalashtirilgan" statusida turibdi.

## Keyingi bosqichlar

1. **API mapping**: har bir rejalashtirilgan element uchun backend endpointlar ro'yxatini aniqlash.
2. **CRUD sahifalar**: priority bo'yicha alohida boshqaruv sahifalarini ochish.
3. **Ruxsatlar**: admin/moderator rollari bo'yicha kirish cheklovlarini nozik sozlash.
4. **Audit**: yangi settings modullarida audit event yozuvlarini majburiy qilish.
5. **Migratsiya**: eski "spravochnik" entrypointlardan yangi katalogga bosqichli o'tish.

## Prioritet (1-navbat)

- Единицы измерения
- Филиалы
- Должности
- Валюты
- Цена
- Направление торговли
- Причины заявок
- Типы задач
- Тип инвентаря
- Принтеры
