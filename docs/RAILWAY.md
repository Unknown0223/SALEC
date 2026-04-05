# Railway ga deploy (SALESDOC)

Monorepo: **ikkita alohida servis** + **PostgreSQL** + **Redis** tavsiya etiladi.

## 1. PostgreSQL va Redis

1. Railway loyihasida **New** → **Database** → **PostgreSQL**.
2. **New** → **Database** → **Redis**.

`DATABASE_URL` va `REDIS_URL` ni backend servisiga **Reference** qilib ulashingiz mumkin (Variables → *Add Reference*).

## 2. Backend (API)

1. **New** → **GitHub Repo** → reponi tanlang.
2. Servis **Settings** → **Root Directory**: `backend`.
3. **Settings** → **Build** → *Dockerfile* tanlansa, repodagi `backend/Dockerfile` ishlatiladi (`railway.toml` ham bor).

**Variables** (Production uchun `env.ts` qat’iy tekshiradi):

| O‘zgaruvchi | Tavsif |
|-------------|--------|
| `NODE_ENV` | `production` |
| `PORT` | bo‘sh qoldiring — Railway beradi |
| `DATABASE_URL` | PostgreSQL dan reference |
| `REDIS_URL` | Redis dan reference |
| `JWT_ACCESS_SECRET` | kamida 32 belgi, tasodifiy |
| `JWT_REFRESH_SECRET` | kamida 32 belgi, tasodifiy |
| `CORS_ALLOWED_ORIGINS` | Frontend public URL, vergul bilan bir nechta: `https://sizning-panel.up.railway.app` |

**Deploy keyin:** `https://<backend-servis>.up.railway.app/health` → `{"status":"ok",...}` bo‘lishi kerak.

## 3. Frontend (Next.js)

1. Yana **New** → shu repo, alohida servis.
2. **Root Directory**: `frontend`.
3. **Variables**:
   - `NEXT_PUBLIC_API_URL` = backend to‘liq URL, **https** bilan, oxirida `/` **bo‘lmasin** (masalan `https://xxx.up.railway.app`).
   - Bu o‘zgaruvchini Railway da **“Available at build time”** (yoki Build-time variable) qilib yoqing — aks holda `next build` API manzilini bilmaydi.

`PORT` ni o‘zgartirmang — Railway beradi. `next start` `PORT` ni o‘qiydi, `-H 0.0.0.0` allaqachon `package.json` da.

## 4. Tekshiruvlar

- Brauzerda frontend ochiladi, login API ga backend URL orqali boradi.
- Agar CORS xatosi bo‘lsa: `CORS_ALLOWED_ORIGINS` dagi manzil frontend bilan **aniq** mos kelishi kerak (`https://`, domen, yo‘l yo‘q).

## 5. Mahalliy Docker (ixtiyoriy)

Repoda:

```bash
docker build -t salesdoc-api ./backend
docker build -t salesdoc-web --build-arg NEXT_PUBLIC_API_URL=http://127.0.0.1:4000 ./frontend
```

Backend konteynerini ishga tushirishda `DATABASE_URL`, `REDIS_URL` va yuqoridagi maxfiy kalitlarni `-e` bilan bering.
