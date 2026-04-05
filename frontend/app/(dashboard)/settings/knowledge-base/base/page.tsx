import { GenericRefSettingsPage } from "@/components/settings/generic-ref-settings";

export default function KnowledgeBaseSettingsPage() {
  return (
    <GenericRefSettingsPage
      config={{
        title: "База знаний",
        profileRefKey: "knowledge_base_entries",
        showColor: true,
        showCode: true,
        showComment: true,
      }}
    />
  );
}
