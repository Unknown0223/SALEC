"use client";

import { Badge } from "@/components/ui/badge";

export type ClientImportStage =
  | "idle"
  | "uploading"
  | "queued"
  | "parsing"
  | "resolving"
  | "writing"
  | "finalizing"
  | "done"
  | "failed";

export type ClientImportProgressModel = {
  stage: ClientImportStage;
  percent: number;
  processedRows: number;
  totalRows: number;
  message?: string;
};

function stageLabel(stage: ClientImportStage): string {
  if (stage === "uploading") return "Загрузка файла";
  if (stage === "queued") return "В очереди";
  if (stage === "parsing") return "Чтение Excel";
  if (stage === "resolving") return "Сопоставление";
  if (stage === "writing") return "Запись в базу";
  if (stage === "finalizing") return "Завершение";
  if (stage === "done") return "Готово";
  if (stage === "failed") return "Ошибка";
  return "Ожидание";
}

function stageVariant(stage: ClientImportStage): "info" | "warning" | "success" | "destructive" | "secondary" {
  if (stage === "failed") return "destructive";
  if (stage === "done") return "success";
  if (stage === "queued") return "warning";
  if (stage === "idle") return "secondary";
  return "info";
}

export function ClientImportProgress({ progress }: { progress: ClientImportProgressModel | null }) {
  if (!progress || progress.stage === "idle") return null;
  const ratio =
    progress.totalRows > 0 ? Math.min(100, (progress.processedRows / progress.totalRows) * 100) : 0;
  return (
    <div className="rounded-md border border-border/70 bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge variant={stageVariant(progress.stage)}>{stageLabel(progress.stage)}</Badge>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {progress.totalRows > 0
            ? `${progress.processedRows} / ${progress.totalRows}`
            : progress.stage === "uploading"
              ? "—"
              : "—"}
        </span>
      </div>
      {progress.totalRows > 0 ? (
        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
          <div className="bg-primary h-full transition-[width] duration-300" style={{ width: `${ratio}%` }} />
        </div>
      ) : null}
      <div className="text-muted-foreground mt-2 flex items-start justify-between gap-2 text-xs">
        <span>
          {progress.stage === "uploading"
            ? "Загрузка файла"
            : progress.totalRows > 0
              ? "Обработано строк"
              : "Подготовка…"}
        </span>
        {progress.message ? <span className="min-w-0 flex-1 truncate text-right">{progress.message}</span> : null}
      </div>
    </div>
  );
}
