"use client";

import { ClientRefSettingsPage } from "@/components/settings/client-ref-settings-page";

export default function ClientCategoriesSettingsPage() {
  return (
    <ClientRefSettingsPage
      config={{
        title: "Категория клиента",
        profileRefKey: "client_category_entries",
        legacyKey: "client_categories",
        legacyIdPrefix: "cat",
        showColor: false
      }}
    />
  );
}
