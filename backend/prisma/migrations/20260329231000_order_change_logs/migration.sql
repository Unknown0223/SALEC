-- CreateTable
CREATE TABLE "order_change_logs" (
    "id" SERIAL NOT NULL,
    "order_id" INTEGER NOT NULL,
    "user_id" INTEGER,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_change_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_change_logs_order_id_idx" ON "order_change_logs"("order_id");

-- AddForeignKey
ALTER TABLE "order_change_logs" ADD CONSTRAINT "order_change_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "order_change_logs" ADD CONSTRAINT "order_change_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
