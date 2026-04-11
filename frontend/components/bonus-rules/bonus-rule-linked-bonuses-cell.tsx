"use client";

import type { BonusRuleRow } from "@/components/bonus-rules/bonus-rule-types";
import { BonusRulePrerequisitesPickerPanels } from "@/components/bonus-rules/bonus-rule-prerequisites-picker-panels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { api } from "@/lib/api";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  tenantSlug: string;
  row: BonusRuleRow;
  onSaved?: () => void;
};

export function BonusRuleLinkedBonusesCell({ tenantSlug, row, onSaved }: Props) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [draftIds, setDraftIds] = useState<number[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hoverOpen, setHoverOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverClose = useCallback(() => {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openHover = useCallback(() => {
    clearHoverClose();
    setHoverOpen(true);
  }, [clearHoverClose]);

  const scheduleCloseHover = useCallback(() => {
    clearHoverClose();
    closeTimerRef.current = setTimeout(() => setHoverOpen(false), 140);
  }, [clearHoverClose]);

  useEffect(() => () => clearHoverClose(), [clearHoverClose]);

  const handleDialogOpenChange = useCallback(
    (next: boolean) => {
      setDialogOpen(next);
      setErrorMsg(null);
      if (next) {
        setDraftIds([...(row.prerequisite_rule_ids ?? [])]);
      }
    },
    [row.prerequisite_rule_ids]
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      await api.put(`/api/${tenantSlug}/bonus-rules/${row.id}`, {
        prerequisite_rule_ids: draftIds
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bonus-rules", tenantSlug] });
      onSaved?.();
      setDialogOpen(false);
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === "object" && "response" in e
          ? String((e as { response?: { data?: { message?: string; error?: string } } }).response?.data?.message ?? "")
          : "";
      setErrorMsg(msg || "Ошибка сохранения");
    }
  });

  const prereqIds = row.prerequisite_rule_ids ?? [];
  const prereqCount = prereqIds.length;
  const summaries = row.prerequisite_summaries;
  const hoverList: string[] | null =
    prereqCount === 0
      ? null
      : summaries && summaries.length === prereqIds.length
        ? summaries
        : null;

  return (
    <div
      className="relative inline-flex items-center gap-1.5"
      onMouseEnter={openHover}
      onMouseLeave={scheduleCloseHover}
    >
      {hoverOpen ? (
        <div
          className="absolute bottom-full left-1/2 z-50 mb-1.5 w-max min-w-[12rem] max-w-[min(22rem,calc(100vw-1.5rem))] -translate-x-1/2 rounded-md border border-border/80 bg-popover px-2.5 py-2 text-popover-foreground shadow-md"
          role="tooltip"
          onMouseEnter={openHover}
          onMouseLeave={scheduleCloseHover}
        >
          <p className="mb-1.5 border-b border-border/60 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Предварительные условия (только текст правила)
          </p>
          {prereqCount === 0 ? (
            <p className="max-w-xs text-[11px] leading-snug text-muted-foreground">
              Нет связей. Нажмите «+», чтобы выбрать другой бонус или скидку.
            </p>
          ) : hoverList ? (
            <ul className="max-h-44 space-y-1.5 overflow-y-auto pr-0.5">
              {hoverList.map((line, i) => (
                <li
                  key={`${row.id}-prereq-${i}`}
                  className="font-mono text-[11px] leading-snug text-foreground/90"
                >
                  {line}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Обновите список — условия приходят с сервера.
            </p>
          )}
        </div>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <Button
          type="button"
          size="icon-sm"
          variant="outline"
          className="shrink-0 border-primary/60 text-primary hover:bg-primary/10 hover:text-primary"
          title="Связать"
          aria-label="Выбрать связанные правила"
          onClick={(e) => {
            e.stopPropagation();
            handleDialogOpenChange(true);
          }}
        >
          <Plus className="size-3.5" />
        </Button>
        <DialogContent className="max-w-3xl gap-0 p-0 sm:max-w-3xl" showCloseButton>
          <DialogHeader className="border-b border-border/60 px-4 py-3">
            <DialogTitle className="text-base">Связанные правила — {row.name}</DialogTitle>
            <p className="text-xs font-normal text-muted-foreground">
              Выберите другие бонусы или скидки, которые должны сработать в заказе до применения этого правила.
            </p>
          </DialogHeader>
          <BonusRulePrerequisitesPickerPanels
            tenantSlug={tenantSlug}
            excludeRuleId={row.id}
            value={draftIds}
            onChange={setDraftIds}
            fetchEnabled={dialogOpen}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/30 px-3 py-2">
            {errorMsg ? <p className="text-xs text-destructive">{errorMsg}</p> : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => handleDialogOpenChange(false)}>
                Отмена
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={saveMut.isPending}
                onClick={() => saveMut.mutate()}
              >
                {saveMut.isPending ? "Сохранение…" : "Сохранить"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {prereqCount > 0 ? (
        <span className="tabular-nums text-foreground/85" title={`Связано правил: ${prereqCount}`}>
          {prereqCount}
        </span>
      ) : null}
    </div>
  );
}
