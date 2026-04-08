"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
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
  removeNode,
  sortForest,
  type TerritoryNode,
  updateNode
} from "@/lib/territory-tree";
import { mergeTerritoryBundle } from "@shared/territory-lalaku-seed";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  RefreshCw,
  Share2,
  Trash2
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";

type TenantProfile = {
  references: {
    territory_levels?: string[];
    territory_nodes?: TerritoryNode[];
  };
};

/** `npm run import:once` dagi zona/viloyatlar bilan bir xil (shared/territory-lalaku-seed). */
function sampleForest(): TerritoryNode[] {
  return mergeTerritoryBundle([]) as TerritoryNode[];
}

type TreeRowProps = {
  node: TerritoryNode;
  depth: number;
  /** Har bir ustunda vertikal chiziq: ota-onaning pastida aka-uka bormi (`depth - 1` ta) */
  verticalMask: boolean[];
  /** O‘z darajasida oxirgi farzandmi (├ vs └) */
  isLastChild: boolean;
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

const TREE_GUIDE_W = "w-[22px]";
const TREE_LINE = "bg-zinc-300 dark:bg-zinc-600";

/** Vertikal «yo‘l» ustunlari + oxirgi L-burchak */
function TerritoryTreeGuides({
  depth,
  verticalMask,
  isLastChild
}: {
  depth: number;
  verticalMask: boolean[];
  isLastChild: boolean;
}) {
  if (depth === 0) return null;

  const contCount = depth - 1;
  const cols: ReactNode[] = [];
  for (let j = 0; j < contCount; j++) {
    const show = verticalMask[j] === true;
    cols.push(
      <div
        key={`v-${j}`}
        className={cn("relative min-h-8 shrink-0 self-stretch", TREE_GUIDE_W)}
        aria-hidden
      >
        {show ? (
          <div
            className={cn("absolute inset-y-0 left-1/2 w-px -translate-x-1/2", TREE_LINE)}
          />
        ) : null}
      </div>
    );
  }
  cols.push(
    <div
      key="elbow"
      className={cn("relative min-h-8 shrink-0 self-stretch", TREE_GUIDE_W)}
      aria-hidden
    >
      <div className={cn("absolute left-1/2 top-0 h-1/2 w-px -translate-x-1/2", TREE_LINE)} />
      <div className={cn("absolute left-1/2 right-0 top-1/2 h-px", TREE_LINE)} />
      {!isLastChild ? (
        <div className={cn("absolute bottom-0 left-1/2 top-1/2 w-px -translate-x-1/2", TREE_LINE)} />
      ) : null}
    </div>
  );
  return <div className="flex shrink-0 items-stretch">{cols}</div>;
}

function TerritoryTreeRow({
  node,
  depth,
  verticalMask,
  isLastChild,
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
  const sortedChildren = sortForest(node.children);

  return (
    <div className="select-none">
      <div
        className={cn(
          "group flex min-h-8 items-stretch rounded-md py-0.5 pr-1",
          "hover:bg-teal-500/[0.08] dark:hover:bg-teal-500/10"
        )}
      >
        <TerritoryTreeGuides depth={depth} verticalMask={verticalMask} isLastChild={isLastChild} />

        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
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

          <div className="flex min-h-8 min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
            <span className="min-w-0 shrink text-[13px] font-medium uppercase tracking-wide text-foreground [overflow-wrap:anywhere] sm:truncate">
              {node.name || "—"}
            </span>
            {isAdmin ? (
              <div
                className={cn(
                  "flex shrink-0 items-center gap-0.5 rounded-md px-0.5",
                  "opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
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
        </div>
      </div>

      {isOpen && hasChildren ? (
        <div className="space-y-0">
          {sortedChildren.map((ch, idx) => (
            <TerritoryTreeRow
              key={ch.id}
              node={ch}
              depth={depth + 1}
              verticalMask={[...verticalMask, !isLastChild]}
              isLastChild={idx === sortedChildren.length - 1}
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
  const [autoSync, setAutoSync] = useState(true);

  const profileQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug],
    enabled: Boolean(tenantSlug),
    /** Skript / boshqa joydan `settings` o‘zgarganda kesh eskirgan bo‘lmasin */
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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

  useEffect(() => {
    if (!autoSync) return;
    if (!tenantSlug) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      if (saveMut.isPending || editOpen || moveOpen) return;
      void profileQ.refetch();
    }, 20000);
    return () => window.clearInterval(timer);
  }, [autoSync, tenantSlug, saveMut.isPending, editOpen, moveOpen, profileQ]);

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
        title="Territoriya"
        description="Daraxt: ildizdan qo‘shish, tugun ustida qo‘shish / tahrir / ko‘chirish — barchasi shu sahifada."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              title="Serverdan qayta yuklash (import skriptidan keyin)"
              disabled={!tenantSlug || profileQ.isFetching}
              onClick={() => void profileQ.refetch()}
            >
              <RefreshCw className={cn("mr-1 size-3.5", profileQ.isFetching && "animate-spin")} />
              Yangilash
            </Button>
            <Button
              type="button"
              size="sm"
              variant={autoSync ? "default" : "outline"}
              onClick={() => setAutoSync((v) => !v)}
              title="Har 20 soniyada serverdan avtomatik yangilash"
            >
              {autoSync ? "Auto-sync: ON" : "Auto-sync: OFF"}
            </Button>
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
                <div className="space-y-0">
                  {sortForest(nodes).map((n, rootIdx, roots) => (
                    <TerritoryTreeRow
                      key={n.id}
                      node={n}
                      depth={0}
                      verticalMask={[]}
                      isLastChild={rootIdx === roots.length - 1}
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
                <div className="grid max-w-xl gap-2">
                  {levels.map((lvl, idx) => (
                    <div key={`lvl-${idx}-${lvl.slice(0, 8)}`} className="flex items-center gap-2">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded bg-teal-600/90 text-xs font-bold text-white">
                        {idx + 1}
                      </span>
                      <Input
                        className="min-w-0 flex-1"
                        value={lvl}
                        onChange={(e) => {
                          const next = [...levels];
                          next[idx] = e.target.value;
                          setLevels(next);
                        }}
                        disabled={!isAdmin || saveMut.isPending}
                      />
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        title="Darajani olib tashlash"
                        disabled={!isAdmin || saveMut.isPending || levels.length <= 1}
                        onClick={() => setLevels((p) => p.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </Button>
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
                    setMsg("Namuna (Lalaku zona/viloyatlar, import:once bilan bir xil) yuklandi. Saqlashni bosing.");
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
