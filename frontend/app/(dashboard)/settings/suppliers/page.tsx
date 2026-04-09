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
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

type SupplierRow = {
  id: number;
  name: string;
  code: string | null;
  phone: string | null;
  comment: string | null;
  is_active: boolean;
};

export default function SuppliersSettingsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();
  const isAdmin = role === "admin" || role === "operator";
  const qc = useQueryClient();

  const [tab, setTab] = useState<"active" | "inactive">("active");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [comment, setComment] = useState("");
  const [active, setActive] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SupplierRow | null>(null);

  const listQ = useQuery({
    queryKey: ["suppliers-settings", tenantSlug],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<{ data: SupplierRow[] }>(`/api/${tenantSlug}/suppliers`);
      return data.data;
    },
  });

  const filtered = useMemo(() => {
    const rows = listQ.data ?? [];
    return rows.filter((x) => (tab === "active" ? x.is_active !== false : x.is_active === false));
  }, [listQ.data, tab]);

  const saveMut = useMutation({
    mutationFn: async (body: { name: string; code?: string | null; phone?: string | null; comment?: string | null; is_active?: boolean }) => {
      if (editing) {
        await api.patch(`/api/${tenantSlug}/suppliers/${editing.id}`, body);
      } else {
        await api.post(`/api/${tenantSlug}/suppliers`, body);
      }
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["suppliers-settings", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["suppliers", tenantSlug] });
      setMsg("Saqlandi.");
      setOpen(false);
      setEditing(null);
    },
    onError: () => setMsg("Saqlashda xatolik."),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/${tenantSlug}/suppliers/${id}`);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["suppliers-settings", tenantSlug] });
      setMsg("O'chirildi.");
      setConfirmDelete(null);
    },
    onError: () => setMsg("O'chirishda xatolik."),
  });

  function openAdd() {
    setEditing(null);
    setName("");
    setCode("");
    setPhone("");
    setComment("");
    setActive(true);
    setOpen(true);
  }

  function openEdit(row: SupplierRow) {
    setEditing(row);
    setName(row.name);
    setCode(row.code ?? "");
    setPhone(row.phone ?? "");
    setComment(row.comment ?? "");
    setActive(row.is_active !== false);
    setOpen(true);
  }

  function submitForm() {
    const n = name.trim();
    if (!n) return;
    saveMut.mutate({
      name: n,
      code: code.trim() || null,
      phone: phone.trim() || null,
      comment: comment.trim() || null,
      is_active: active,
    });
  }

  if (!hydrated) return <PageShell><p className="text-sm text-muted-foreground">Sessiya...</p></PageShell>;
  if (!tenantSlug) return <PageShell><p className="text-sm text-destructive"><Link href="/login" className="underline">Kirish</Link></p></PageShell>;

  return (
    <PageShell>
      <PageHeader
        title="Поставщики"
        description="Ta'minotchilar ro'yxati — kirim hujjatlarida tanlash uchun."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/stock/receipts" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Поступления
            </Link>
            <Button size="sm" disabled={!isAdmin} onClick={openAdd}>Добавить</Button>
            <Link href="/settings" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>Katalog</Link>
          </div>
        }
      />

      <SettingsWorkspace>
        <div className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex gap-2">
            <button className={cn("rounded px-3 py-1 text-sm", tab === "active" ? "bg-primary text-primary-foreground" : "bg-muted")} onClick={() => setTab("active")}>Активный</button>
            <button className={cn("rounded px-3 py-1 text-sm", tab === "inactive" ? "bg-primary text-primary-foreground" : "bg-muted")} onClick={() => setTab("inactive")}>Не активный</button>
          </div>

          <div className="overflow-hidden rounded-md border">
            <table className="w-full text-sm">
              <thead className="app-table-thead text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Название</th>
                  <th className="px-3 py-2 font-medium">Код</th>
                  <th className="px-3 py-2 font-medium">Телефон</th>
                  <th className="px-3 py-2 font-medium">Комментарий</th>
                  <th className="px-3 py-2 font-medium text-right">...</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2 font-mono text-xs">{r.code ?? "—"}</td>
                    <td className="px-3 py-2">{r.phone ?? "—"}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate">{r.comment ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {isAdmin ? (
                        <TableRowActionGroup className="justify-end" ariaLabel="Поставщик">
                          <Button
                            variant="outline"
                            size="icon-sm"
                            className="text-destructive hover:text-destructive"
                            type="button"
                            title="Удалить"
                            aria-label="Удалить"
                            onClick={() => setConfirmDelete(r)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            className="text-muted-foreground hover:text-foreground"
                            type="button"
                            title="Tahrirlash"
                            aria-label="Tahrirlash"
                            onClick={() => openEdit(r)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        </TableRowActionGroup>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Ma’lumot yo‘q</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </SettingsWorkspace>

      {msg && <p className="mt-3 text-sm text-muted-foreground">{msg}</p>}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]" showCloseButton>
          <DialogHeader>
            <DialogTitle>{editing ? "Редактировать" : "Добавить"}</DialogTitle>
            <DialogDescription>Поставщик: номенклатура, контакт, код.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label>Название</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label>Код</Label>
                <span className="text-xs text-muted-foreground">{code.length} / 20</span>
              </div>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "").slice(0, 20))} />
            </div>
            <div className="grid gap-1.5">
              <Label>Телефон</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998..." />
            </div>
            <div className="grid gap-1.5">
              <Label>Комментарий</Label>
              <textarea className="min-h-[72px] rounded-md border bg-background px-3 py-2 text-sm" value={comment} onChange={(e) => setComment(e.target.value)} />
            </div>
            <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>Активный</span>
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
            </label>
            <Button onClick={submitForm} disabled={saveMut.isPending || !isAdmin}>
              {editing ? "Сохранить" : "Добавить"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete != null} onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}>
        <DialogContent className="sm:max-w-[400px]" showCloseButton>
          <DialogHeader>
            <DialogTitle>O‘chirish</DialogTitle>
            <DialogDescription>
              {confirmDelete ? `«${confirmDelete.name}» o‘chirilsinmi?` : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>Отмена</Button>
            <Button variant="destructive" disabled={deleteMut.isPending} onClick={() => confirmDelete && deleteMut.mutate(confirmDelete.id)}>O‘chirish</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
