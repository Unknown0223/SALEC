import { GenericRefSettingsPage } from "@/components/settings/generic-ref-settings";

export default function FinanceCategorySettingsPage() {
  return (
    <GenericRefSettingsPage
      config={{
        title: "Категория доходов/расходов",
        profileRefKey: "finance_category_entries",
        showColor: true,
      }}
    />
  );
}
