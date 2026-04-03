"use client";

import { TableRowActionGroup } from "@/components/data-table/table-row-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CatalogSimpleRow } from "@/lib/product-types";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import { useEffect, useState } from "react";

type Props = {
  tenantSlug: string | null;
  isAdmin: boolean;
  apiPath: string;
  title: string;
  addLabel: string;
  statusTab: "active" | "inactive";
  search: string;
  pageSize: number;
};

export function CatalogSimpleTab({
  tenantSlug,
  isAdmin,
  apiPath,
  title,
  addLabel,
  statusTab,
  search,
  pageSize
}: Props) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [active, setActive] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const isActiveParam = statusTab === "active";

  const listQ = useQuery({
    queryKey: ["catalog-simple", apiPath, tenantSlug, statusTab, search, page, pageSize],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        is_active: isActiveParam ? "true" : "false"
      });
      if (search.trim()) params.set("search", search.trim());
      const { data } = await api.get<{ data: CatalogSimpleRow[]; total: number }>(
        `/api/${tenantSlug}/${apiPath}?${params}`
      );
      return data;
    }
  });

  const rows = listQ.data?.data ?? [];
  const total = listQ.data?.total ?? 0;

  useEffect(() => {
    setPage(1);
  }, [search, statusTab, pageSize]);

  function openCreate() {
    setEditId(null);
    setName("");
    setCode("");
    setSortOrder("");
    setActive(true);
    setOpen(true);
  }

  function openEdit(r: CatalogSimpleRow) {
    setEditId(r.id);
    setName(r.name);
    setCode(r.code ?? "");
    setSortOrder(r.sort_order != null ? String(r.sort_order) : "");
    setActive(r.is_active);
    setOpen(true);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!tenantSlug) throw new Error("no");
      const body = {
        name: name.trim(),
        code: code.trim() || null,
        sort_order: sortOrder.trim() === "" ? null : Number.parseInt(sortOrder, 10),
        is_active: active
      };
      if (!body.name) throw new Error("name");
      if (body.sort_order != null && !Number.isFinite(body.sort_order)) throw new Error("sort");
      if (editId != null) {
        await api.put(`/api/${tenantSlug}/${apiPath}/${editId}`, body);
      } else {
        await api.post(`/api/${tenantSlug}/${apiPath}`, body);
      }
    },
    onSuccess: async () => {
      setMsg(null);
      setOpen(false);
      await qc.invalidateQueries({ queryKey: ["catalog-simple", apiPath, tenantSlug] });
    },
    onError: () => setMsg("Saqlashda xato yoki ruxsat yo‘q.")
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{title}</p>
        {isAdmin ? (
          <Button type="button" size="sm" onClick={openCreate}>
            {addLabel}
          </Button>
        ) : null}
      </div>

      {msg ? <p className="text-sm text-destructive">{msg}</p> : null}

      <div className="overflow-hidden rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left">
            <tr>
              <th className="px-3 py-2 font-medium">Название</th>
              <th className="px-3 py-2 font-medium">Код</th>
              <th className="px-3 py-2 font-medium">Сорт.</th>
              <th className="px-3 py-2 text-right font-medium"> </th>
            </tr>
          </thead>
          <tbody>
            {listQ.isLoading ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  Yuklanmoqda…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                  Пусто
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.code ?? "—"}</td>
                  <td className="px-3 py-2">{r.sort_order ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    {isAdmin ? (
                      <TableRowActionGroup className="justify-end" ariaLabel="Yozuv">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
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
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          {total ? `Показано ${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} / ${total}` : ""}
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            ←
          </Button>
          <span className="px-2 py-1">
            {page} / {totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            →
          </Button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[440px]" showCloseButton>
          <DialogHeader>
            <DialogTitle>{editId ? "Редактировать" : "Добавить"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Название</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <div className="flex justify-between">
                <Label>Код</Label>
                <span className="text-xs text-muted-foreground">{code.length} / 20</span>
              </div>
              <Input
                value={code}
                maxLength={20}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Сортировка</Label>
              <Input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value.replace(/[^0-9-]/g, ""))}
                inputMode="numeric"
              />
            </div>
            <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>Активный</span>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            </label>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !isAdmin}>
              {editId ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
