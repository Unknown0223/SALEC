-- Per-rule prerequisites: host rule applies only if listed rules match the same order (by type).
ALTER TABLE "bonus_rules" ADD COLUMN "prerequisite_rule_ids" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
