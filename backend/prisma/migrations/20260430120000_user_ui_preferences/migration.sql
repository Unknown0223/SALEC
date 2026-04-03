-- Jadval va boshqa UI sozlamalarini foydalanuvchi bo‘yicha saqlash
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ui_preferences" JSONB NOT NULL DEFAULT '{}';
