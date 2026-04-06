"use client";

import { Button } from "@/components/ui/button";
import { filterPanelSelectClassName } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import type { RefSelectOption } from "@/lib/ref-select-options";
import { Filter, ListOrdered, Search } from "lucide-react";

export type ClientsToolbarFilterVisibility = {
  category: boolean;
  region: boolean;
  city: boolean;
  clientType: boolean;
  clientFormat: boolean;
  salesChannel: boolean;
  agent: boolean;
  expeditor: boolean;
};

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  activeFilter: "all" | "true" | "false";
  onActiveFilterChange: (v: "all" | "true" | "false") => void;
  categoryFilter: string;
  onCategoryFilterChange: (v: string) => void;
  regionFilter: string;
  onRegionFilterChange: (v: string) => void;
  cityFilter: string;
  onCityFilterChange: (v: string) => void;
  clientTypeFilter: string;
  onClientTypeFilterChange: (v: string) => void;
  clientFormatFilter: string;
  onClientFormatFilterChange: (v: string) => void;
  salesChannelFilter: string;
  onSalesChannelFilterChange: (v: string) => void;
  agentFilter: string;
  onAgentFilterChange: (v: string) => void;
  expeditorFilter: string;
  onExpeditorFilterChange: (v: string) => void;
  onApplyToolbar?: () => void;
  categorySelectOptions: RefSelectOption[];
  regionSelectOptions: RefSelectOption[];
  citySelectOptions: RefSelectOption[];
  clientTypeSelectOptions: RefSelectOption[];
  clientFormatSelectOptions: RefSelectOption[];
  salesChannelSelectOptions: RefSelectOption[];
  agentOptions: Array<{ id: number; name: string; login: string }>;
  expeditorOptions: Array<{ id: number; name: string; login: string }>;
  /** Qaysi qo‘shimcha filtrlarni ko‘rsatish (spravochnikda qiymat bo‘lsa) */
  filterVisibility: ClientsToolbarFilterVisibility;
  pageLimit: number;
  onPageLimitChange: (v: number) => void;
  filtersVisible: boolean;
  onFiltersVisibleChange: (v: boolean) => void;
  onOpenColumnSettings: () => void;
};

export function ClientsTableToolbar({
  search,
  onSearchChange,
  activeFilter,
  onActiveFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  regionFilter,
  onRegionFilterChange,
  cityFilter,
  onCityFilterChange,
  clientTypeFilter,
  onClientTypeFilterChange,
  clientFormatFilter,
  onClientFormatFilterChange,
  salesChannelFilter,
  onSalesChannelFilterChange,
  agentFilter,
  onAgentFilterChange,
  expeditorFilter,
  onExpeditorFilterChange,
  onApplyToolbar,
  categorySelectOptions,
  regionSelectOptions,
  citySelectOptions,
  clientTypeSelectOptions,
  clientFormatSelectOptions,
  salesChannelSelectOptions,
  agentOptions,
  expeditorOptions,
  filterVisibility,
  pageLimit,
  onPageLimitChange,
  filtersVisible,
  onFiltersVisibleChange,
  onOpenColumnSettings
}: Props) {
  const fv = filterVisibility;

  return (
    <div className="flex flex-col gap-0">
      <div className="rounded-lg border-2 border-border bg-muted/40 px-3 py-3 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
          <div className="relative flex min-w-[200px] flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Поиск: наименование, телефон, ИНН, адрес…"
              className="h-10 border-2 pl-9 font-medium"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 font-semibold">
            <Button
              type="button"
              variant={filtersVisible ? "secondary" : "outline"}
              size="sm"
              className="gap-1 font-semibold"
              onClick={() => onFiltersVisibleChange(!filtersVisible)}
              title="Показать / скрыть фильтры"
            >
              <Filter className="h-4 w-4" />
              Фильтры
            </Button>

            <label className="flex items-center gap-1.5 text-sm text-foreground">
              <span className="whitespace-nowrap">Статус</span>
              <select
                className="h-9 min-w-[6.5rem] rounded-md border-2 border-input bg-background px-2 text-sm font-medium shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={activeFilter}
                onChange={(e) => onActiveFilterChange(e.target.value as "all" | "true" | "false")}
              >
                <option value="all">Все</option>
                <option value="true">Активен</option>
                <option value="false">Неактивен</option>
              </select>
            </label>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1 font-semibold"
              onClick={onOpenColumnSettings}
              title="Колонки (порядок и видимость)"
            >
              <ListOrdered className="h-4 w-4" />
              Колонки
            </Button>

            <label className="flex items-center gap-1 text-sm text-foreground">
              <span className="whitespace-nowrap">На стр.</span>
              <select
                className="h-9 min-w-[4.5rem] rounded-md border-2 border-input bg-background px-2 text-sm font-medium shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={pageLimit}
                onChange={(e) => onPageLimitChange(Number(e.target.value))}
              >
                {[10, 20, 30, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      {filtersVisible ? (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-dashed border-border/80 bg-muted/25 p-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {fv.category ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Категория
              <select
                className={filterPanelSelectClassName}
                value={categoryFilter}
                onChange={(e) => onCategoryFilterChange(e.target.value)}
              >
                <option value="">Все</option>
                {categorySelectOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {fv.region ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Территория (область)
              <select
                className={filterPanelSelectClassName}
                value={regionFilter}
                onChange={(e) => onRegionFilterChange(e.target.value)}
              >
                <option value="">Все</option>
                {regionSelectOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {fv.city ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Город (код в БД)
              <select
                className={filterPanelSelectClassName}
                value={cityFilter}
                onChange={(e) => onCityFilterChange(e.target.value)}
              >
                <option value="">Все</option>
                {citySelectOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {fv.clientType ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Тип клиента
              <select
                className={filterPanelSelectClassName}
                value={clientTypeFilter}
                onChange={(e) => onClientTypeFilterChange(e.target.value)}
              >
                <option value="">Все</option>
                {clientTypeSelectOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {fv.clientFormat ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Формат
              <select
                className={filterPanelSelectClassName}
                value={clientFormatFilter}
                onChange={(e) => onClientFormatFilterChange(e.target.value)}
              >
                <option value="">Все</option>
                {clientFormatSelectOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {fv.salesChannel ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Канал продаж
              <select
                className={filterPanelSelectClassName}
                value={salesChannelFilter}
                onChange={(e) => onSalesChannelFilterChange(e.target.value)}
              >
                <option value="">Все</option>
                {salesChannelSelectOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {fv.agent ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Агент (любой слот)
              <select
                className={filterPanelSelectClassName}
                value={agentFilter}
                onChange={(e) => onAgentFilterChange(e.target.value)}
              >
                <option value="">Все</option>
                {agentOptions.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {u.name} ({u.login})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {fv.expeditor ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Экспедитор
              <select
                className={filterPanelSelectClassName}
                value={expeditorFilter}
                onChange={(e) => onExpeditorFilterChange(e.target.value)}
              >
                <option value="">Все</option>
                {expeditorOptions.map((u) => (
                  <option key={`ex-${u.id}`} value={String(u.id)}>
                    {u.name} ({u.login})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <p className="col-span-full text-[11px] leading-snug text-muted-foreground">
            ИНН и телефон — через поле поиска. Сортировка — по заголовкам таблицы (↑↓). Пустые справочники
            скрыты.
          </p>
          <div className="col-span-full flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onApplyToolbar?.();
              }}
            >
              Применить и свернуть
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
