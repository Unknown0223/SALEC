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
  title = "Управление столбцами",
  description = "Видимые столбцы и порядок сохраняются для вашей учётной записи.",
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
      <DialogContent
        className={cn(
          "max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-md",
          "border border-border/60 bg-card",
          "shadow-lg shadow-black/[0.07] dark:border-border/80 dark:shadow-black/30",
          "ring-0"
        )}
      >
        <DialogHeader className="space-y-1.5 border-b border-border/60 px-5 pb-4 pt-5 pr-14">
          <DialogTitle className="text-base font-semibold leading-snug">{title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="border-b border-border/50 bg-muted/20 px-5 py-4">
          <Input
            placeholder="Поиск по названию столбца…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-lg border-border/80 bg-background text-sm shadow-sm"
            aria-label="Поиск столбца"
          />
          {q ? (
            <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">
              Перетаскивание для сортировки работает и в отфильтрованном списке.
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-[1fr_3.5rem] items-center gap-0 border-b border-border/50 bg-muted/30 px-5 py-2.5 text-xs font-medium text-muted-foreground">
          <span className="pl-1">Столбец (перетащите для порядка)</span>
          <span className="flex justify-center text-center leading-tight" title="Показать в таблице">
            Показать
          </span>
        </div>

        <div className="max-h-[min(52vh,380px)] overflow-y-auto px-5 py-4">
          <ul className="flex flex-col gap-2">
            {displayOrder.length === 0 ? (
              <li className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-8 text-center text-sm text-muted-foreground">
                Нет столбцов по запросу
              </li>
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
                      "flex min-h-[3rem] items-center overflow-hidden rounded-lg border transition-colors",
                      isHidden ? "border-border/50 bg-muted/25" : "border-border/60 bg-background",
                      isOver && "border-primary ring-2 ring-primary/20"
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
                        "flex min-w-0 flex-1 cursor-grab items-center gap-3 px-3 py-2.5 select-none active:cursor-grabbing",
                        isDragging && "opacity-50"
                      )}
                      draggable
                      title="Перетащите строку, чтобы изменить порядок столбцов"
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
                      <GripVertical
                        className="size-4 shrink-0 text-muted-foreground/80"
                        aria-hidden
                      />
                      <span className={cn("min-w-0 flex-1 truncate text-sm", isHidden && "text-muted-foreground")}>
                        {label}
                      </span>
                    </div>
                    <div
                      className="flex h-full min-h-[3rem] w-14 shrink-0 items-center justify-center border-l border-border/50 bg-muted/15 px-2"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        className="size-[1.125rem] shrink-0 rounded border-border accent-primary"
                        checked={!isHidden}
                        onChange={() => toggleVisible(id)}
                        aria-label={`Показать столбец «${label}»`}
                      />
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        <DialogFooter
          className={cn(
            "!mx-0 !mb-0 gap-3 rounded-none border-t border-border/60 bg-muted/20 px-5 py-4 pb-5 pt-4",
            "flex-col-reverse sm:flex-row sm:items-center sm:justify-between"
          )}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full shrink-0 sm:w-auto"
            onClick={() => {
              onReset();
              onOpenChange(false);
            }}
          >
            Сбросить к умолчанию
          </Button>
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              size="sm"
              className="w-full sm:w-auto"
              disabled={saving}
              onClick={() => {
                onSave({
                  columnOrder: order,
                  hiddenColumnIds: Array.from(hidden)
                });
                onOpenChange(false);
              }}
            >
              {saving ? "Сохранение…" : "Сохранить"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
