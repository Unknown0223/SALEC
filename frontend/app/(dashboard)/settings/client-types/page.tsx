"use client";

import { ClientRefSettingsPage } from "@/components/settings/client-ref-settings-page";

export default function ClientTypesSettingsPage() {
  return (
    <ClientRefSettingsPage
      config={{
        title: "Тип клиента",
        profileRefKey: "client_type_entries",
        legacyKey: "client_type_codes",
        legacyIdPrefix: "typ",
        showColor: true
      }}
    />
  );
}
