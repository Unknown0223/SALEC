"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  CLIENT_TABLE_COLUMNS,
  getDefaultColumnVisibility,
  saveColumnVisibility
} from "@/lib/client-table-columns";
import { Filter, LayoutGrid, ListOrdered, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

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
  columnVisibility: Record<string, boolean>;
  onColumnVisibilityChange: (v: Record<string, boolean>) => void;
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
  columnVisibility,
  onColumnVisibilityChange
}: Props) {
  const [colMenuOpen, setColMenuOpen] = useState(false);
  const [colSearch, setColSearch] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setColMenuOpen(false);
    }
    if (colMenuOpen) document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [colMenuOpen]);

  const filteredCols = useMemo(() => {
    const q = colSearch.trim().toLowerCase();
    if (!q) return CLIENT_TABLE_COLUMNS;
    return CLIENT_TABLE_COLUMNS.filter((c) => c.label.toLowerCase().includes(q));
  }, [colSearch]);

  const selectAllVisible = () => {
    const next = { ...columnVisibility };
    for (const c of filteredCols) {
      next[c.id] = true;
    }
    onColumnVisibilityChange(next);
    saveColumnVisibility(next);
  };

  const clearAllVisible = () => {
    const next = { ...columnVisibility };
    for (const c of filteredCols) {
      next[c.id] = false;
    }
    onColumnVisibilityChange(next);
    saveColumnVisibility(next);
  };

  const resetDefaults = () => {
    const d = getDefaultColumnVisibility();
    onColumnVisibilityChange(d);
    saveColumnVisibility(d);
  };

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

          <div className="relative" ref={menuRef}>
            <Button
              type="button"
              variant={colMenuOpen ? "secondary" : "outline"}
              size="sm"
              className="gap-1"
              onClick={() => setColMenuOpen((o) => !o)}
              title="Ustunlar"
            >
              <LayoutGrid className="h-4 w-4" />
              Ustunlar
            </Button>
            {colMenuOpen ? (
              <div className="absolute right-0 z-50 mt-1 w-72 rounded-lg border bg-popover p-2 shadow-lg">
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Qidiruv"
                    className="h-8 pl-7 text-xs"
                    value={colSearch}
                    onChange={(e) => setColSearch(e.target.value)}
                  />
                </div>
                <div className="mb-2 flex flex-wrap gap-1">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={selectAllVisible}>
                    Barchasini tanlash
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={clearAllVisible}>
                    Tozalash
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={resetDefaults}>
                    Standart
                  </Button>
                </div>
                <div className="max-h-64 space-y-1 overflow-y-auto pr-1 text-xs">
                  {filteredCols.map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-muted/80"
                    >
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-input accent-primary"
                        checked={columnVisibility[c.id] === true}
                        onChange={() => {
                          const next = { ...columnVisibility, [c.id]: !columnVisibility[c.id] };
                          onColumnVisibilityChange(next);
                          saveColumnVisibility(next);
                        }}
                      />
                      <span className="leading-tight">{c.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className="whitespace-nowrap">Sahifa</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={pageLimit}
              onChange={(e) => onPageLimitChange(Number(e.target.value))}
            >
              {[10, 30, 50, 100].map((n) => (
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
              className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
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
              className="h-10 w-44 rounded-lg border border-input bg-background px-2 text-sm"
              value={categoryFilter}
              onChange={(e) => onCategoryFilterChange(e.target.value)}
            >
              <option value="">Barchasi</option>
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
              className="h-10 w-44 rounded-lg border border-input bg-background px-2 text-sm"
              value={regionFilter}
              onChange={(e) => onRegionFilterChange(e.target.value)}
            >
              <option value="">Barchasi</option>
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
              className="h-10 w-44 rounded-lg border border-input bg-background px-2 text-sm"
              value={districtFilter}
              onChange={(e) => onDistrictFilterChange(e.target.value)}
            >
              <option value="">Barchasi</option>
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
              className="h-10 w-44 rounded-lg border border-input bg-background px-2 text-sm"
              value={neighborhoodFilter}
              onChange={(e) => onNeighborhoodFilterChange(e.target.value)}
            >
              <option value="">Barchasi</option>
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
              className="h-10 w-44 rounded-lg border border-input bg-background px-2 text-sm"
              value={zoneFilter}
              onChange={(e) => onZoneFilterChange(e.target.value)}
            >
              <option value="">Barchasi</option>
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
              className="h-10 w-44 rounded-lg border border-input bg-background px-2 text-sm"
              value={clientTypeFilter}
              onChange={(e) => onClientTypeFilterChange(e.target.value)}
            >
              <option value="">Barchasi</option>
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
              className="h-10 w-44 rounded-lg border border-input bg-background px-2 text-sm"
              value={clientFormatFilter}
              onChange={(e) => onClientFormatFilterChange(e.target.value)}
            >
              <option value="">Barchasi</option>
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
              className="h-10 w-44 rounded-lg border border-input bg-background px-2 text-sm"
              value={salesChannelFilter}
              onChange={(e) => onSalesChannelFilterChange(e.target.value)}
            >
              <option value="">Barchasi</option>
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
              className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm"
              value={agentFilter}
              onChange={(e) => onAgentFilterChange(e.target.value)}
            >
              <option value="">Barchasi</option>
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
              className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm"
              value={expeditorFilter}
              onChange={(e) => onExpeditorFilterChange(e.target.value)}
            >
              <option value="">Barchasi</option>
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
              className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm"
              value={supervisorFilter}
              onChange={(e) => onSupervisorFilterChange(e.target.value)}
            >
              <option value="">Barchasi</option>
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
              className="h-10 w-full min-w-0 rounded-lg border border-input bg-background px-2 text-sm"
              value={visitWeekdayFilter}
              onChange={(e) => onVisitWeekdayFilterChange(e.target.value)}
            >
              <option value="">Barchasi</option>
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
                className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
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
                className="h-10 rounded-lg border border-input bg-background px-2 text-sm"
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
