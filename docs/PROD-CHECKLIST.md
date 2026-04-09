# Production Checklist (FAZA 10)

Bu hujjat deploy oldidan va deploy paytida bir xil tartibda ishlash uchun.

Staging (Railway) uchun alohida yo‘riqnoma: `docs/RAILWAY-STAGING-CHECKLIST.md`.

---

## 1) Release oldidan (pre-flight)

- [ ] `main`/release branch yangilangan, migrationlar tekshirilgan.
- [ ] `.env` prod qiymatlari tayyor (`DATABASE_URL`, `JWT_*`, `REDIS_URL`, frontend `NEXT_PUBLIC_*`).
- [ ] DB backup olish oynasi kelishilgan.
- [ ] Domen va SSL sertifikat tayyor (`api.<domain>`, `app.<domain>` yoki bitta wildcard).

### Minimal tekshiruv buyruqlari

Loyiha ildizida:

```bash
npm run test:all
npm run build
```

Backend alohida:

```bash
npm run db:deploy --prefix backend
```

---

## 2) Server tayyorlash

- [ ] Linux user va papkalar (`/opt/salec`, `/var/log/salec`) yaratilgan.
- [ ] Node LTS, PM2, Nginx o‘rnatilgan.
- [ ] Postgres va Redis ulanadi (lokal yoki managed).
- [ ] Firewall: 80/443 ochiq, DB portlari tashqaridan yopiq.
- [ ] Nginx config tayyor: `infrastructure/nginx/salec-prod.conf`.
- [ ] PM2 ecosystem tayyor: `infrastructure/pm2/ecosystem.config.cjs`.

---

## 3) Deploy ketma-ketligi

1. **Kod yangilash**
   - [ ] yangi release checkout/pull.
2. **Dependency**
   - [ ] `npm ci`
   - [ ] `npm ci --prefix backend`
   - [ ] `npm ci --prefix frontend`
3. **DB**
   - [ ] `npm run db:deploy --prefix backend`
4. **Build**
   - [ ] `npm run build`
5. **Process restart**
   - [ ] PM2 orqali backend/frontend restart.
   - [ ] `pm2 start infrastructure/pm2/ecosystem.config.cjs` (birinchi marta).
   - [ ] `pm2 save`.
6. **Nginx reload**
   - [ ] `sudo nginx -t` va `sudo systemctl reload nginx`.

---

## 4) Smoke check (prod URL bilan)

- [ ] `GET /health` = 200.
- [ ] Login ishlaydi.
- [ ] Dashboard ochiladi.
- [ ] Zakaz yaratish oqimi ishlaydi (`/orders/new` -> `/orders`).
- [ ] `/reports` ochiladi va kamida bitta tab ishlaydi.

Minimal qo‘lda tekshirish havolalari:

- `https://app.<domain>/login`
- `https://app.<domain>/dashboard`
- `https://app.<domain>/orders/new`
- `https://app.<domain>/orders`
- `https://app.<domain>/reports`
- `https://api.<domain>/health`

---

## 5) Rollback rejasi (oddiy)

- [ ] Oldingi release tag saqlangan.
- [ ] Oldingi `.env` nusxasi saqlangan.
- [ ] PM2 oldingi buildga qaytarish qadamlari sinovdan o‘tgan.
- [ ] DB migration rollback rejasi aniq (yoki forward-fix strategiya).

Amaliy qoida:

1. Agar backend start bo‘lmasa: oldingi commitga checkout + `npm run build --prefix backend` + PM2 restart.
2. Agar frontend buzilsa: oldingi commitga checkout + `npm run build --prefix frontend` + PM2 restart.
3. Agar migration xavfli bo‘lsa: darhol rollback emas, forward-fix branch bilan tez patch.

---

## 6) Go-live yakun

- [ ] Monitor/alertlar yoqilgan (CPU, RAM, restart count, 5xx).
- [ ] Backup cron yoqilgan va test restore bajarilgan.
- [ ] Release note yozilgan (nima o‘zgardi, risk, rollback).
- [ ] Birinchi 24 soat kuzatuv mas’uli biriktirilgan.

### Backup/restore skriptlari (Windows operator uchun)

- Backup: `powershell -File scripts/db-backup.ps1 -Password "<postgres_password>"`
- Restore: `powershell -File scripts/db-restore.ps1 -DumpFile "backups\\savdo_db-YYYYMMDD-HHMMSS.dump" -Password "<postgres_password>"`

