import { GenericRefSettingsPage } from "@/components/settings/generic-ref-settings";

export default function RequestTypesSettingsPage() {
  return (
    <GenericRefSettingsPage
      config={{
        title: "Причины заявок",
        profileRefKey: "request_type_entries",
        showColor: false,
      }}
    />
  );
}
