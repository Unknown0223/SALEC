import { GenericRefSettingsPage } from "@/components/settings/generic-ref-settings";

export default function EquipmentPrintersSettingsPage() {
  return (
    <GenericRefSettingsPage
      config={{
        title: "Принтеры",
        profileRefKey: "equipment_printer_entries",
        showColor: false,
        showComment: false,
      }}
    />
  );
}
