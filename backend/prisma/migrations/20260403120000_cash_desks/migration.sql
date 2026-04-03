-- CreateTable
CREATE TABLE "cash_desks" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Tashkent',
    "sort_order" INTEGER,
    "code" VARCHAR(20),
    "comment" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_desks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_desk_user_links" (
    "id" SERIAL NOT NULL,
    "cash_desk_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "link_role" VARCHAR(32) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_desk_user_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_desks_tenant_id_is_active_idx" ON "cash_desks"("tenant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "cash_desks_tenant_id_code_key" ON "cash_desks"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "cash_desk_user_links_cash_desk_id_link_role_idx" ON "cash_desk_user_links"("cash_desk_id", "link_role");

-- CreateIndex
CREATE INDEX "cash_desk_user_links_user_id_idx" ON "cash_desk_user_links"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "cash_desk_user_links_cash_desk_id_user_id_key" ON "cash_desk_user_links"("cash_desk_id", "user_id");

-- AddForeignKey
ALTER TABLE "cash_desks" ADD CONSTRAINT "cash_desks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_desk_user_links" ADD CONSTRAINT "cash_desk_user_links_cash_desk_id_fkey" FOREIGN KEY ("cash_desk_id") REFERENCES "cash_desks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_desk_user_links" ADD CONSTRAINT "cash_desk_user_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
