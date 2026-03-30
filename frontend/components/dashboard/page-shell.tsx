import { cn } from "@/lib/utils";

/**
 * Barcha ichki sahifalar uchun bir xil kenglik va vertikal ritm.
 */
export function PageShell({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl space-y-6 pb-8", className)}>{children}</div>
  );
}
