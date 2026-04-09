"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { TableRowActionGroup } from "@/components/data-table/table-row-actions";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { PRODUCT_UNIT_OPTIONS } from "@/lib/product-units";
import { cn } from "@/lib/utils";
import { downloadXlsxSheet } from "@/lib/download-xlsx";
import { FilterSelect } from "@/components/ui/filter-select";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type ProductCategoryRow = {
  id: number;
  name: string;
  parent_id: number | null;
  code: string | null;
  sort_order: number | null;
  default_unit: string | null;
  is_active: boolean;
  comment: string | null;
  created_at: string;
};

type UnitMeasure = { id: string; name: string; active?: boolean };

type Profile = {
  references: { unit_measures?: UnitMeasure[] };
};

type MainTab = "category" | "group" | "sub";

function rowDepth(row: ProductCategoryRow, byId: Map<number, ProductCategoryRow>): number {
  let d = 0;
  let pid = row.parent_id;
  const seen = new Set<number>();
  while (pid != null && !seen.has(pid)) {
    seen.add(pid);
    d++;
    const p = byId.get(pid);
    if (!p) break;
    pid = p.parent_id;
  }
  return d;
}

function parentName(id: number | null, byId: Map<number, ProductCategoryRow>): string {
  if (id == null) return "—";
  return byId.get(id)?.name ?? `#${id}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU");
}

export default function ProductCategoriesSettingsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();
  const isAdmin = role === "admin";
  const qc = useQueryClient();

  const [mainTab, setMainTab] = useState<MainTab>("category");
  const [statusTab, setStatusTab] = useState<"active" | "inactive">("active");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [defaultUnit, setDefaultUnit] = useState("");
  const [comment, setComment] = useState("");
  const [active, setActive] = useState(true);
  const [parentId, setParentId] = useState<string>("");

  const [msg, setMsg] = useState<string | null>(null);

  const catsQ = useQuery({
    queryKey: ["product-categories", tenantSlug],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: ProductCategoryRow[] }>(`/api/${tenantSlug}/product-categories`);
      return data.data;
    }
  });

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "product-cat-units"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<Profile>(`/api/${tenantSlug}/settings/profile`);
      return data;
    }
  });

  const byId = useMemo(() => {
    const m = new Map<number, ProductCategoryRow>();
    for (const r of catsQ.data ?? []) m.set(r.id, r);
    return m;
  }, [catsQ.data]);

  const roots = useMemo(
    () => (catsQ.data ?? []).filter((r) => rowDepth(r, byId) === 0),
    [catsQ.data, byId]
  );
  const groups = useMemo(
    () => (catsQ.data ?? []).filter((r) => rowDepth(r, byId) === 1),
    [catsQ.data, byId]
  );

  const rowsForTab = useMemo(() => {
    const all = catsQ.data ?? [];
    if (mainTab === "category") return all.filter((r) => rowDepth(r, byId) === 0);
    if (mainTab === "group") return all.filter((r) => rowDepth(r, byId) === 1);
    return all.filter((r) => rowDepth(r, byId) === 2);
  }, [catsQ.data, byId, mainTab]);

  const filtered = useMemo(() => {
    const st = statusTab === "active" ? (r: ProductCategoryRow) => r.is_active !== false : (r: ProductCategoryRow) => r.is_active === false;
    const q = search.trim().toLowerCase();
    return rowsForTab.filter((r) => {
      if (!st(r)) return false;
      if (!q) return true;
      const blob = [r.name, r.code ?? "", r.comment ?? ""].join(" ").toLowerCase();
      return blob.includes(q);
    });
  }, [rowsForTab, statusTab, search]);

  const unitOptions = useMemo(() => {
    const fromProfile = (profileQ.data?.references?.unit_measures ?? [])
      .filter((u) => u.active !== false)
      .map((u) => u.name.trim())
      .filter(Boolean);
    const set = new Set<string>([...fromProfile, ...PRODUCT_UNIT_OPTIONS.map((o) => o.value)]);
    return Array.from(set).sort((a, b) => a.localeCompare(b, "uz"));
  }, [profileQ.data]);

  const saveMut = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      if (!tenantSlug) throw new Error("no");
      if (editId != null) {
        await api.patch(`/api/${tenantSlug}/product-categories/${editId}`, payload);
      } else {
        await api.post(`/api/${tenantSlug}/product-categories`, payload);
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["product-categories", tenantSlug] });
      setMsg("Saqlandi.");
      setOpen(false);
      resetForm();
    },
    onError: () => setMsg("Xatolik yoki ruxsat yo‘q.")
  });

  function resetForm() {
    setEditId(null);
    setName("");
    setCode("");
    setSortOrder("");
    setDefaultUnit("");
    setComment("");
    setActive(true);
    setParentId("");
  }

  function openAdd() {
    resetForm();
    setOpen(true);
  }

  function openEdit(row: ProductCategoryRow) {
    setEditId(row.id);
    setName(row.name);
    setCode(row.code ?? "");
    setSortOrder(row.sort_order == null ? "" : String(row.sort_order));
    setDefaultUnit(row.default_unit ?? "");
    setComment(row.comment ?? "");
    setActive(row.is_active !== false);
    setParentId(row.parent_id != null ? String(row.parent_id) : "");
    setOpen(true);
  }

  function submit() {
    setMsg(null);
    const n = name.trim();
    if (!n) return;

    let resolvedParent: number | null = null;
    if (mainTab !== "category") {
      const raw = parentId.trim();
      if (!raw) {
        setMsg("Ota elementni tanlang.");
        return;
      }
      resolvedParent = Number.parseInt(raw, 10);
      if (!Number.isFinite(resolvedParent)) {
        setMsg("Ota elementni tanlang.");
        return;
      }
    }

    const body: Record<string, unknown> = {
      name: n,
      sort_order: sortOrder.trim() ? Number(sortOrder.trim()) : null,
      comment: comment.trim() || null,
      is_active: active
    };

    if (mainTab === "group") {
      body.code = null;
      body.default_unit = null;
    } else {
      body.code = code.trim() ? code.trim().toUpperCase() : null;
      body.default_unit = defaultUnit.trim() || null;
    }

    if (editId == null) {
      body.parent_id = mainTab === "category" ? null : resolvedParent;
    } else if (mainTab === "category") {
      body.parent_id = null;
    } else {
      body.parent_id = resolvedParent;
    }

    saveMut.mutate(body);
  }

  const addLabel =
    mainTab === "category"
      ? "Добавить категорию товара"
      : mainTab === "group"
        ? "Добавить группу категорий"
        : "Добавить подкатегорию";

  function exportExcel() {
    const date = new Date().toISOString().slice(0, 10);
    if (mainTab === "category") {
      downloadXlsxSheet(
        `product_categories_${statusTab}_${date}.xlsx`,
        "Категории",
        ["Название", "Код", "Дата создания", "Ед.изм.", "Сортировка", "Комментарий", "Активный"],
        filtered.map((r) => [
          r.name,
          r.code ?? "",
          fmtDate(r.created_at),
          r.default_unit ?? "",
          r.sort_order != null ? String(r.sort_order) : "",
          r.comment ?? "",
          r.is_active !== false ? "да" : "нет"
        ])
      );
    } else if (mainTab === "group") {
      downloadXlsxSheet(
        `product_category_groups_${statusTab}_${date}.xlsx`,
        "Группы",
        ["Название", "Категория", "Сортировка", "Комментарий", "Активный"],
        filtered.map((r) => [
          r.name,
          parentName(r.parent_id, byId),
          r.sort_order != null ? String(r.sort_order) : "",
          r.comment ?? "",
          r.is_active !== false ? "да" : "нет"
        ])
      );
    } else {
      downloadXlsxSheet(
        `product_subcategories_${statusTab}_${date}.xlsx`,
        "Подкатегории",
        ["Название", "Код", "Дата создания", "Ед.изм.", "Сортировка", "Комментарий", "Группа", "Активный"],
        filtered.map((r) => [
          r.name,
          r.code ?? "",
          fmtDate(r.created_at),
          r.default_unit ?? "",
          r.sort_order != null ? String(r.sort_order) : "",
          r.comment ?? "",
          parentName(r.parent_id, byId),
          r.is_active !== false ? "да" : "нет"
        ])
      );
    }
  }

  if (!hydrated) {
    return (
      <PageShell>
        <p className="text-sm text-muted-foreground">Sessiya...</p>
      </PageShell>
    );
  }
  if (!tenantSlug) {
    return (
      <PageShell>
        <p className="text-sm text-destructive">
          <Link href="/login" className="underline">
            Kirish
          </Link>
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <PageHeader
        title="Категория продукта"
        description="Uch daraja: kategoriya → guruh → pastki kategoriya. Mahsulot formasi xuddi shu ro‘yxatdan foydalanadi."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!isAdmin} onClick={openAdd}>
              {addLabel}
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={exportExcel}>
              Excel
            </Button>
            <Link href="/settings" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Katalog
            </Link>
          </div>
        }
      />

      <SettingsWorkspace>
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex flex-wrap gap-2 border-b border-border/60 pb-3">
            {(
              [
                ["category", "Категория продукта"],
                ["group", "Группа категорий"],
                ["sub", "Под категории"]
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium",
                  mainTab === id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
                onClick={() => {
                  setMainTab(id);
                  setSearch("");
                }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={cn(
                "rounded px-3 py-1 text-sm",
                statusTab === "active" ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
              onClick={() => setStatusTab("active")}
            >
              Активный
            </button>
            <button
              type="button"
              className={cn(
                "rounded px-3 py-1 text-sm",
                statusTab === "inactive" ? "bg-primary text-primary-foreground" : "bg-muted"
              )}
              onClick={() => setStatusTab("inactive")}
            >
              Не активный
            </button>
            <Input
              className="ml-auto max-w-xs"
              placeholder="Поиск"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="app-table-thead text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Названия</th>
                  {mainTab === "group" ? <th className="px-3 py-2 font-medium">Категория</th> : null}
                  {mainTab !== "group" ? <th className="px-3 py-2 font-medium">Код</th> : null}
                  {mainTab !== "group" ? <th className="px-3 py-2 font-medium">Дата создания</th> : null}
                  {mainTab !== "group" ? <th className="px-3 py-2 font-medium">Единицы измерения</th> : null}
                  <th className="px-3 py-2 font-medium">Сортировка</th>
                  <th className="px-3 py-2 font-medium">Комментарий</th>
                  <th className="px-3 py-2 text-right font-medium">...</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.name}</td>
                    {mainTab === "group" ? (
                      <td className="px-3 py-2">{parentName(r.parent_id, byId)}</td>
                    ) : null}
                    {mainTab !== "group" ? <td className="px-3 py-2">{r.code ?? "—"}</td> : null}
                    {mainTab !== "group" ? <td className="px-3 py-2">{fmtDate(r.created_at)}</td> : null}
                    {mainTab !== "group" ? <td className="px-3 py-2">{r.default_unit ?? "—"}</td> : null}
                    <td className="px-3 py-2">{r.sort_order ?? "—"}</td>
                    <td className="px-3 py-2">{r.comment ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {isAdmin ? (
                        <TableRowActionGroup className="justify-end" ariaLabel="Kategoriya">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            title="Tahrirlash"
                            aria-label="Tahrirlash"
                            onClick={() => openEdit(r)}
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </Button>
                        </TableRowActionGroup>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={
                        mainTab === "group" ? 5 : 7
                      }
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      Пусто
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Ko‘rsatilgan: {filtered.length} / {rowsForTab.length} (joriy tab)
          </p>
        </div>
      </SettingsWorkspace>

      {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]" showCloseButton>
          <DialogHeader>
            <DialogTitle>{editId ? "Редактировать" : "Добавить"}</DialogTitle>
            <DialogDescription>
              {mainTab === "category"
                ? "Asosiy kategoriya (parent yo‘q)."
                : mainTab === "group"
                  ? "Kategoriya ostidagi guruh."
                  : "Guruh ostidagi pastki kategoriya."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {mainTab !== "category" ? (
              <div className="grid gap-1.5">
                <Label>{mainTab === "group" ? "Категория" : "Группа категорий"}</Label>
                <FilterSelect
                  className="h-9 w-full min-w-0 max-w-none rounded-md border border-input bg-background px-2 text-sm"
                  emptyLabel={mainTab === "group" ? "Категория" : "Группа категорий"}
                  aria-label={mainTab === "group" ? "Категория" : "Группа категорий"}
                  value={parentId}
                  onChange={(e) => setParentId(e.target.value)}
                >
                  {(mainTab === "group" ? roots : groups).map((x) => (
                    <option key={x.id} value={String(x.id)}>
                      {x.name}
                    </option>
                  ))}
                </FilterSelect>
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label>Названия</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} className={!name.trim() ? "border-destructive/60" : ""} />
            </div>
            {mainTab !== "group" ? (
              <div className="grid gap-1.5">
                <div className="flex justify-between">
                  <Label>Код</Label>
                  <span className="text-xs text-muted-foreground">{code.length} / 24</span>
                </div>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 24))}
                />
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label>Сортировка</Label>
              <Input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
              />
            </div>
            {mainTab !== "group" ? (
              <div className="grid gap-1.5">
                <Label>Единицы измерения</Label>
                <FilterSelect
                  className="h-9 w-full min-w-0 max-w-none rounded-md border border-input bg-background px-2 text-sm"
                  emptyLabel="Единицы измерения"
                  aria-label="Единицы измерения"
                  value={defaultUnit}
                  onChange={(e) => setDefaultUnit(e.target.value)}
                >
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </FilterSelect>
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <Label>Комментарий</Label>
              <textarea
                className="min-h-[72px] rounded-md border bg-background px-3 py-2 text-sm"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>Активный</span>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            </label>
            <Button onClick={submit} disabled={saveMut.isPending || !isAdmin}>
              {editId ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
