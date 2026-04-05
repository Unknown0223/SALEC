import { GenericRefSettingsPage } from "@/components/settings/generic-ref-settings";

export default function InventoryTypeSettingsPage() {
  return (
    <GenericRefSettingsPage
      config={{
        title: "Тип инвентаря",
        profileRefKey: "inventory_type_entries",
        showColor: true,
      }}
    />
  );
}
