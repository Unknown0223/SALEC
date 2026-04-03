import { cn } from "@/lib/utils";

/**
 * Barcha ichki sahifalar uchun vertikal ritm.
 * Kenglik: asosan kontent maydoni bo‘ylab (`max-w-none`); tor sahifalar
 * `className="max-w-2xl"` / `max-w-6xl` kabi aniq cheklov bersin.
 */
export function PageShell({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-none space-y-6 pb-8", className)}>{children}</div>
  );
}
