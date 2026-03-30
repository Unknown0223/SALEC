# Infrastructure (lokal ishlab chiqish)

## Servislar

- **PostgreSQL 16** — `localhost:5432`, DB: `savdo_db`, foydalanuvchi: `postgres`, parol: **`0223`** (`docker-compose.yml` bilan mos).
- **Redis 7** — `localhost:6379`.

## Ishga tushirish

Docker Desktop **yoqilgan** bo‘lishi kerak (Windows: trey ikonka, “Engine running”).

```powershell
cd d:\SALESDOC\infrastructure
docker compose up -d
```

Holatni tekshirish:

```powershell
docker compose ps
```

To‘xtatish:

```powershell
docker compose down
```

Hajmni tozalash (barcha ma’lumot o‘chadi):

```powershell
docker compose down -v
```

---

## Muammo: «daemon ishlamayapti» / `dockerDesktopLinuxEngine`

**Sabab:** Docker Desktop o‘chiq yoki WSL2 backend ishlamayapti.

**Qadamlar:**

1. **Docker Desktop** ni Windows da oching va kutib turing (birinchi marta uzoqroq).
2. *Settings → General* da **Use the WSL 2 based engine** yoqilgan bo‘lsin (tavsiya).
3. *Settings → Resources → WSL integration* — ishlatayotgan distro uchun yoqilgan bo‘lsin.
4. Keyin yana `docker compose up -d`.

Agar Docker ishlatmasangiz, PostgreSQL ni [postgresql.org](https://www.postgresql.org/download/windows/) dan o‘rnatib, `backend\.env` dagi `DATABASE_URL` ni shu serverga moslang (parolni o‘zingiz belgilaysiz; `0223` majburiy emas).

---

## `.env` va ulanish manzili

- Ilovadan (host mashinadan) ulanishda **`localhost:5432`** ishlating.
- Konteyner **ichki** IP (`172.x.x.x`) konteyner qayta yaratilganda o‘zgarishi mumkin — `.env` ga yozmang.
- `backend\.env` namunasi: `postgresql://postgres:0223@localhost:5432/savdo_db`

---

## Backend bilan bog‘lash

```powershell
cd d:\SALESDOC\backend
npx prisma migrate deploy
npx prisma db seed
npm run dev
```

---

## Tavsiyalar

| Tavsiya | Sabab |
|--------|--------|
| Docker faqat dev uchun | Production da managed DB (RDS, Hetzner DB) + alohida backup rejasi. |
| `localhost` + port | Barqaror ulanish; ichki Docker IP dan qoching. |
| CI va lokal parollar farq qilishi mumkin | GitHub Actions da `postgres:postgres`; lokal compose `0223` — ikkalasi ham `.env` / workflow orqali boshqariladi. |
| Redis hozircha ixtiyoriy | Keyingi bosqichlarda navbat/kesh uchun ishlatiladi. |

Seed paroli (test): tenant `test1`, login `admin`, parol `secret123`.
