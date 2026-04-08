"use client";

import { useLoaderPrefs } from "@/components/loader-prefs-provider";
import { SalecLoaderSpinner } from "@/components/ui/salec-loader-spinner";
import { loaderEmbeddedPaddingClass } from "@/lib/loader-prefs";
import { cn } from "@/lib/utils";

type Props = {
  /** Ildiz `app/loading.tsx`: to‘liq ekran, blur yo‘q */
  rootLayout?: boolean;
  className?: string;
};

/**
 * Next.js `loading.tsx` va `Suspense` uchun markazlashtirilgan fallback.
 * O‘lcham, matn va balandlik — «Настройки → Тема»dagi loader bo‘limidan.
 */
export function RouteLoadingFallback({ rootLayout, className }: Props) {
  const { prefs } = useLoaderPrefs();

  return (
    <div
      className={cn(
        "flex w-full flex-col items-center justify-center gap-6 px-6",
        rootLayout
          ? "min-h-dvh bg-background py-0 backdrop-blur-none"
          : /* AppShell: ota `flex flex-col` + bu yerda flex-1 → balandlik to‘ldi, markazda turadi */
            cn(
              "min-h-0 flex-1 bg-background/60 backdrop-blur-[2px]",
              loaderEmbeddedPaddingClass(prefs.heightMode)
            ),
        className
      )}
    >
      <SalecLoaderSpinner
        variant={prefs.variant}
        size={prefs.size}
        label={prefs.message}
        colorMode={prefs.colorMode}
        customColor={prefs.customColor}
      />
      {prefs.showMessage ? (
        <p className="text-center text-base font-medium tracking-tight text-foreground/80">{prefs.message}</p>
      ) : (
        <span className="sr-only">{prefs.message}</span>
      )}
    </div>
  );
}
