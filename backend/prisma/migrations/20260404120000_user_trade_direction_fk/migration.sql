-- AlterTable
ALTER TABLE "users" ADD COLUMN "trade_direction_id" INTEGER;

-- CreateIndex
CREATE INDEX "users_trade_direction_id_idx" ON "users"("trade_direction_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_trade_direction_id_fkey" FOREIGN KEY ("trade_direction_id") REFERENCES "trade_directions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
