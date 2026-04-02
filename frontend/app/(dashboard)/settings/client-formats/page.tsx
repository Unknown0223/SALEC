"use client";

import { ClientRefSettingsPage } from "@/components/settings/client-ref-settings-page";

export default function ClientFormatsSettingsPage() {
  return (
    <ClientRefSettingsPage
      config={{
        title: "Формат клиента",
        profileRefKey: "client_format_entries",
        legacyKey: "client_formats",
        legacyIdPrefix: "fmt",
        showColor: false
      }}
    />
  );
}
