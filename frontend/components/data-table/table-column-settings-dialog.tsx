"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { GripVertical } from "lucide-react";

export type ColumnDefItem = { id: string; label: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  columns: ColumnDefItem[];
  columnOrder: string[];
  hiddenColumnIds: Set<string>;
  onSave: (next: { columnOrder: string[]; hiddenColumnIds: string[] }) => void;
  onReset: () => void;
  saving?: boolean;
};

const DND_MIME = "application/x-salec-col-id";

function reorderByDrag(order: string[], sourceId: string, targetId: string): string[] {
  if (sourceId === targetId) return order;
  const from = order.indexOf(sourceId);
  const to = order.indexOf(targetId);
  if (from < 0 || to < 0) return order;
  const next = [...order];
  const [item] = next.splice(from, 1);
  const newTo = next.indexOf(targetId);
  if (newTo < 0) return order;
  next.splice(newTo, 0, item);
  return next;
}

export function TableColumnSettingsDialog({
  open,
  onOpenChange,
  title = "Jadval ustunlari",
  description = "Ko‘rinadigan ustunlarni tanlang va tartibini o‘zgartiring. Sozlamalar faqat sizning akkauntingizga saqlanadi.",
  columns,
  columnOrder,
  hiddenColumnIds,
  onSave,
  onReset,
  saving
}: Props) {
  const labelById = Object.fromEntries(columns.map((c) => [c.id, c.label]));

  const [order, setOrder] = useState<string[]>(columnOrder);
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(hiddenColumnIds));
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    setOrder(columnOrder);
    setHidden(new Set(hiddenColumnIds));
    setSearch("");
    setDraggingId(null);
    setOverId(null);
  }, [open, columnOrder, hiddenColumnIds]);

  const q = search.trim().toLowerCase();
  const displayOrder = q
    ? order.filter((id) => (labelById[id] ?? id).toLowerCase().includes(q))
    : order;

  function toggleVisible(id: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="border-b border-border/70 px-4 py-3">
          <DialogTitle className="text-base">{title}</DialogTitle>
          <DialogDescription className="text-xs">{description}</DialogDescription>
        </DialogHeader>

        <div className="border-b border-border/50 px-3 py-2">
          <Input
            placeholder="Поиск / Qidiruv"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
            aria-label="Ustunlar bo‘yicha qidiruv"
          />
          {q ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Tartibni sudrab o‘zgartirish filtrlangan ro‘yxatda ham ishlaydi.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-0 border-b border-border/40 bg-muted/15 px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span className="pl-2">Ustun (sudrab tartiblang)</span>
          <span className="w-[5.25rem] pr-1 text-center">Ko‘rsatish</span>
        </div>

        <div className="max-h-[min(52vh,380px)] overflow-y-auto px-2 py-2">
          <ul className="flex flex-col gap-1">
            {displayOrder.length === 0 ? (
              <li className="rounded-md px-3 py-6 text-center text-sm text-muted-foreground">Mos keluvchi ustun yo‘q</li>
            ) : (
              displayOrder.map((id) => {
                const label = labelById[id] ?? id;
                const isHidden = hidden.has(id);
                const isDragging = draggingId === id;
                const isOver = overId === id && draggingId != null && draggingId !== id;
                return (
                  <li
                    key={id}
                    className={cn(
                      "flex items-stretch overflow-hidden rounded-md border transition-colors",
                      isHidden ? "border-border/50 bg-muted/30" : "border-border/60 bg-background",
                      isOver && "border-primary ring-1 ring-primary/30"
                    )}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      setOverId(id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      const raw = e.dataTransfer.getData(DND_MIME) || e.dataTransfer.getData("text/plain");
                      if (raw) setOrder((prev) => reorderByDrag(prev, raw, id));
                      setDraggingId(null);
                      setOverId(null);
                    }}
                  >
                    <div
                      className={cn(
                        "flex min-w-0 flex-1 cursor-grab items-center gap-2 px-2 py-2.5 select-none active:cursor-grabbing",
                        isDragging && "opacity-50"
                      )}
                      draggable
                      title="Ustunni ushlab boshqa qatorga torting"
                      onDragStart={(e) => {
                        e.dataTransfer.setData(DND_MIME, id);
                        e.dataTransfer.setData("text/plain", id);
                        e.dataTransfer.effectAllowed = "move";
                        setDraggingId(id);
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setOverId(null);
                      }}
                    >
                      <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className={cn("truncate text-sm", isHidden && "text-muted-foreground")}>{label}</span>
                    </div>
                    <div
                      className="flex w-[5.25rem] shrink-0 flex-col items-center justify-center gap-0.5 border-l border-border/60 bg-muted/25 px-1 py-1.5"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <label className="flex cursor-pointer flex-col items-center gap-1">
                        <span className="sr-only">{label} — jadvalda ko‘rsatish</span>
                        <span className="text-[10px] leading-none text-muted-foreground">Ko‘rsatish</span>
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={!isHidden}
                          onChange={() => toggleVisible(id)}
                          aria-label={`${label} ustunini ko‘rsatish`}
                        />
                      </label>
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <DialogFooter className="border-t border-border/70 bg-muted/25 px-3 py-3 sm:justify-between">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              onReset();
              onOpenChange(false);
            }}
          >
            Standartga qaytarish
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Bekor
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={saving}
              onClick={() => {
                onSave({
                  columnOrder: order,
                  hiddenColumnIds: Array.from(hidden)
                });
                onOpenChange(false);
              }}
            >
              {saving ? "Saqlanmoqda…" : "Saqlash"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
