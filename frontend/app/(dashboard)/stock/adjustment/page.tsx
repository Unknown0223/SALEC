import { redirect } from "next/navigation";

/** Eski havola — to‘liq «Корректировка склада» moduliga yo‘naltiriladi. */
export default function StockAdjustmentRedirectPage() {
  redirect("/stock/correction");
}
