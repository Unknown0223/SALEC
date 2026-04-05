import { GenericRefSettingsPage } from "@/components/settings/generic-ref-settings";

export default function EquipmentTareSettingsPage() {
  return (
    <GenericRefSettingsPage
      config={{
        title: "Тара",
        profileRefKey: "equipment_tare_entries",
        showColor: true,
      }}
    />
  );
}
