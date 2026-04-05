import { GenericRefSettingsPage } from "@/components/settings/generic-ref-settings";

export default function OrderNotesSettingsPage() {
  return (
    <GenericRefSettingsPage
      config={{
        title: "Примечание к заказу",
        profileRefKey: "order_note_entries",
        showColor: false,
        showCode: false,
      }}
    />
  );
}
