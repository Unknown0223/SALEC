"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";

import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type ProductCategoryRow = {
  id: number;
  name: string;
  parent_id: number | null;
  sort_order: number | null;
};

type ProductRow = {
  id: number;
  sku: string;
  name: string;
  category_id: number | null;
};

type TreeNode = ProductCategoryRow & { children: TreeNode[] };

const UNCATEGORIZED_KEY = "__uncategorized__" as const;

const checkboxCls = "mt-0.5 h-4 w-4 shrink-0 rounded border border-input accent-primary";

function nestCategories(flat: ProductCategoryRow[]): TreeNode[] {
  const map = new Map<number, TreeNode>();
  for (const c of flat) {
    map.set(c.id, { ...c, children: [] });
  }
  const roots: TreeNode[] = [];
  for (const c of flat) {
    const node = map.get(c.id)!;
    if (c.parent_id != null && map.has(c.parent_id)) {
      map.get(c.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      const so = (a.sort_order ?? 1e6) - (b.sort_order ?? 1e6);
      if (so !== 0) return so;
      return a.name.localeCompare(b.name, "uz");
    });
    for (const n of nodes) sortRec(n.children);
  };
  sortRec(roots);
  return roots;
}

async function fetchAllProductsPage(tenantSlug: string, params: URLSearchParams): Promise<ProductRow[]> {
  const out: ProductRow[] = [];
  let page = 1;
  const limit = 100;
  for (;;) {
    params.set("page", String(page));
    params.set("limit", String(limit));
    const { data } = await api.get<{ data: ProductRow[]; total: number }>(
      `/api/${tenantSlug}/products?${params.toString()}`
    );
    out.push(...data.data);
    if (out.length >= data.total || data.data.length === 0) break;
    page += 1;
  }
  return out;
}

