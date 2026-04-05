import { BonusRulesListView } from "@/components/bonus-rules/bonus-rules-list-view";

export default function BonusRulesInactivePage() {
  return <BonusRulesListView activeOnly={false} />;
}
