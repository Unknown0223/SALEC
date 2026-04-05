import { cn } from "@/lib/utils";

/**
 * Barcha ichki sahifalar uchun vertikal ritm.
 * Kenglik: to’liq kenglikda (`max-w-none`), table’lar scrollbar bilan.
 */
export function PageShell({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-none space-y-5 pb-10", className)}>{children}</div>
  );
}
