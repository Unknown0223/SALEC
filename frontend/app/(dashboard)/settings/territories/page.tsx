"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button, buttonVariants } from "@/components/ui/button";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
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
import { useAuthStore, useAuthStoreHydrated, useEffectiveRole } from "@/lib/auth-store";
import {
  addChild,
  addRoot,
  cloneForest,
  emptyNode,
  listValidParents,
  moveNode,
  newTerritoryId,
  removeNode,
  sortForest,
  type TerritoryNode,
  updateNode
} from "@/lib/territory-tree";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeft, ChevronDown, ChevronRight, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type TenantProfile = {
  references: {
    territory_levels?: string[];
    territory_nodes?: TerritoryNode[];
  };
};

function sampleForest(): TerritoryNode[] {
  const id = () => newTerritoryId();
  return [
    {
      id: id(),
      name: "FV",
      children: [
        {
          id: id(),
          name: "ANDIJON VILOYATI",
          children: [
            { id: id(), name: "ANDIJON SHAXAR", children: [] },
            { id: id(), name: "ASAKA", children: [] },
            { id: id(), name: "BULOQBOSHI", children: [] }
          ]
        }
      ]
    },
    {
      id: id(),
      name: "QOZOG'ISTON",
      children: [
        {
          id: id(),
          name: "Almaty",
          children: [{ id: id(), name: "Auezov District", children: [] }]
        }
      ]
    },
    {
      id: id(),
      name: "TOSHKENT",
      children: [
        {
          id: id(),
          name: "Chilonzor",
          children: [{ id: id(), name: "1-kvartal", children: [] }]
        }
      ]
    },
    { id: id(), name: "SAUDIYA ARABISTON", children: [] },
    { id: id(), name: "SOUTH-WEST", children: [] },
    { id: id(), name: "W", children: [] }
  ];
}

type TreeRowProps = {
  node: TerritoryNode;
  depth: number;
  expanded: Set<string>;
  toggle: (id: string) => void;
  isAdmin: boolean;
  busy: boolean;
  startEdit: (node: TerritoryNode) => void;
  onAddChild: (parentId: string) => void;
  onMove: (id: string) => void;
  onExport: (node: TerritoryNode) => void;
  onDelete: (id: string) => void;
};

