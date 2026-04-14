"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { filterPanelSelectClassName } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { formatNumberGrouped } from "@/lib/format-numbers";
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

type FiltersProps = {
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
  filterVisibility: ClientsToolbarFilterVisibility;
  filtersVisible: boolean;
  onFiltersVisibleChange: (v: boolean) => void;
};

export type ClientsTableListToolbarStripProps = {
  search: string;
  onSearchChange: (v: string) => void;
  pageLimit: number;
  onPageLimitChange: (v: number) => void;
  onOpenColumnSettings: () => void;
  /** Jadval kartochkasi ichida — pastki border bilan ajratiladi */
  totalRecords?: number;
};

export function ClientsTableFilters({
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
  filtersVisible,
  onFiltersVisibleChange
}: FiltersProps) {
  const fv = filterVisibility;

  return (
    <div className="orders-hub-section orders-hub-section--filters orders-hub-section--stack-tight">
      <Card className="rounded-none border-0 bg-transparent shadow-none hover:shadow-none">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 font-semibold text-foreground">
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

            <label className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <span className="whitespace-nowrap">Статус</span>
              <select
                className="h-9 min-w-[6.5rem] rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={activeFilter}
                onChange={(e) => onActiveFilterChange(e.target.value as "all" | "true" | "false")}
              >
                <option value="all">Все</option>
                <option value="true">Активен</option>
                <option value="false">Неактивен</option>
              </select>
            </label>
          </div>

          {filtersVisible ? (
            <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-4 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {fv.category ? (
                <label className="orders-filter-field-label">
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
                <label className="orders-filter-field-label">
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
                <label className="orders-filter-field-label">
                  Город
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
                <label className="orders-filter-field-label">
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
                <label className="orders-filter-field-label">
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
                <label className="orders-filter-field-label">
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
                <label className="orders-filter-field-label">
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
                <label className="orders-filter-field-label">
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
              <p className="col-span-full text-[11px] leading-snug text-foreground/72">
                ИНН и телефон — через поле поиска. Сортировка — по заголовкам таблицы (↑↓). Пустые
                справочники скрыты.
              </p>
              <div className="col-span-full flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
                <Button
                  type="button"
                  size="sm"
                  className="bg-teal-700 text-white hover:bg-teal-800"
                  onClick={() => {
                    onApplyToolbar?.();
                  }}
                >
                  Применить и свернуть
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export function ClientsTableListToolbarStrip({
  search,
  onSearchChange,
  pageLimit,
  onPageLimitChange,
  onOpenColumnSettings,
  totalRecords
}: ClientsTableListToolbarStripProps) {
  return (
    <div
      className="table-toolbar orders-hub-section--toolbar flex flex-wrap items-end gap-2 border-b border-border/80 bg-muted/30 px-3 py-2 sm:px-4"
      role="toolbar"
      aria-label="Таблица: поиск и колонки"
    >
      <label className="grid shrink-0 gap-1 text-xs font-medium text-foreground/85">
        <span className="whitespace-nowrap leading-none">На стр.</span>
        <select
          className="h-9 min-w-[4.5rem] rounded-md border border-input bg-background px-2 text-sm font-medium text-foreground shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
      <div className="relative flex min-w-[200px] flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Поиск: наименование, телефон, ИНН, адрес…"
          className="h-9 border pl-9 font-medium text-foreground"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 shrink-0 gap-1 font-semibold"
        onClick={onOpenColumnSettings}
        title="Колонки (порядок и видимость)"
      >
        <ListOrdered className="h-4 w-4" />
        Колонки
      </Button>
      {totalRecords != null ? (
        <span className="ml-auto self-end pb-0.5 text-sm text-foreground/80">
          Всего записей:{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {formatNumberGrouped(totalRecords, { maxFractionDigits: 0 })}
          </span>
        </span>
      ) : null}
    </div>
  );
}
