-- Bonus/discount: optional scope by branch (agent User.branch), explicit agents, trade direction (TradeDirection id).
-- Empty arrays = no restriction on that axis (existing behavior).

ALTER TABLE "bonus_rules" ADD COLUMN "scope_branch_codes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "bonus_rules" ADD COLUMN "scope_agent_user_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];

ALTER TABLE "bonus_rules" ADD COLUMN "scope_trade_direction_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
