import { BonusRulesListView } from "@/components/bonus-rules/bonus-rules-list-view";

export default function DiscountRulesInactivePage() {
  return <BonusRulesListView activeOnly={false} variant="discounts" />;
}
