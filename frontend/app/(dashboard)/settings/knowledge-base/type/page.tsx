import { GenericRefSettingsPage } from "@/components/settings/generic-ref-settings";

export default function KnowledgeTypeSettingsPage() {
  return (
    <GenericRefSettingsPage
      config={{
        title: "Тип базы знания",
        profileRefKey: "kb_type_entries",
        showColor: false,
      }}
    />
  );
}
