"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";

export type UserTableUiState = {
  columnOrder?: string[];
  hiddenColumnIds?: string[];
  pageSize?: number;
};

type UiRoot = { tables?: Record<string, UserTableUiState> };

const queryKey = (tenantSlug: string | null | undefined) => ["me", "ui-preferences", tenantSlug] as const;

export function useUserTablePrefs({
  tenantSlug,
  tableId,
  defaultColumnOrder,
  defaultPageSize = 10,
  allowedPageSizes = [10, 20, 25, 50, 100, 500, 1000],
  defaultHiddenColumnIds
}: {
  tenantSlug: string | null | undefined;
  tableId: string;
  defaultColumnOrder: readonly string[];
  defaultPageSize?: number;
  allowedPageSizes?: readonly number[];
  /** Serverda jadval prefs yo‘q yoki faqat pageSize bo‘lsa — boshlang‘ich yashirin ustunlar */
  defaultHiddenColumnIds?: readonly string[];
}) {
  const qc = useQueryClient();

  const prefsQ = useQuery({
    queryKey: queryKey(tenantSlug ?? null),
    enabled: Boolean(tenantSlug),
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<{ data: UiRoot }>(`/api/${tenantSlug}/me/ui-preferences`);
      return data.data;
    }
  });

  const patchMut = useMutation({
    mutationFn: async (patch: { tables: Record<string, UserTableUiState> }) => {
      const { data } = await api.patch<{ data: UiRoot }>(`/api/${tenantSlug}/me/ui-preferences`, patch);
      return data.data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKey(tenantSlug ?? null) });
    }
  });

  const saved = prefsQ.data?.tables?.[tableId];

  const hiddenColumnIds = useMemo(() => {
    if (saved === undefined) {
      return new Set(defaultHiddenColumnIds ?? []);
    }
    const hasColPrefs =
      Array.isArray(saved.hiddenColumnIds) ||
      (Array.isArray(saved.columnOrder) && saved.columnOrder.length > 0);
    if (hasColPrefs) {
      return new Set(saved.hiddenColumnIds ?? []);
    }
    return new Set(defaultHiddenColumnIds ?? []);
  }, [saved, defaultHiddenColumnIds]);

  const columnOrder = useMemo(() => {
    const raw = saved?.columnOrder;
    const base = [...defaultColumnOrder];
    if (!raw?.length) return base;
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const id of raw) {
      if (base.includes(id) && !seen.has(id)) {
        ordered.push(id);
        seen.add(id);
      }
    }
    for (const id of base) {
      if (!seen.has(id)) ordered.push(id);
    }
    return ordered;
  }, [saved?.columnOrder, defaultColumnOrder]);

  const pageSize = useMemo(() => {
    const ps = saved?.pageSize;
    if (ps != null && allowedPageSizes.includes(ps)) return ps;
    return allowedPageSizes.includes(defaultPageSize) ? defaultPageSize : allowedPageSizes[0]!;
  }, [saved?.pageSize, allowedPageSizes, defaultPageSize]);

  const visibleColumnOrder = useMemo(
    () => columnOrder.filter((id) => !hiddenColumnIds.has(id)),
    [columnOrder, hiddenColumnIds]
  );

  const persistTable = useCallback(
    (partial: UserTableUiState) => {
      if (!tenantSlug) return;
      patchMut.mutate({ tables: { [tableId]: partial } });
    },
    [tenantSlug, tableId, patchMut]
  );

  return {
    prefsLoading: prefsQ.isLoading,
    columnOrder,
    hiddenColumnIds,
    visibleColumnOrder,
    pageSize,
    setPageSize: (n: number) => {
      if (!allowedPageSizes.includes(n)) return;
      persistTable({ pageSize: n });
    },
    saveColumnLayout: (next: { columnOrder: string[]; hiddenColumnIds: string[] }) => {
      persistTable({ columnOrder: next.columnOrder, hiddenColumnIds: next.hiddenColumnIds });
    },
    resetColumnLayout: () => {
      persistTable({
        columnOrder: [...defaultColumnOrder],
        hiddenColumnIds: [...(defaultHiddenColumnIds ?? [])]
      });
    },
    saving: patchMut.isPending
  };
}
