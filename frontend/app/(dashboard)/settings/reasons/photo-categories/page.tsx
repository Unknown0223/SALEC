import { GenericRefSettingsPage } from "@/components/settings/generic-ref-settings";

export default function PhotoCategorySettingsPage() {
  return (
    <GenericRefSettingsPage
      config={{
        title: "Категория фотоотчёта",
        profileRefKey: "photo_category_entries",
        showColor: true,
      }}
    />
  );
}
