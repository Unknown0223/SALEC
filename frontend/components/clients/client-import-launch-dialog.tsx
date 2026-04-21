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
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { useRef, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "update";
  busy?: boolean;
  onDownloadTemplate: () => Promise<void> | void;
  onConfirm: (file: File) => void;
};

export function ClientImportLaunchDialog({
  open,
  onOpenChange,
  mode,
  busy = false,
  onDownloadTemplate,
  onConfirm
}: Props) {
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setErr(null);
    if (hiddenInputRef.current) hiddenInputRef.current.value = "";
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-[26rem] border-border/70 p-0">
        <DialogHeader className="border-b border-border/70 px-4 py-3">
          <DialogTitle>{mode === "update" ? "Обновление клиентов с Excel" : "Импорт клиент"}</DialogTitle>
          <DialogDescription>
            Выберите файл Excel и сохраните. При необходимости сначала скачайте шаблон.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">Шаг 1: скачайте шаблон</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => void onDownloadTemplate()}
            >
              <Download className="h-3.5 w-3.5" />
              Скачать шаблон
            </Button>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Шаг 2: выберите файл Excel</p>
            <input
              ref={hiddenInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                setErr(null);
                setFile(e.target.files?.[0] ?? null);
              }}
            />
            <div className="flex items-center gap-2 rounded-md border border-border/70 bg-muted/20 px-2.5 py-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => hiddenInputRef.current?.click()}
              >
                <FileSpreadsheet className="h-3.5 w-3.5" />
                Выбрать Excel файл
              </Button>
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {file ? file.name : "Файл не выбран"}
              </span>
            </div>
            {err ? <p className="text-xs text-destructive">{err}</p> : null}
          </div>
        </div>

        <DialogFooter className="border-t border-border/70 px-4 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy} className="h-8">
            Отмена
          </Button>
          <Button
            type="button"
            disabled={busy}
            className="h-8 gap-1.5 bg-teal-700 text-white hover:bg-teal-800"
            onClick={() => {
              if (!file) {
                setErr("Сначала выберите Excel файл.");
                return;
              }
              onConfirm(file);
            }}
          >
            <Upload className="h-3.5 w-3.5" />
            Сохранить
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