function SelectAllCheckbox({
  inputId,
  allSelected,
  someSelected,
  onChange,
  disabled
}: {
  inputId: string;
  allSelected: boolean;
  someSelected: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.indeterminate = someSelected;
  }, [someSelected]);
  return (
    <input
      ref={ref}
      id={inputId}
      type="checkbox"
      className={checkboxCls}
      checked={allSelected}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

type CategoryProductsPanelProps = {
  tenantSlug: string;
  categoryKey: number | typeof UNCATEGORIZED_KEY;
  selected: Set<number>;
  onToggleProduct: (id: number, checked: boolean) => void;
  depth: number;
  disabled?: boolean;
};

function CategoryProductsPanel({
  tenantSlug,
  categoryKey,
  selected,
  onToggleProduct,
  depth,
  disabled
}: CategoryProductsPanelProps) {
  const q = useQuery({
    queryKey: ["bonus-rule-scope-products", tenantSlug, categoryKey],
    queryFn: async () => {
      const p = new URLSearchParams({ is_active: "true" });
      if (categoryKey === UNCATEGORIZED_KEY) {
        p.set("uncategorized", "true");
      } else {
        p.set("category_id", String(categoryKey));
      }
      return fetchAllProductsPage(tenantSlug, p);
    },
    staleTime: STALE.list,
    enabled: Boolean(tenantSlug)
  });

  const ids = useMemo(() => q.data?.map((x) => x.id) ?? [], [q.data]);
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  const someSelected = ids.some((id) => selected.has(id)) && !allSelected;

  const toggleAll = (checked: boolean) => {
    for (const id of ids) onToggleProduct(id, checked);
  };

  if (q.isLoading) {
    return (
      <div className={cn("py-2 text-sm text-muted-foreground", depth > 0 && "pl-6")}>Yuklanmoqda…</div>
    );
  }
  if (q.isError) {
    return (
      <div className={cn("py-2 text-sm text-destructive", depth > 0 && "pl-6")}>Mahsulotlarni yuklab bo‘lmadi.</div>
    );
  }
  if (!q.data?.length) {
    return (
      <div className={cn("py-2 text-sm text-muted-foreground", depth > 0 && "pl-6")}>
        Bu kategoriyada mahsulot yo‘q.
      </div>
    );
  }

  return (
    <div className={cn("space-y-1 border-l border-border/60 py-1", depth > 0 && "ml-3 pl-3")}>
      <div className="flex items-center gap-2 py-1">
        <SelectAllCheckbox
          inputId={`br-cat-all-${String(categoryKey)}`}
          allSelected={allSelected}
          someSelected={someSelected}
          onChange={toggleAll}
          disabled={disabled}
        />
        <Label htmlFor={`br-cat-all-${String(categoryKey)}`} className="text-xs text-muted-foreground cursor-pointer">
          Barchasini tanlash ({q.data.length})
        </Label>
      </div>
      <ul className="space-y-1 max-h-56 overflow-y-auto pr-1">
        {q.data.map((p) => (
          <li key={p.id} className="flex items-start gap-2 rounded-md px-1 py-0.5 hover:bg-muted/50">
            <input
              id={`br-prod-${p.id}`}
              type="checkbox"
              className={checkboxCls}
              checked={selected.has(p.id)}
              disabled={disabled}
              onChange={(e) => onToggleProduct(p.id, e.target.checked)}
            />
            <Label htmlFor={`br-prod-${p.id}`} className="text-sm font-normal leading-tight cursor-pointer flex-1">
              <span className="text-muted-foreground font-mono text-xs">{p.sku}</span>
              <span className="mx-1">—</span>
              {p.name}
            </Label>
          </li>
        ))}
      </ul>
    </div>
  );
}

type CategoryNodeProps = {
  tenantSlug: string;
  node: TreeNode;
  depth: number;
  selected: Set<number>;
  onToggleProduct: (id: number, checked: boolean) => void;
  expanded: Set<number>;
  toggleExpanded: (id: number) => void;
  disabled?: boolean;
};

function CategoryNode({
  tenantSlug,
  node,
  depth,
  selected,
  onToggleProduct,
  expanded,
  toggleExpanded,
  disabled
}: CategoryNodeProps) {
  const isOpen = expanded.has(node.id);

  return (
    <div className={cn(depth > 0 && "ml-2 border-l border-border/40 pl-2")}>
      <div className="flex items-center gap-1 py-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => toggleExpanded(node.id)}
          aria-expanded={isOpen}
          disabled={disabled}
        >
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </Button>
        <button
          type="button"
          className="text-left text-sm font-medium hover:underline flex-1 min-w-0 truncate disabled:opacity-50"
          onClick={() => toggleExpanded(node.id)}
          disabled={disabled}
        >
          {node.name}
        </button>
      </div>
      {isOpen ? (
        <div className="pb-2">
          {node.children.length > 0 ? (
            <div className="mt-1 space-y-1">
              {node.children.map((ch) => (
                <CategoryNode
                  key={ch.id}
                  tenantSlug={tenantSlug}
                  node={ch}
                  depth={depth + 1}
                  selected={selected}
                  onToggleProduct={onToggleProduct}
                  expanded={expanded}
                  toggleExpanded={toggleExpanded}
                  disabled={disabled}
                />
              ))}
            </div>
          ) : null}
          <div className={node.children.length > 0 ? "mt-2" : ""}>
            <CategoryProductsPanel
              tenantSlug={tenantSlug}
              categoryKey={node.id}
              selected={selected}
              onToggleProduct={onToggleProduct}
              depth={depth + 1}
              disabled={disabled}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export type BonusRuleProductScopePickerProps = {
  tenantSlug: string;
  value: number[];
  onChange: (productIds: number[]) => void;
  /** Tanlangan mahsulotlar bilan qamrov — `product_category_ids` AND bo‘lmasin */
  onClearCategoryScope?: () => void;
  disabled?: boolean;
};

export function BonusRuleProductScopePicker({
  tenantSlug,
  value,
  onChange,
  onClearCategoryScope,
  disabled
}: BonusRuleProductScopePickerProps) {
  const selected = useMemo(() => new Set(value), [value]);
  const [expandedCats, setExpandedCats] = useState<Set<number>>(new Set());
  const [uncOpen, setUncOpen] = useState(false);

  const catsQ = useQuery({
    queryKey: ["product-categories", tenantSlug, "bonus-rule-picker"],
    queryFn: async () => {
      const { data } = await api.get<{ data: ProductCategoryRow[] }>(`/api/${tenantSlug}/product-categories`);
      return data.data;
    },
    staleTime: STALE.reference,
    enabled: Boolean(tenantSlug)
  });

  const tree = useMemo(() => nestCategories(catsQ.data ?? []), [catsQ.data]);

  const toggleExpanded = (id: number) => {
    setExpandedCats((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const onToggleProduct = (id: number, checked: boolean) => {
    onClearCategoryScope?.();
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onChange(Array.from(next).sort((a, b) => a - b));
  };

  const clearAll = () => {
    onChange([]);
  };

  if (!tenantSlug) return null;

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Kategoriyani oching va mahsulotlarni belgilang. Bonus faqat tanlangan mahsulotlar qatorida hisoblanadi (
          <span className="font-mono text-xs">product_ids</span>).
        </p>
        <Button type="button" variant="outline" size="sm" onClick={clearAll} disabled={disabled || value.length === 0}>
          Tanlovni tozalash
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Tanlangan: <span className="font-medium text-foreground">{value.length}</span> ta mahsulot
      </p>

      {catsQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Kategoriyalar yuklanmoqda…</p>
      ) : catsQ.isError ? (
        <p className="text-sm text-destructive">Kategoriyalarni yuklab bo‘lmadi.</p>
      ) : (
        <div className="space-y-2 max-h-[min(28rem,60vh)] overflow-y-auto pr-1">
          {tree.map((n) => (
            <CategoryNode
              key={n.id}
              tenantSlug={tenantSlug}
              node={n}
              depth={0}
              selected={selected}
              onToggleProduct={onToggleProduct}
              expanded={expandedCats}
              toggleExpanded={toggleExpanded}
              disabled={disabled}
            />
          ))}

          <div className="pt-2 border-t border-border/60">
            <div className="flex items-center gap-1 py-0.5">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setUncOpen((v) => !v)}
                aria-expanded={uncOpen}
                disabled={disabled}
              >
                {uncOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
              <button
                type="button"
                className="text-left text-sm font-medium hover:underline flex-1 disabled:opacity-50"
                onClick={() => setUncOpen((v) => !v)}
                disabled={disabled}
              >
                Kategoriyasiz mahsulotlar
              </button>
            </div>
            {uncOpen ? (
              <CategoryProductsPanel
                tenantSlug={tenantSlug}
                categoryKey={UNCATEGORIZED_KEY}
                selected={selected}
                onToggleProduct={onToggleProduct}
                depth={0}
                disabled={disabled}
              />
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
