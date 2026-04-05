-- Skidka summasi (alohida); bonus mahsulot qiymati `bonus_sum` da qoladi
ALTER TABLE "orders" ADD COLUMN "discount_sum" DECIMAL(15,2) NOT NULL DEFAULT 0;