function TerritoryTreeRow({
  node,
  depth,
  expanded,
  toggle,
  isAdmin,
  busy,
  startEdit,
  onAddChild,
  onMove,
  onExport,
  onDelete
}: TreeRowProps) {
  const isOpen = expanded.has(node.id);
  const hasChildren = node.children.length > 0;

  return (
    <div className="select-none">
      <div
        className={cn(
          "group flex min-h-8 items-center gap-1 rounded-md py-0.5 pr-1",
          depth > 0 && "ml-2 border-l-2 border-teal-500/45 pl-2"
        )}
      >
        <button
          type="button"
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => (hasChildren ? toggle(node.id) : undefined)}
          disabled={!hasChildren}
          aria-label={isOpen ? "Yig‘ish" : "Yoyish"}
        >
          {hasChildren ? (
            isOpen ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )
          ) : (
            <span className="size-4" />
          )}
        </button>

        <span className="flex-1 truncate text-sm font-medium">{node.name || "—"}</span>

        {isAdmin ? (
          <div
            className={cn(
              "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            )}
          >
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="text-teal-600 hover:text-teal-700 dark:text-teal-400"
              title="Qo‘shish (ichki)"
              disabled={busy}
              onClick={() => onAddChild(node.id)}
            >
              <Plus className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="O‘zgartirish"
              disabled={busy}
              onClick={() => startEdit(node)}
            >
              <Pencil className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="Ko‘chirish"
              disabled={busy}
              onClick={() => onMove(node.id)}
            >
              <ArrowRightLeft className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              title="Eksport (JSON)"
              disabled={busy}
              onClick={() => onExport(node)}
            >
              <Share2 className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              title="O‘chirish"
              disabled={busy}
              onClick={() => {
                if (window.confirm(`“${node.name || "Tugun"}” va ichidagi barchasi o‘chirilsinmi?`)) {
                  onDelete(node.id);
                }
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>

      {isOpen && hasChildren ? (
        <div className="space-y-0">
          {node.children.map((ch) => (
            <TerritoryTreeRow
              key={ch.id}
              node={ch}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              isAdmin={isAdmin}
              busy={busy}
              startEdit={startEdit}
              onAddChild={onAddChild}
              onMove={onMove}
              onExport={onExport}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function TerritoriesSettingsPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const hydrated = useAuthStoreHydrated();
  const role = useEffectiveRole();
  const isAdmin = role === "admin";
  const qc = useQueryClient();

  const [activeTab, setActiveTab] = useState<"tree" | "manage">("tree");
  const [levels, setLevels] = useState<string[]>(["Zona", "Oblast", "Gorod"]);
  const [nodes, setNodes] = useState<TerritoryNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editNodeId, setEditNodeId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editSort, setEditSort] = useState("");
  const [editComment, setEditComment] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveNodeId, setMoveNodeId] = useState<string | null>(null);

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<TenantProfile>(`/api/${tenantSlug}/settings/profile`);
      return data;
    }
  });

  useEffect(() => {
    const fromApi = profileQ.data?.references?.territory_nodes;
    const lv = profileQ.data?.references?.territory_levels ?? [];
    if (lv.length) setLevels(lv.slice(0, 12));
    if (fromApi && fromApi.length > 0) {
      setNodes(sortForest(cloneForest(fromApi)));
      setExpanded(new Set(fromApi.map((n) => n.id)));
    }
  }, [profileQ.data]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openEditModal = useCallback((node: TerritoryNode) => {
    setEditNodeId(node.id);
    setEditName(node.name ?? "");
    setEditCode(node.code ?? "");
    setEditSort(node.sort_order == null ? "" : String(node.sort_order));
    setEditComment(node.comment ?? "");
    setEditActive(node.active !== false);
    setEditOpen(true);
  }, []);

  const applyEdit = useCallback(() => {
    if (!editNodeId) return;
    const name = editName.trim();
    if (!name) return;
    const code = editCode.trim().toUpperCase();
    const sortOrder = editSort.trim() === "" ? null : Number(editSort.trim());
    setNodes((prev) =>
      sortForest(
        updateNode(prev, editNodeId, {
          name,
          code: code || null,
          comment: editComment.trim() || null,
          sort_order: Number.isInteger(sortOrder) ? sortOrder : null,
          active: editActive
        })
      )
    );
    setEditOpen(false);
    setEditNodeId(null);
  }, [editNodeId, editName, editCode, editSort, editComment, editActive]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!tenantSlug) throw new Error("Tenant yo'q");
      await api.patch(`/api/${tenantSlug}/settings/profile`, {
        references: {
          territory_levels: levels.map((x) => x.trim()).filter(Boolean),
          territory_nodes: sortForest(nodes),
          territory_tree: []
        }
      });
    },
    onSuccess: async () => {
      setMsg("Saqlandi.");
      await qc.invalidateQueries({ queryKey: ["settings", "profile", tenantSlug] });
    },
    onError: () => setMsg("Saqlashda xato yoki ruxsat yo'q.")
  });

  const moveOptions = useMemo(() => {
    if (!moveNodeId) return [];
    return listValidParents(sortForest(nodes), moveNodeId);
  }, [nodes, moveNodeId]);

  const applyMove = (newParentId: string | null) => {
    if (!moveNodeId) return;
    setNodes((prev) => sortForest(moveNode(prev, moveNodeId, newParentId)));
    setMoveOpen(false);
    setMoveNodeId(null);
  };

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
    <PageShell className="max-w-6xl">
      <PageHeader
        title="Territoriya"
        description="Daraxt: ildizdan qo‘shish, tugun ustida qo‘shish / tahrir / ko‘chirish — barchasi shu sahifada."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={!isAdmin || saveMut.isPending} onClick={() => saveMut.mutate()}>
              {saveMut.isPending ? "Saqlanmoqda..." : "Saqlash"}
            </Button>
            <Link href="/settings" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
              Katalog
            </Link>
          </div>
        }
      />

      <SettingsWorkspace>
        <section className="rounded-lg border border-border/80 bg-card p-4 shadow-sm">
          <div className="mb-4 flex flex-wrap gap-2 border-b border-border/60 pb-3">
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activeTab === "tree"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
              onClick={() => setActiveTab("tree")}
            >
              Территория
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                activeTab === "manage"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:bg-muted"
              )}
              onClick={() => setActiveTab("manage")}
            >
              Управление территории
            </button>
          </div>

          {activeTab === "tree" ? (
            <div className="rounded-lg border border-teal-500/20 bg-background/50 p-3 dark:bg-card/40">
              <div className="mb-2 flex items-center gap-2">
                {isAdmin ? (
                  <Button
                    type="button"
                    size="icon-sm"
                    className="bg-teal-600 text-white hover:bg-teal-700 dark:bg-teal-600 dark:hover:bg-teal-500"
                    title="Добавить (ildiz)"
                    disabled={saveMut.isPending}
                    onClick={() => {
                      const n = emptyNode("Yangi territoriya");
                      setNodes((prev) => sortForest(addRoot(prev, n)));
                      setExpanded((e) => new Set(e).add(n.id));
                    }}
                  >
                    <Plus className="size-4" />
                  </Button>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  Ildiz qo‘shish (+). Tugun ustiga keling — ichki qo‘shish, tahrir, ko‘chirish.
                </span>
              </div>

              {nodes.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Hozircha bo‘sh. Yuqoridagi + yoki «Управление территории» dan test ma’lumot yuklang.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {sortForest(nodes).map((n) => (
                    <TerritoryTreeRow
                      key={n.id}
                      node={n}
                      depth={0}
                      expanded={expanded}
                      toggle={toggle}
                      isAdmin={isAdmin}
                      busy={saveMut.isPending}
                      startEdit={openEditModal}
                      onAddChild={(parentId) => {
                        const child = emptyNode("Yangi");
                        setNodes((prev) => sortForest(addChild(prev, parentId, child)));
                        setExpanded((e) => new Set(e).add(parentId).add(child.id));
                      }}
                      onMove={(id) => {
                        setMoveNodeId(id);
                        setMoveOpen(true);
                      }}
                      onExport={(sub) => {
                        void navigator.clipboard.writeText(JSON.stringify(sub, null, 2));
                        setMsg("Tugun JSON buferga nusxalandi.");
                      }}
                      onDelete={(id) => setNodes((prev) => sortForest(removeNode(prev, id)))}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-4">
              <div className="rounded-lg border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <Label>Daraja nomlari (Зона → Область → Город …)</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!isAdmin || saveMut.isPending}
                    onClick={() => setLevels((p) => [...p, "Yangi daraja"])}
                  >
                    + Daraja
                  </Button>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">
                  Bu yerda faqat darajalar ro‘yxati. Daraxt tuzilmasini «Территория» tabida to‘g‘ridan-to‘g‘ri tahrirlaysiz.
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {levels.map((lvl, idx) => (
                    <div key={`lvl-${idx + 1}`} className="flex items-center gap-2">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded bg-teal-600/90 text-xs font-bold text-white">
                        {idx + 1}
                      </span>
                      <Input
                        value={lvl}
                        onChange={(e) => {
                          const next = [...levels];
                          next[idx] = e.target.value;
                          setLevels(next);
                        }}
                        disabled={!isAdmin || saveMut.isPending}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!isAdmin || saveMut.isPending}
                  onClick={() => {
                    const s = sampleForest();
                    setNodes(sortForest(s));
                    setExpanded(new Set(s.map((x) => x.id)));
                    setMsg("Namuna (FV, QOZOG'ISTON, TOSHKENT + …) yuklandi. Saqlashni bosing.");
                  }}
                >
                  Test ma’lumot (namuna daraxt)
                </Button>
                <Button type="button" disabled={!isAdmin || saveMut.isPending} onClick={() => saveMut.mutate()}>
                  {saveMut.isPending ? "Saqlanmoqda..." : "Saqlash"}
                </Button>
              </div>
            </div>
          )}

          {msg ? <p className="mt-3 text-sm text-muted-foreground">{msg}</p> : null}
          {!isAdmin ? <p className="mt-2 text-xs text-muted-foreground">Tahrirlash faqat admin uchun.</p> : null}
        </section>
      </SettingsWorkspace>

      <Dialog
        open={editOpen}
        onOpenChange={(o) => {
          setEditOpen(o);
          if (!o) setEditNodeId(null);
        }}
      >
        <DialogContent className="sm:max-w-[520px]" showCloseButton>
          <DialogHeader>
            <DialogTitle>Редактировать</DialogTitle>
            <DialogDescription>Nomi, kod, sortirovka, izoh va holat.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="t-name">Название</Label>
              <Input id="t-name" value={editName} onChange={(e) => setEditName(e.target.value)} maxLength={500} />
            </div>
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="t-code">Код</Label>
                <span className="text-xs text-muted-foreground">{editCode.length} / 20</span>
              </div>
              <Input
                id="t-code"
                value={editCode}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "");
                  setEditCode(v.slice(0, 20));
                }}
                placeholder="ADI_SHAXAR"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="t-sort">Сортировка</Label>
              <Input
                id="t-sort"
                value={editSort}
                inputMode="numeric"
                onChange={(e) => setEditSort(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Faqat son"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="t-comment">Комментарий</Label>
              <textarea
                id="t-comment"
                className="min-h-[72px] rounded-md border bg-background px-3 py-2 text-sm"
                value={editComment}
                onChange={(e) => setEditComment(e.target.value)}
              />
            </div>
            <label className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>Активный</span>
              <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
            </label>
            <Button type="button" onClick={applyEdit}>
              Сохранить
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={moveOpen}
        onOpenChange={(o) => {
          setMoveOpen(o);
          if (!o) setMoveNodeId(null);
        }}
      >
        <DialogContent className="max-h-[min(90vh,520px)] sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Ko‘chirish</DialogTitle>
            <DialogDescription>Yangi ota tugunni tanlang (ildiz yoki boshqa filial).</DialogDescription>
          </DialogHeader>
          <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
            {moveOptions.map((opt) => (
              <button
                key={opt.id === null ? "__root__" : opt.id}
                type="button"
                className="w-full rounded-md border border-transparent px-2 py-2 text-left text-sm hover:border-border hover:bg-muted"
                onClick={() => applyMove(opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
