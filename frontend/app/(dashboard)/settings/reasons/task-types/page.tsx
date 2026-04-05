import { GenericRefSettingsPage } from "@/components/settings/generic-ref-settings";

export default function TaskTypesSettingsPage() {
  return (
    <GenericRefSettingsPage
      config={{
        title: "Типы задач",
        profileRefKey: "task_type_entries",
        showColor: true,
      }}
    />
  );
}
