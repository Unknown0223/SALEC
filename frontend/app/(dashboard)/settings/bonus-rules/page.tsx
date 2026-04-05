import { redirect } from "next/navigation";

export default function BonusRulesIndexPage() {
  redirect("/settings/bonus-rules/active");
}
