import { GenericRefSettingsPage } from "@/components/settings/generic-ref-settings";

export default function CancelPaymentReasonsSettingsPage() {
  return (
    <GenericRefSettingsPage
      config={{
        title: "Причины отмены оплаты",
        profileRefKey: "cancel_payment_reason_entries",
        showColor: false,
      }}
    />
  );
}
