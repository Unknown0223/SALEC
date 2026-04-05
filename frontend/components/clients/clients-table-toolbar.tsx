"use client";

import { Button } from "@/components/ui/button";
import { filterPanelSelectClassName } from "@/components/ui/filter-select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Filter, ListOrdered, Search } from "lucide-react";

type Props = {
  search: string;
  onSearchChange: (v: string) => void;
  activeFilter: "all" | "true" | "false";
  onActiveFilterChange: (v: "all" | "true" | "false") => void;
  categoryFilter: string;
  onCategoryFilterChange: (v: string) => void;
  regionFilter: string;
  onRegionFilterChange: (v: string) => void;
  districtFilter: string;
  onDistrictFilterChange: (v: string) => void;
  neighborhoodFilter: string;
  onNeighborhoodFilterChange: (v: string) => void;
  zoneFilter: string;
  onZoneFilterChange: (v: string) => void;
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
  supervisorFilter: string;
  onSupervisorFilterChange: (v: string) => void;
  visitWeekdayFilter: string;
  onVisitWeekdayFilterChange: (v: string) => void;
  innFilter: string;
  onInnFilterChange: (v: string) => void;
  phoneFilter: string;
  onPhoneFilterChange: (v: string) => void;
  createdFromFilter: string;
  onCreatedFromFilterChange: (v: string) => void;
  createdToFilter: string;
  onCreatedToFilterChange: (v: string) => void;
  onApplyToolbar?: () => void;
  categoryOptions: string[];
  regionOptions: string[];
  districtOptions: string[];
  neighborhoodOptions: string[];
  zoneOptions: string[];
  clientTypeOptions: string[];
  clientFormatOptions: string[];
  salesChannelOptions: string[];
  agentOptions: Array<{ id: number; name: string; login: string }>;
  expeditorOptions: Array<{ id: number; name: string; login: string }>;
  /** Faqat `role: supervisor` — klientlar filtri */
  supervisorOptions: Array<{ id: number; name: string; login: string }>;
  sortField: "name" | "phone" | "id" | "created_at" | "region";
  onSortFieldChange: (v: "name" | "phone" | "id" | "created_at" | "region") => void;
  sortOrder: "asc" | "desc";
  onSortOrderChange: (v: "asc" | "desc") => void;
  pageLimit: number;
  onPageLimitChange: (v: number) => void;
  filtersVisible: boolean;
  onFiltersVisibleChange: (v: boolean) => void;
  /** Ustunlar — serverdagi `ui_preferences` dialogi */
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
  districtFilter,
  onDistrictFilterChange,
  neighborhoodFilter,
  onNeighborhoodFilterChange,
  zoneFilter,
  onZoneFilterChange,
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
  supervisorFilter,
  onSupervisorFilterChange,
  visitWeekdayFilter,
  onVisitWeekdayFilterChange,
  innFilter,
  onInnFilterChange,
  phoneFilter,
  onPhoneFilterChange,
  createdFromFilter,
  onCreatedFromFilterChange,
  createdToFilter,
  onCreatedToFilterChange,
  onApplyToolbar,
  categoryOptions,
  regionOptions,
  districtOptions,
  neighborhoodOptions,
  zoneOptions,
  clientTypeOptions,
  clientFormatOptions,
  salesChannelOptions,
  agentOptions,
  expeditorOptions,
  supervisorOptions,
  sortField,
  onSortFieldChange,
  sortOrder,
  onSortOrderChange,
  pageLimit,
  onPageLimitChange,
  filtersVisible,
  onFiltersVisibleChange,
  onOpenColumnSettings
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex min-w-[200px] flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Qidiruv (ism, telefon, INN, viloyat…)"
            className="h-10 pl-9"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            variant={filtersVisible ? "secondary" : "outline"}
            size="sm"
            className="gap-1"
            onClick={() => onFiltersVisibleChange(!filtersVisible)}
            title="Filtrlarni ko‘rsatish / yashirish"
          >
            <Filter className="h-4 w-4" />
            Filtr
          </Button>

          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="whitespace-nowrap">Holat</span>
            <select
              className="h-9 min-w-[6.5rem] rounded-md border border-input bg-background px-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={activeFilter}
              onChange={(e) => onActiveFilterChange(e.target.value as "all" | "true" | "false")}
            >
              <option value="all">Hammasi</option>
              <option value="true">Faol</option>
              <option value="false">Nofaol</option>
            </select>
          </label>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1"
            onClick={onOpenColumnSettings}
            title="Ustunlar (tartib va ko‘rinish — akkaunt bo‘yicha saqlanadi)"
          >
            <ListOrdered className="h-4 w-4" />
            Ustunlar
          </Button>

          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="whitespace-nowrap">Sahifa</span>
            <select
              className="h-9 min-w-[4.5rem] rounded-md border border-input bg-background px-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

      {filtersVisible ? (
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed bg-muted/30 p-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Holat
            <select
              className={filterPanelSelectClassName}
              value={activeFilter}
              onChange={(e) => onActiveFilterChange(e.target.value as "all" | "true" | "false")}
            >
              <option value="all">Hammasi</option>
              <option value="true">Faol</option>
              <option value="false">Nofaol</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Yaratilgan (dan)
            <Input
              type="date"
              className="h-10"
              value={createdFromFilter}
              onChange={(e) => onCreatedFromFilterChange(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Yaratilgan (gacha)
            <Input
              type="date"
              className="h-10"
              value={createdToFilter}
              onChange={(e) => onCreatedToFilterChange(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Toifa (category)
            <select
              className={filterPanelSelectClassName}
              value={categoryFilter}
              onChange={(e) => onCategoryFilterChange(e.target.value)}
            >
              <option value="">Toifa (category)</option>
              {categoryOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Viloyat
            <select
              className={filterPanelSelectClassName}
              value={regionFilter}
              onChange={(e) => onRegionFilterChange(e.target.value)}
            >
              <option value="">Viloyat</option>
              {regionOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Tuman
            <select
              className={filterPanelSelectClassName}
              value={districtFilter}
              onChange={(e) => onDistrictFilterChange(e.target.value)}
            >
              <option value="">Tuman</option>
              {districtOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Mahalla
            <select
              className={filterPanelSelectClassName}
              value={neighborhoodFilter}
              onChange={(e) => onNeighborhoodFilterChange(e.target.value)}
            >
              <option value="">Mahalla</option>
              {neighborhoodOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Zona
            <select
              className={filterPanelSelectClassName}
              value={zoneFilter}
              onChange={(e) => onZoneFilterChange(e.target.value)}
            >
              <option value="">Zona</option>
              {zoneOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Mijoz turi
            <select
              className={filterPanelSelectClassName}
              value={clientTypeFilter}
              onChange={(e) => onClientTypeFilterChange(e.target.value)}
            >
              <option value="">Mijoz turi</option>
              {clientTypeOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Format
            <select
              className={filterPanelSelectClassName}
              value={clientFormatFilter}
              onChange={(e) => onClientFormatFilterChange(e.target.value)}
            >
              <option value="">Format</option>
              {clientFormatOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Savdo kanali
            <select
              className={filterPanelSelectClassName}
              value={salesChannelFilter}
              onChange={(e) => onSalesChannelFilterChange(e.target.value)}
            >
              <option value="">Savdo kanali</option>
              {salesChannelOptions.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Agent (istalgan qator)
            <select
              className={filterPanelSelectClassName}
              value={agentFilter}
              onChange={(e) => onAgentFilterChange(e.target.value)}
            >
              <option value="">Agent</option>
              {agentOptions.map((u) => (
                <option key={u.id} value={String(u.id)}>
                  {u.name} ({u.login})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Dastavchik / ekspeditor
            <select
              className={filterPanelSelectClassName}
              value={expeditorFilter}
              onChange={(e) => onExpeditorFilterChange(e.target.value)}
            >
              <option value="">Dastavchik / ekspeditor</option>
              {expeditorOptions.map((u) => (
                <option key={`ex-${u.id}`} value={String(u.id)}>
                  {u.name} ({u.login})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Supervizor
            <select
              className={filterPanelSelectClassName}
              value={supervisorFilter}
              onChange={(e) => onSupervisorFilterChange(e.target.value)}
            >
              <option value="">Supervizor</option>
              {supervisorOptions.map((u) => (
                <option key={`sv-${u.id}`} value={String(u.id)}>
                  {u.name} ({u.login})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Tashrif kuni (hafta)
            <select
              className={filterPanelSelectClassName}
              value={visitWeekdayFilter}
              onChange={(e) => onVisitWeekdayFilterChange(e.target.value)}
            >
              <option value="">Tashrif kuni (hafta)</option>
              <option value="1">Du</option>
              <option value="2">Se</option>
              <option value="3">Ch</option>
              <option value="4">Pa</option>
              <option value="5">Ju</option>
              <option value="6">Sh</option>
              <option value="7">Ya</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            INN (qismiy)
            <Input
              className="h-10"
              value={innFilter}
              onChange={(e) => onInnFilterChange(e.target.value)}
              placeholder="STIR"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Telefon (qismiy)
            <Input
              className="h-10"
              value={phoneFilter}
              onChange={(e) => onPhoneFilterChange(e.target.value)}
              placeholder="Raqam bo‘yicha"
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1 text-xs text-muted-foreground lg:col-span-2">
            <span className="flex items-center gap-1">
              <ListOrdered className="h-3.5 w-3.5" />
              Tartib
            </span>
            <div className="flex flex-wrap gap-1">
              <select
                className={cn(filterPanelSelectClassName, "min-w-0 max-w-[12rem]")}
                value={sortField}
                onChange={(e) =>
                  onSortFieldChange(e.target.value as "name" | "phone" | "id" | "created_at" | "region")
                }
              >
                <option value="name">Nomi</option>
                <option value="phone">Telefon</option>
                <option value="id">ID</option>
                <option value="created_at">Yaratilgan</option>
                <option value="region">Viloyat</option>
              </select>
              <select
                className={cn(filterPanelSelectClassName, "min-w-0 max-w-[10rem]")}
                value={sortOrder}
                onChange={(e) => onSortOrderChange(e.target.value as "asc" | "desc")}
              >
                <option value="asc">O‘sish</option>
                <option value="desc">Kamayish</option>
              </select>
            </div>
          </label>
          <div className="col-span-full flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onApplyToolbar?.();
              }}
            >
              Qo‘llash
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
