import { redirect } from "next/navigation";

export default function DiscountRulesIndexPage() {
  redirect("/settings/discount-rules/active");
}
