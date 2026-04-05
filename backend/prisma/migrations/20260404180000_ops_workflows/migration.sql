-- CreateTable
CREATE TABLE "cash_desk_shifts" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "cash_desk_id" INTEGER NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),
    "opened_by_user_id" INTEGER,
    "closed_by_user_id" INTEGER,
    "opening_float" DECIMAL(15,2),
    "closing_float" DECIMAL(15,2),
    "notes" TEXT,

    CONSTRAINT "cash_desk_shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_takes" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "title" VARCHAR(500),
    "notes" TEXT,
    "created_by_user_id" INTEGER,
    "posted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_takes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_take_lines" (
    "id" SERIAL NOT NULL,
    "stock_take_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "system_qty" DECIMAL(15,3) NOT NULL,
    "counted_qty" DECIMAL(15,3),

    CONSTRAINT "stock_take_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_visits" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "agent_id" INTEGER NOT NULL,
    "client_id" INTEGER,
    "checked_in_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_out_at" TIMESTAMP(3),
    "latitude" DECIMAL(11,8),
    "longitude" DECIMAL(11,8),
    "notes" TEXT,

    CONSTRAINT "agent_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_tasks" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'open',
    "priority" VARCHAR(16) NOT NULL DEFAULT 'normal',
    "due_at" TIMESTAMP(3),
    "assignee_user_id" INTEGER,
    "created_by_user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_route_days" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "agent_id" INTEGER NOT NULL,
    "route_date" TIMESTAMP(3) NOT NULL,
    "stops" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_route_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "in_app_notifications" (
    "id" SERIAL NOT NULL,
    "tenant_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "title" VARCHAR(500) NOT NULL,
    "body" TEXT,
    "link_href" VARCHAR(512),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "in_app_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_desk_shifts_tenant_id_cash_desk_id_idx" ON "cash_desk_shifts"("tenant_id", "cash_desk_id");

-- CreateIndex
CREATE INDEX "cash_desk_shifts_cash_desk_id_closed_at_idx" ON "cash_desk_shifts"("cash_desk_id", "closed_at");

-- CreateIndex
CREATE INDEX "stock_takes_tenant_id_warehouse_id_idx" ON "stock_takes"("tenant_id", "warehouse_id");

-- CreateIndex
CREATE INDEX "stock_takes_tenant_id_status_idx" ON "stock_takes"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "stock_take_lines_stock_take_id_idx" ON "stock_take_lines"("stock_take_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_take_lines_stock_take_id_product_id_key" ON "stock_take_lines"("stock_take_id", "product_id");

-- CreateIndex
CREATE INDEX "agent_visits_tenant_id_agent_id_idx" ON "agent_visits"("tenant_id", "agent_id");

-- CreateIndex
CREATE INDEX "agent_visits_tenant_id_checked_in_at_idx" ON "agent_visits"("tenant_id", "checked_in_at" DESC);

-- CreateIndex
CREATE INDEX "tenant_tasks_tenant_id_status_idx" ON "tenant_tasks"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "tenant_tasks_tenant_id_assignee_user_id_idx" ON "tenant_tasks"("tenant_id", "assignee_user_id");

-- CreateIndex
CREATE INDEX "agent_route_days_tenant_id_route_date_idx" ON "agent_route_days"("tenant_id", "route_date");

-- CreateIndex
CREATE UNIQUE INDEX "agent_route_days_tenant_id_agent_id_route_date_key" ON "agent_route_days"("tenant_id", "agent_id", "route_date");

-- CreateIndex
CREATE INDEX "in_app_notifications_tenant_id_user_id_read_at_idx" ON "in_app_notifications"("tenant_id", "user_id", "read_at");

-- AddForeignKey
ALTER TABLE "cash_desk_shifts" ADD CONSTRAINT "cash_desk_shifts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_desk_shifts" ADD CONSTRAINT "cash_desk_shifts_cash_desk_id_fkey" FOREIGN KEY ("cash_desk_id") REFERENCES "cash_desks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_desk_shifts" ADD CONSTRAINT "cash_desk_shifts_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_desk_shifts" ADD CONSTRAINT "cash_desk_shifts_closed_by_user_id_fkey" FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_takes" ADD CONSTRAINT "stock_takes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_takes" ADD CONSTRAINT "stock_takes_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_takes" ADD CONSTRAINT "stock_takes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_take_lines" ADD CONSTRAINT "stock_take_lines_stock_take_id_fkey" FOREIGN KEY ("stock_take_id") REFERENCES "stock_takes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_take_lines" ADD CONSTRAINT "stock_take_lines_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_visits" ADD CONSTRAINT "agent_visits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_visits" ADD CONSTRAINT "agent_visits_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_visits" ADD CONSTRAINT "agent_visits_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_tasks" ADD CONSTRAINT "tenant_tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_tasks" ADD CONSTRAINT "tenant_tasks_assignee_user_id_fkey" FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_tasks" ADD CONSTRAINT "tenant_tasks_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_route_days" ADD CONSTRAINT "agent_route_days_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_route_days" ADD CONSTRAINT "agent_route_days_agent_id_fkey" FOREIGN KEY ("agent_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "in_app_notifications" ADD CONSTRAINT "in_app_notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
