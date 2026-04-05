import { GenericRefSettingsPage } from "@/components/settings/generic-ref-settings";

export default function PayrollAdjustmentsSettingsPage() {
  return (
    <GenericRefSettingsPage
      config={{
        title: "Надбавки и вычеты к зарплате",
        profileRefKey: "payroll_adjustment_entries",
        showColor: true,
        showComment: true,
      }}
    />
  );
}
