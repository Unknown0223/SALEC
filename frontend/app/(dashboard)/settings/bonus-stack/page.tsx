import { redirect } from "next/navigation";

/** Eski havola: strategiya endi bonus qoidalari ichida. */
export default function LegacyBonusStackPage() {
  redirect("/bonus-rules/strategy");
}
