# Staff import — `scripts/data` dagi Excel

`npm run import:once` va `npm run import:staff:triple` **bir xil** import modulidan foydalanadi (`scripts/lib/active-agents-xlsx-import.ts`). Ishga tushirish: **`backend` papkasidan** (`cd backend`), chunki yo‘llar `scripts/data/...` ga nisbatan.

## Boshqa kompyuter / git clone

1. Uchta faylni shu katalogga qo‘ying (ketma-ketlik: avval agentlar, keyin eksportlar, oxirida supervayzer — SVR «Агент» ustuni agentlarga bog‘lanadi).

2. **Tavsiya etilgan nomlar** (ASCII, har qanday OSda qulay):

| Fayl | Rol |
|------|-----|
| `staff-agents.xlsx` | Faol agentlar |
| `staff-expeditors.xlsx` | Faol eksportlar |
| `staff-supervisors.xlsx` | Supervayzerlar |

3. Alternativa: ruscha nomlar yoki `active-agents.xlsx` / `active-expeditors.xlsx` / `active-supervisors.xlsx` — to‘liq ro‘yxat `resolveAgentsXlsxPath` / `resolveExpeditorsXlsxPath` / `resolveSupervisorsXlsxPath` funksiyalarida.

4. Downloads dan avtomatik nusxa: `npm run sync:staff-xlsx` (`%USERPROFILE%\Downloads` → `scripts/data`, standart nomlar bilan).

5. Tekshiruv (bazaga yozmaydi): `npm run validate:staff-xlsx` (default: Downloads dagi `(3)`/`(2)` nomlari; argv bilan `scripts/data` ga yo‘l berish mumkin).

## Eski nomlar (hali ham ishlaydi)

Masalan: `Активные агенты (2).xlsx`, `Активные Активные экспедиторы (2).xlsx`, `Супервайзеры (1).xlsx` — agar yuqoridagi `staff-*.xlsx` yo‘q bo‘lsa, navbatdagi nom sinanadi.
