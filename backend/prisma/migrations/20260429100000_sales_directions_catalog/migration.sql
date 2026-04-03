-- Направления продаж: торговое направление, канал продаж, группы KPI

CREATE TABLE "trade_directions" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "code" VARCHAR(20),
    "comment" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "use_in_order_proposal" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trade_directions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sales_channel_refs" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" VARCHAR(20),
    "comment" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sales_channel_refs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kpi_groups" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" VARCHAR(20),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "comment" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kpi_groups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "kpi_group_products" (
    "kpi_group_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,

    CONSTRAINT "kpi_group_products_pkey" PRIMARY KEY ("kpi_group_id","product_id")
);

CREATE TABLE "kpi_group_agents" (
    "kpi_group_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,

    CONSTRAINT "kpi_group_agents_pkey" PRIMARY KEY ("kpi_group_id","user_id")
);

CREATE UNIQUE INDEX "trade_directions_tenant_id_code_key" ON "trade_directions"("tenant_id", "code");
CREATE UNIQUE INDEX "sales_channel_refs_tenant_id_code_key" ON "sales_channel_refs"("tenant_id", "code");

CREATE INDEX "trade_directions_tenant_id_is_active_idx" ON "trade_directions"("tenant_id", "is_active");
CREATE INDEX "sales_channel_refs_tenant_id_is_active_idx" ON "sales_channel_refs"("tenant_id", "is_active");
CREATE INDEX "kpi_groups_tenant_id_is_active_idx" ON "kpi_groups"("tenant_id", "is_active");
CREATE INDEX "kpi_group_products_product_id_idx" ON "kpi_group_products"("product_id");
CREATE INDEX "kpi_group_agents_user_id_idx" ON "kpi_group_agents"("user_id");

ALTER TABLE "trade_directions" ADD CONSTRAINT "trade_directions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sales_channel_refs" ADD CONSTRAINT "sales_channel_refs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kpi_groups" ADD CONSTRAINT "kpi_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kpi_group_products" ADD CONSTRAINT "kpi_group_products_kpi_group_id_fkey" FOREIGN KEY ("kpi_group_id") REFERENCES "kpi_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kpi_group_products" ADD CONSTRAINT "kpi_group_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "kpi_group_agents" ADD CONSTRAINT "kpi_group_agents_kpi_group_id_fkey" FOREIGN KEY ("kpi_group_id") REFERENCES "kpi_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kpi_group_agents" ADD CONSTRAINT "kpi_group_agents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
