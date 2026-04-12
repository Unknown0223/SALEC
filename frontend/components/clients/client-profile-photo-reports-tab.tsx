"use client";

import { buttonVariants } from "@/components/ui/button-variants";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImagePlus, Trash2 } from "lucide-react";
import { useState } from "react";

export type ClientPhotoRow = {
  id: number;
  image_url: string;
  caption: string | null;
  order_id: number | null;
  created_at: string;
};

export function ClientProfilePhotoReportsTab({ tenantSlug, clientId }: { tenantSlug: string; clientId: number }) {
  const qc = useQueryClient();
  const [imageUrl, setImageUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [orderId, setOrderId] = useState("");

  const listQ = useQuery({
    queryKey: ["client-photo-reports", tenantSlug, clientId],
    staleTime: STALE.list,
    queryFn: async () => {
      const { data } = await api.get<{ data: ClientPhotoRow[] }>(`/api/${tenantSlug}/clients/${clientId}/photo-reports`);
      return data.data;
    }
  });

  const addM = useMutation({
    mutationFn: async () => {
      const oid = orderId.trim() ? Number.parseInt(orderId.trim(), 10) : null;
      const { data } = await api.post<ClientPhotoRow>(`/api/${tenantSlug}/clients/${clientId}/photo-reports`, {
        image_url: imageUrl.trim(),
        caption: caption.trim() || null,
        order_id: oid != null && Number.isFinite(oid) && oid > 0 ? oid : null
      });
      return data;
    },
    onSuccess: () => {
      setImageUrl("");
      setCaption("");
      setOrderId("");
      void qc.invalidateQueries({ queryKey: ["client-photo-reports", tenantSlug, clientId] });
    }
  });

  const delM = useMutation({
    mutationFn: async (photoId: number) => {
      await api.delete(`/api/${tenantSlug}/clients/${clientId}/photo-reports/${photoId}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["client-photo-reports", tenantSlug, clientId] });
    }
  });

  const rows = listQ.data ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm font-medium">Фотоотчёты</p>
      <Card className="border border-border/90 shadow-panel">
        <CardContent className="space-y-3 p-3 sm:p-4">
          <p className="text-xs text-muted-foreground">
            Добавьте ссылку на изображение (CDN, облако или публичный URL). Загрузка файла на сервер — позже.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">URL изображения *</Label>
              <Input className="h-9" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Подпись</Label>
              <Input className="h-9" value={caption} onChange={(e) => setCaption(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">ID заказа (необязательно)</Label>
              <Input className="h-9" value={orderId} onChange={(e) => setOrderId(e.target.value)} inputMode="numeric" />
            </div>
          </div>
          <button
            type="button"
            className={cn(buttonVariants({ size: "sm" }), "gap-1.5 bg-teal-600 text-white hover:bg-teal-700")}
            disabled={!imageUrl.trim() || addM.isPending}
            onClick={() => void addM.mutateAsync()}
          >
            <ImagePlus className="h-4 w-4" />
            Добавить в фотографии
          </button>
          {addM.isError ? <p className="text-xs text-destructive">Не удалось сохранить (проверьте URL и заказ).</p> : null}
        </CardContent>
      </Card>

      {listQ.isLoading ? (
        <p className="text-sm text-muted-foreground">Загрузка…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Пока нет фото.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {rows.map((r) => (
            <li key={r.id} className="group relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={r.image_url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
              <div className="space-y-1 p-2">
                {r.caption ? <p className="line-clamp-2 text-xs text-foreground">{r.caption}</p> : null}
                <p className="text-[10px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}
                  {r.order_id != null ? ` · заказ #${r.order_id}` : ""}
                </p>
                <button
                  type="button"
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-8 w-full text-xs text-destructive")}
                  disabled={delM.isPending}
                  onClick={() => {
                    if (confirm("Удалить фото?")) void delM.mutateAsync(r.id);
                  }}
                >
                  <Trash2 className="mr-1 inline h-3.5 w-3.5" />
                  Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
