"use client";

import { useAppTheme } from "@/components/app-theme-provider";
import { cn } from "@/lib/utils";
import {
  APP_THEME_IDS,
  type AppThemeId,
  appThemeLabelsRu,
  appThemeSwatches
} from "@/lib/app-theme";
import { Check } from "lucide-react";

export function AppearanceSettingsWorkspace() {
  const { theme, setTheme } = useAppTheme();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Тема и цвета</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Выберите цветовую схему интерфейса. Настройка сохраняется в этом браузере.
        </p>
      </div>

      <section className="space-y-3" aria-labelledby="theme-picker-heading">
        <h2 id="theme-picker-heading" className="text-sm font-medium text-foreground">
          Выбор темы
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {APP_THEME_IDS.map((id) => (
            <ThemePreviewCard key={id} id={id} active={theme === id} onSelect={() => setTheme(id)} />
          ))}
        </div>
      </section>
    </div>
  );
}

function ThemePreviewCard({
  id,
  active,
  onSelect
}: {
  id: AppThemeId;
  active: boolean;
  onSelect: () => void;
}) {
  const sw = appThemeSwatches[id];
  const label = appThemeLabelsRu[id];

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex w-full flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all",
        "hover:border-primary/40 hover:shadow-md",
        active && "border-primary ring-2 ring-primary/25"
      )}
    >
      <div
        className="relative h-[88px] w-full shrink-0 border-b border-border/60 p-2"
        style={{ backgroundColor: sw.bg }}
      >
        <div className="flex h-full flex-col justify-between rounded-lg border border-black/10 bg-black/5 p-2 backdrop-blur-[2px]">
          <div className="flex items-start justify-between gap-2">
            <span className="h-2 w-16 max-w-[55%] rounded-full bg-white/90" />
            <span className="h-2 w-6 rounded-full bg-white/50" />
          </div>
          <div className="flex gap-1.5">
            <span className="h-6 flex-1 rounded-md" style={{ backgroundColor: sw.primary }} />
            <span
              className="h-6 w-12 rounded-md border-2 bg-transparent"
              style={{ borderColor: sw.muted }}
            />
          </div>
        </div>
        {active ? (
          <span
            className="absolute right-2 top-2 flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
            aria-hidden
          >
            <Check className="size-3.5" strokeWidth={2.5} />
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-3 py-2.5">
        <span className="text-[13px] font-medium leading-tight text-foreground">{label}</span>
        <span className="text-[11px] text-muted-foreground">
          {id === "classic"
            ? "Исходная палитра приложения"
            : "HEX + --dash-* → shadcn (theme-palettes.css)"}
        </span>
      </div>
    </button>
  );
}
