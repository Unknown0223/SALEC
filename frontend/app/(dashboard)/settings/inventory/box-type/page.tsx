import { GenericRefSettingsPage } from "@/components/settings/generic-ref-settings";

export default function BoxTypeSettingsPage() {
  return (
    <GenericRefSettingsPage
      config={{
        title: "Тип коробки",
        profileRefKey: "box_type_entries",
        showColor: true,
      }}
    />
  );
}
