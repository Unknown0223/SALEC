"use client";

import { useAppTheme } from "@/components/app-theme-provider";
import { useLoaderPrefs } from "@/components/loader-prefs-provider";
import { Button } from "@/components/ui/button";
import { SalecLoaderSpinner } from "@/components/ui/salec-loader-spinner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  APP_THEME_IDS,
  type AppThemeId,
  appThemeLabelsRu,
  appThemeSwatches
} from "@/lib/app-theme";
import {
  DEFAULT_LOADER_PREFS,
  LOADER_HEIGHT_MODE_IDS,
  LOADER_VARIANT_IDS,
  type LoaderColorMode,
  type LoaderHeightMode,
  type LoaderVariant,
  loaderColorModeLabels,
  loaderHeightModeLabels,
  loaderVariantLabels
} from "@/lib/loader-prefs";
import { Check } from "lucide-react";

export function AppearanceSettingsWorkspace() {
  const { theme, setTheme } = useAppTheme();
  const { prefs, setPrefs, resetPrefs } = useLoaderPrefs();

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Тема и цвета</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Выберите цветовую схему интерфейса и вид индикатора загрузки. Настройки сохраняются в этом браузере.
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

      <section className="space-y-4" aria-labelledby="loader-prefs-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="loader-prefs-heading" className="text-sm font-medium text-foreground">
              Индикатор загрузки
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Параметры экрана ожидания при переходах и подгрузке разделов (как в маршрутах Next.js). Для варианта
              «Чип / схема» в режиме темы используются пять ярких цветов; в режиме своего цвета — оттенки от
              выбранного HEX.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => resetPrefs()}>
            Сбросить по умолчанию
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="space-y-2">
              <Label htmlFor="loader-variant">Вид анимации</Label>
              <Select
                value={prefs.variant}
                onValueChange={(v) => setPrefs({ variant: v as LoaderVariant })}
              >
                <SelectTrigger id="loader-variant" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOADER_VARIANT_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {loaderVariantLabels[id]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="loader-color-mode">Цвет</Label>
              <Select
                value={prefs.colorMode}
                onValueChange={(v) => setPrefs({ colorMode: v as LoaderColorMode })}
              >
                <SelectTrigger id="loader-color-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="theme">{loaderColorModeLabels.theme}</SelectItem>
                  <SelectItem value="custom">{loaderColorModeLabels.custom}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {prefs.colorMode === "custom" ? (
              <div className="flex flex-wrap items-center gap-3">
                <Label htmlFor="loader-custom-color" className="shrink-0">
                  Свой цвет
                </Label>
                <input
                  id="loader-custom-color"
                  type="color"
                  value={prefs.customColor}
                  onChange={(e) => setPrefs({ customColor: e.target.value })}
                  className="h-9 w-14 cursor-pointer rounded-md border border-input bg-background p-0.5"
                  aria-label="Цвет индикатора"
                />
                <Input
                  className="max-w-[8.5rem] font-mono text-xs"
                  value={prefs.customColor}
                  onChange={(e) => setPrefs({ customColor: e.target.value })}
                  placeholder={DEFAULT_LOADER_PREFS.customColor}
                  spellCheck={false}
                />
              </div>
            ) : null}

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="loader-size">Размер спиннера</Label>
                <span className="text-xs tabular-nums text-muted-foreground">{prefs.size}px</span>
              </div>
              <input
                id="loader-size"
                type="range"
                min={40}
                max={128}
                step={1}
                value={prefs.size}
                onChange={(e) => setPrefs({ size: Number(e.target.value) })}
                className="h-2 w-full cursor-pointer accent-primary"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="loader-show-msg"
                type="checkbox"
                checked={prefs.showMessage}
                onChange={(e) => setPrefs({ showMessage: e.target.checked })}
                className="size-4 rounded border-input accent-primary"
              />
              <Label htmlFor="loader-show-msg" className="font-normal leading-none">
                Показывать текст под спиннером
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="loader-message">Текст</Label>
              <Input
                id="loader-message"
                value={prefs.message}
                onChange={(e) => setPrefs({ message: e.target.value })}
                maxLength={120}
                placeholder={DEFAULT_LOADER_PREFS.message}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="loader-height">Отступы при загрузке (внутри панели)</Label>
              <Select
                value={prefs.heightMode}
                onValueChange={(v) => setPrefs({ heightMode: v as LoaderHeightMode })}
              >
                <SelectTrigger id="loader-height" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOADER_HEIGHT_MODE_IDS.map((id) => (
                    <SelectItem key={id} value={id}>
                      {loaderHeightModeLabels[id]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Индикатор в панели занимает всю область контента и центрируется; этот параметр меняет только
                вертикальные отступы. Корневой экран загрузки — на всю высоту окна.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-foreground">Предпросмотр</Label>
            <div
              className={cn(
                "flex min-h-[min(280px,42dvh)] w-full flex-col items-center justify-center gap-6 rounded-xl border border-dashed border-border bg-muted/25 px-6 py-10"
              )}
              aria-hidden
            >
              <SalecLoaderSpinner
                variant={prefs.variant}
                size={prefs.size}
                label={prefs.message}
                colorMode={prefs.colorMode}
                customColor={prefs.customColor}
              />
              {prefs.showMessage ? (
                <p className="text-center text-base font-medium tracking-tight text-foreground/80">
                  {prefs.message}
                </p>
              ) : null}
            </div>
          </div>
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
