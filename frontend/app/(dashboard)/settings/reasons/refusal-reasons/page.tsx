import { GenericRefSettingsPage } from "@/components/settings/generic-ref-settings";

export default function RefusalReasonsSettingsPage() {
  return (
    <GenericRefSettingsPage
      config={{
        title: "Причины отказа",
        profileRefKey: "refusal_reason_entries",
        showColor: true,
      }}
    />
  );
}
