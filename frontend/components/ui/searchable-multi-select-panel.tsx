"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const checkboxCls =
  "mt-0.5 h-4 w-4 shrink-0 rounded border border-input accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export type SearchableMultiSelectItem<T extends string | number = number> = {
  id: T;
  title: string;
  subtitle?: string | null;
};

type Props<T extends string | number> = {
  label: string;
  items: SearchableMultiSelectItem<T>[];
  selected: Set<T>;
  onSelectedChange: React.Dispatch<React.SetStateAction<Set<T>>>;
  /** false — qidiruv yo‘q (qisqa ro‘yxatlar, masalan hafta kunlari) */
  searchable?: boolean;
  searchPlaceholder?: string;
  search?: string;
  onSearchChange?: (value: string) => void;
  loading?: boolean;
  emptyMessage?: string;
  maxListHeightClass?: string;
  className?: string;
  selectAllLabel?: string;
  clearVisibleLabel?: string;
  /** Yopiq holatdagi tugma matni (tanlanmagan bo‘lsa) */
  triggerPlaceholder?: string;
  /** Minimal dropdown kengligi (px) */
  minPopoverWidth?: number;
};

function HeaderSelectAllCheckbox({
  allSelected,
  someSelected,
  disabled,
  onChange
}: {
  allSelected: boolean;
  someSelected: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.indeterminate = someSelected;
  }, [someSelected]);
  return (
    <input
      ref={ref}
      type="checkbox"
      className={checkboxCls}
      checked={allSelected}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

function rowKey<T extends string | number>(id: T) {
  return `${typeof id}:${String(id)}`;
}

/**
 * Bosilganda ochiladigan ko‘p tanlov: qidiruv + checkboxlar + «выбрать все».
 * Dialog ichida kesilmasligi uchun ro‘yxat `document.body` ga portal qilinadi.
 */
export function SearchableMultiSelectPanel<T extends string | number = number>({
  label,
  items,
  selected,
  onSelectedChange,
  searchable = true,
  searchPlaceholder = "Поиск",
  search = "",
  onSearchChange = () => {},
  loading = false,
  emptyMessage = "Нет строк",
  maxListHeightClass = "max-h-52",
  className,
  selectAllLabel = "Выбрать все на экране",
  clearVisibleLabel = "Снять на экране",
  triggerPlaceholder = "Нажмите, чтобы выбрать",
  minPopoverWidth = 300
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [coords, setCoords] = useState({ top: 0, left: 0, width: minPopoverWidth });

  useEffect(() => setMounted(true), []);

  const visibleIds = items.map((i) => i.id);
  const hasVisible = visibleIds.length > 0;
  const allVisibleSelected = hasVisible && visibleIds.every((id) => selected.has(id));
  const someVisibleSelected =
    hasVisible && visibleIds.some((id) => selected.has(id)) && !allVisibleSelected;

  const updatePosition = useCallback(() => {
    const t = triggerRef.current;
    if (!t) return;
    const r = t.getBoundingClientRect();
    const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
    const w = Math.min(Math.max(r.width, minPopoverWidth), vw - 16);
    let left = r.left;
    if (left + w > vw - 8) left = Math.max(8, vw - w - 8);
    setCoords({
      top: r.bottom + 6,
      left,
      width: w
    });
  }, [minPopoverWidth]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updatePosition) : null;
    if (ro && triggerRef.current) ro.observe(triggerRef.current);
    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);
    return () => {
      ro?.disconnect();
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const node = e.target as Node;
      if (triggerRef.current?.contains(node)) return;
      if (popRef.current?.contains(node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggleVisibleAll = (checked: boolean) => {
    onSelectedChange((prev) => {
      const n = new Set(prev);
      if (checked) {
        for (const id of visibleIds) n.add(id);
      } else {
        for (const id of visibleIds) n.delete(id);
      }
      return n;
    });
  };

  const clearVisible = () => {
    onSelectedChange((prev) => {
      const n = new Set(prev);
      for (const id of visibleIds) n.delete(id);
      return n;
    });
  };

  const toggleOne = (id: T, checked: boolean) => {
    onSelectedChange((prev) => {
      const n = new Set(prev);
      if (checked) n.add(id);
      else n.delete(id);
      return n;
    });
  };

  const triggerSummary =
    selected.size === 0 ? triggerPlaceholder : `Выбрано: ${selected.size}`;

  const searchActive = searchable && search.trim().length > 0;

  const popoverContent = (
    <div
      ref={popRef}
      id={listId}
      role="listbox"
      aria-multiselectable
      className={cn(
        "fixed z-[500] flex max-h-[min(55vh,420px)] flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-lg ring-1 ring-black/5 dark:ring-white/10"
      )}
      style={{
        top: coords.top,
        left: coords.left,
        width: coords.width
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border/80 bg-muted/40 px-3 py-2">
        <span className="text-xs font-semibold tracking-tight">{label}</span>
        <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
          {selected.size} выбр.
        </span>
      </div>

      {searchable ? (
        <div className="relative shrink-0 border-b border-border/60 px-3 py-2">
          <Search
            className="pointer-events-none absolute left-5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="h-9 border-input bg-background pl-9 text-sm shadow-none"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label={searchPlaceholder}
          />
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/15 px-3 py-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
          <HeaderSelectAllCheckbox
            allSelected={allVisibleSelected}
            someSelected={someVisibleSelected}
            disabled={!hasVisible || loading}
            onChange={(checked) => toggleVisibleAll(checked)}
          />
          <span>{selectAllLabel}</span>
        </label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
          disabled={!hasVisible || loading}
          onClick={clearVisible}
        >
          {clearVisibleLabel}
        </Button>
      </div>

      <div className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", maxListHeightClass)}>
        {loading ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">Загрузка…</p>
        ) : items.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {items.map((item) => {
              const isOn = selected.has(item.id);
              return (
                <li key={rowKey(item.id)} role="option" aria-selected={isOn}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 px-3 py-2 text-sm transition-colors hover:bg-muted/50",
                      isOn && "bg-primary/[0.06]"
                    )}
                  >
                    <input
                      type="checkbox"
                      className={checkboxCls}
                      checked={isOn}
                      onChange={(e) => toggleOne(item.id, e.target.checked)}
                    />
                    <span className="min-w-0 flex-1">
                      {item.subtitle ? (
                        <span className="block font-mono text-[10px] font-medium leading-tight text-muted-foreground">
                          {item.subtitle}
                        </span>
                      ) : null}
                      <span className="block leading-snug">{item.title}</span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-border/60 bg-muted/20 px-3 py-1.5 text-[10px] text-muted-foreground">
        На экране: <span className="font-medium tabular-nums text-foreground/80">{items.length}</span>
        {searchActive ? " (по поиску)" : ""}
      </div>
    </div>
  );

  return (
    <div className={cn("w-full", className)}>
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm shadow-sm outline-none transition-colors",
          "hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          open && "ring-2 ring-ring ring-offset-2"
        )}
        aria-expanded={open}
        aria-controls={listId}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <span className={cn("min-w-0 flex-1 truncate", selected.size === 0 && "text-muted-foreground")}>
          {triggerSummary}
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {mounted && open ? createPortal(popoverContent, document.body) : null}
    </div>
  );
}
