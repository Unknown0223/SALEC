-- Ombor — foydalanuvchi bog‘lanishlari (kassa user_links ga o‘xshash)
CREATE TABLE "warehouse_user_links" (
    "id" SERIAL NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "link_role" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warehouse_user_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "warehouse_user_links_warehouse_id_user_id_key" ON "warehouse_user_links"("warehouse_id", "user_id");
CREATE INDEX "warehouse_user_links_warehouse_id_link_role_idx" ON "warehouse_user_links"("warehouse_id", "link_role");
CREATE INDEX "warehouse_user_links_user_id_idx" ON "warehouse_user_links"("user_id");

ALTER TABLE "warehouse_user_links" ADD CONSTRAINT "warehouse_user_links_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "warehouse_user_links" ADD CONSTRAINT "warehouse_user_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Eski users.warehouse_id dan boshlang‘ich bog‘lanishlar
INSERT INTO "warehouse_user_links" ("warehouse_id", "user_id", "link_role")
SELECT u."warehouse_id", u."id",
  CASE u."role"
    WHEN 'agent' THEN 'agent'
    WHEN 'supervisor' THEN 'supervisor'
    WHEN 'expeditor' THEN 'expeditor'
    WHEN 'operator' THEN 'operator'
    ELSE 'operator'
  END
FROM "users" u
WHERE u."warehouse_id" IS NOT NULL AND u."is_active" = true
ON CONFLICT ("warehouse_id", "user_id") DO NOTHING;
