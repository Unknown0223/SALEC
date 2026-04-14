"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { CLIENT_IMPORT_MAPPABLE_FIELDS } from "@/lib/client-import-fields";
import {
  mergeAutoClientImportColumns,
  rowToHeaderLabels,
  suggestColumnMapping
} from "@/lib/client-import-header-match";
import type { WorkBook, WorkSheet } from "xlsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const selectClass =
  "border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full min-w-0 rounded-md border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2";

export type ClientImportMappingPayload = {
  columnMap: Record<string, number>;
  sheetName: string;
  headerRowIndex: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  isSubmitting: boolean;
  /** «create» — yangi; «update» — ИД ustuni majburiy */
  importMode?: "create" | "update";
  onConfirm: (payload: ClientImportMappingPayload) => void;
};

type XlsxNs = typeof import("xlsx");

function sheetToMatrix(XLSX: XlsxNs, ws: WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false
  }) as unknown[][];
}

export function ClientImportMappingDialog({
  open,
  onOpenChange,
  file,
  isSubmitting,
  importMode = "create",
  onConfirm
}: Props) {
  const [parseError, setParseError] = useState<string | null>(null);
  const xlsxModRef = useRef<XlsxNs | null>(null);
  const [workbook, setWorkbook] = useState<WorkBook | null>(null);
  const [sheetName, setSheetName] = useState("");
  /** 1-based (Excel qatori), foydalanuvchiga tushunarli */
  const [headerRowOneBased, setHeaderRowOneBased] = useState(1);
  const [mappingSelect, setMappingSelect] = useState<Record<string, string>>({});
  const [localErr, setLocalErr] = useState<string | null>(null);

  const resetState = useCallback(() => {
    xlsxModRef.current = null;
    setParseError(null);
    setWorkbook(null);
    setSheetName("");
    setHeaderRowOneBased(1);
    setMappingSelect({});
    setLocalErr(null);
  }, []);

  useEffect(() => {
    if (!open || !file) {
      if (!open) resetState();
      return;
    }

    setParseError(null);
    setLocalErr(null);
    const reader = new FileReader();
    reader.onload = () => {
      void (async () => {
        try {
          const XLSX = await import("xlsx");
          xlsxModRef.current = XLSX;
          const buf = reader.result as ArrayBuffer;
          const wb = XLSX.read(buf, { type: "array", cellDates: true, sheetRows: 120 });
          if (!wb.SheetNames.length) {
            setParseError("В файле нет листов.");
            setWorkbook(null);
            return;
          }
          setWorkbook(wb);
          setSheetName(wb.SheetNames[0] ?? "");
          setHeaderRowOneBased(1);
        } catch {
          setParseError("Не удалось прочитать файл Excel.");
          setWorkbook(null);
        }
      })();
    };
    reader.onerror = () => {
      setParseError("Файл не прочитан.");
      setWorkbook(null);
    };
    reader.readAsArrayBuffer(file);
  }, [open, file, resetState]);

  const matrix = useMemo(() => {
    const XLSX = xlsxModRef.current;
    if (!workbook || !sheetName || !XLSX) return [] as unknown[][];
    const ws = workbook.Sheets[sheetName];
    if (!ws) return [];
    return sheetToMatrix(XLSX, ws);
  }, [workbook, sheetName]);

  const headerRowIdx = Math.max(0, headerRowOneBased - 1);
  const fileColumnLabels = useMemo(() => {
    const row = matrix[headerRowIdx];
    return rowToHeaderLabels(row);
  }, [matrix, headerRowIdx]);

  useEffect(() => {
    if (!open || !workbook || !sheetName || matrix.length === 0) return;
    if (headerRowIdx >= matrix.length) return;
    const row = matrix[headerRowIdx];
    if (!Array.isArray(row)) return;
    const headers = row.map((c) => (c == null ? "" : String(c)));
    const suggested = suggestColumnMapping(headers);
    const next: Record<string, string> = {};
    for (const { key } of CLIENT_IMPORT_MAPPABLE_FIELDS) {
      if (suggested[key] !== undefined) next[key] = String(suggested[key]);
      else next[key] = "";
    }
    setMappingSelect(next);
  }, [open, workbook, sheetName, matrix, headerRowIdx]);

  const applyAutoMap = () => {
    if (headerRowIdx >= matrix.length) return;
    const row = matrix[headerRowIdx];
    if (!Array.isArray(row)) return;
    const headers = row.map((c) => (c == null ? "" : String(c)));
    const suggested = suggestColumnMapping(headers);
    setMappingSelect((prev) => {
      const next = { ...prev };
      for (const { key } of CLIENT_IMPORT_MAPPABLE_FIELDS) {
        if (suggested[key] !== undefined) next[key] = String(suggested[key]);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    setLocalErr(null);
    const columnMap: Record<string, number> = {};
    for (const { key } of CLIENT_IMPORT_MAPPABLE_FIELDS) {
      const v = mappingSelect[key];
      if (v === "" || v === undefined) continue;
      const n = Number.parseInt(v, 10);
      if (Number.isFinite(n) && n >= 0) columnMap[key] = n;
    }
    const headerCells = matrix[headerRowIdx];
    const headers = Array.isArray(headerCells)
      ? headerCells.map((c) => (c == null ? "" : String(c)))
      : [];
    const merged = mergeAutoClientImportColumns(headers, columnMap);
    if (importMode === "create" && merged.client_db_id !== undefined) {
      delete merged.client_db_id;
    }
    if (importMode === "update") {
      if (merged.client_db_id === undefined) {
        setLocalErr('Укажите столбец «ИД» (внутренний id клиента в системе) — обязательно для обновления.');
        return;
      }
    } else if (merged.name === undefined) {
      setLocalErr("Укажите столбец «Наименование» — обязательно для новых клиентов.");
      return;
    }
    onConfirm({
      columnMap: merged,
      sheetName,
      headerRowIndex: headerRowIdx
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,720px)] max-w-3xl flex-col gap-0 p-0 sm:max-w-3xl"
        showCloseButton={!isSubmitting}
      >
        <div className="border-b border-border/80 p-4">
          <DialogHeader>
            <DialogTitle>
              {importMode === "update"
                ? "Обновление клиентов из Excel"
                : "Импорт Excel — сопоставление столбцов"}
            </DialogTitle>
            <DialogDescription>
              {file ? (
                <span className="break-all">
                  Файл: <strong>{file.name}</strong>
                  {importMode === "update"
                    ? " — строки с «ИД» из системы; пустые ячейки не перезаписывают поля. Столбцы «Агент N» подхватываются автоматически по заголовку."
                    : " — для каждого поля системы выберите столбец. «Агент 1…10» можно не мапить вручную."}
                </span>
              ) : (
                "Файл не выбран."
              )}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {parseError ? (
            <p className="text-sm text-destructive">{parseError}</p>
          ) : !workbook ? (
            <p className="text-muted-foreground text-sm">Чтение файла…</p>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[10rem] flex-1 space-y-1.5">
                  <Label htmlFor="import-sheet">Лист</Label>
                  <select
                    id="import-sheet"
                    className={selectClass}
                    value={sheetName}
                    disabled={isSubmitting}
                    onChange={(e) => setSheetName(e.target.value)}
                  >
                    {workbook.SheetNames.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-36 space-y-1.5">
                  <Label htmlFor="import-header-row">Строка заголовков (Excel)</Label>
                  <input
                    id="import-header-row"
                    type="number"
                    min={1}
                    max={Math.max(1, matrix.length)}
                    className={selectClass}
                    disabled={isSubmitting || matrix.length === 0}
                    value={headerRowOneBased}
                    onChange={(e) => {
                      const n = Number.parseInt(e.target.value, 10);
                      if (Number.isFinite(n) && n >= 1) setHeaderRowOneBased(n);
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isSubmitting || matrix.length === 0}
                  onClick={() => applyAutoMap()}
                >
                  Автосопоставление
                </Button>
              </div>

              {headerRowIdx >= matrix.length ? (
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Строка заголовков вне таблицы. Введите номер от {1} до {Math.max(1, matrix.length)}.
                </p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-x-4">
                  {CLIENT_IMPORT_MAPPABLE_FIELDS.map(({ key, label }) => (
                    <div key={key} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-2">
                      <Label className="text-muted-foreground shrink-0 text-xs sm:w-[40%] sm:text-sm">
                        {label}
                      </Label>
                      <select
                        className={selectClass}
                        disabled={isSubmitting || fileColumnLabels.length === 0}
                        value={mappingSelect[key] ?? ""}
                        onChange={(e) =>
                          setMappingSelect((m) => ({
                            ...m,
                            [key]: e.target.value
                          }))
                        }
                      >
                        <option value="">— не выбрано —</option>
                        {fileColumnLabels.map((colLabel, idx) => (
                          <option key={`${key}-${idx}`} value={String(idx)}>
                            {idx + 1}. {colLabel}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="border-t border-border/80 bg-muted/30 p-4 sm:justify-between">
          <div className="text-destructive min-h-[1.25rem] text-xs sm:flex-1">{localErr}</div>
          <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row">
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button
              type="button"
              disabled={
                isSubmitting || !!parseError || !workbook || headerRowIdx >= matrix.length || !file
              }
              onClick={() => handleConfirm()}
            >
              {isSubmitting
                ? importMode === "update"
                  ? "Обновление…"
                  : "Импорт…"
                : importMode === "update"
                  ? "Сохранить (обновить)"
                  : "Начать импорт"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
