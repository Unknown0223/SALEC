"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { apiFetch, useTenant } from "@/lib/api-client";
import { isDatabaseSchemaMismatchError } from "@/lib/api-errors";
import { DatabaseSchemaMismatchCallout } from "@/components/system/database-schema-mismatch-callout";

interface Territory {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean;
  user_count: number;
  deleted_at?: string | null;
}

export default function TerritoriesPage() {
  const tenant = useTenant();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Territory[]>([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [archiveOnly, setArchiveOnly] = useState(false);
  const [schemaMismatch, setSchemaMismatch] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const fetchTerritories = useCallback(async () => {
    try {
      setLoading(true);
      setSchemaMismatch(false);
      setLoadError(false);
      const params = new URLSearchParams({ page: "1", limit: "100" });
      if (archiveOnly) {
        params.set("archive", "true");
      } else if (activeFilter !== "all") {
        params.set("is_active", activeFilter === "active" ? "true" : "false");
      }
      const data = await apiFetch<{ data?: Territory[] }>(`/api/${tenant}/territories?${params}`);
      setItems(data.data ?? []);
    } catch (e) {
      if (isDatabaseSchemaMismatchError(e)) setSchemaMismatch(true);
      else {
        setLoadError(true);
        console.error(e);
      }
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tenant, activeFilter, archiveOnly]);

  const handleRestoreTerritory = async (id: number) => {
    if (!confirm(`Hudud #${id} ni tiklash?`)) return;
    try {
      await apiFetch(`/api/${tenant}/territories/${id}/restore`, { method: "POST" });
      await fetchTerritories();
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => { void fetchTerritories(); }, [fetchTerritories]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Hududlar (Territories)</h1>

      {schemaMismatch && <DatabaseSchemaMismatchCallout />}
      {!loading && loadError && !schemaMismatch && (
        <p className="text-sm text-destructive" role="alert">
          Ma’lumotlarni yuklab bo‘lmadi.
        </p>
      )}

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>Filtrlash</CardTitle>
            <Select
              value={archiveOnly ? "__archive__" : activeFilter}
              onValueChange={(v) => {
                if (v === "__archive__") {
                  setArchiveOnly(true);
                } else {
                  setArchiveOnly(false);
                  setActiveFilter(v);
                }
              }}
            >
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barchasi</SelectItem>
                <SelectItem value="active">Faol</SelectItem>
                <SelectItem value="inactive">Nofaol</SelectItem>
                <SelectItem value="__archive__">Arxiv</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="py-8 text-center">Загрузка…</div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomi</TableHead>
                  <TableHead>Kod</TableHead>
                  <TableHead>Agentlar</TableHead>
                  <TableHead>Holat</TableHead>
                  {archiveOnly ? <TableHead className="text-right">Amallar</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.code || "—"}</TableCell>
                    <TableCell>{t.user_count}</TableCell>
                    <TableCell>
                      <Badge className={t.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                        {archiveOnly ? "Arxiv" : t.is_active ? "Faol" : "Nofaol"}
                      </Badge>
                    </TableCell>
                    {archiveOnly ? (
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => void handleRestoreTerritory(t.id)}>
                          Tiklash
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
