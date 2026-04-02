# Audit jurnalini saqlash muddati (retention)

`tenant_audit_events` jadvali vaqt o‘tishi bilan o‘sadi. Eski yozuvlarni muntazam arxivlash yoki o‘chirish tavsiya etiladi.

## Skript

Backend papkasida:

```bash
AUDIT_RETENTION_DAYS=365 npm run audit:retention
```

Default: **730** kun (2 yil). `DATABASE_URL` `.env` dan o‘qiladi.

## Cron misoli

```cron
0 3 * * 0 cd /path/to/SALEC/backend && AUDIT_RETENTION_DAYS=730 npm run audit:retention >> /var/log/salec-audit-retention.log 2>&1
```

Avvalo zaxira (`pg_dump`) yoki arxiv jadvalga ko‘chirishni rejalashtiring.
