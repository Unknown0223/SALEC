"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, useTenant } from "@/lib/api-client";
import { isDatabaseSchemaMismatchError } from "@/lib/api-errors";
import { DatabaseSchemaMismatchCallout } from "@/components/system/database-schema-mismatch-callout";

interface Territory {
  id: number;
  name: string;
  code: string | null;
  assigned_user_name: string | null;
  is_active: boolean;
  users_count: number;
}

export default function TerritoriesPage() {
  const tenant = useTenant();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Territory[]>([]);
  const [activeFilter, setActiveFilter] = useState("all");
  const [schemaMismatch, setSchemaMismatch] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const fetchTerritories = useCallback(async () => {
    try {
      setLoading(true);
      setSchemaMismatch(false);
      setLoadError(false);
      const params = new URLSearchParams({
        page: "1", limit: "100",
        ...(activeFilter !== "all" ? { is_active: activeFilter === "active" ? "true" : "false" } : {})
      });
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
  }, [tenant, activeFilter]);

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
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barchasi</SelectItem>
                <SelectItem value="active">Faol</SelectItem>
                <SelectItem value="inactive">Nofaol</SelectItem>
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
                  <TableHead>Biriktilgan</TableHead>
                  <TableHead>Holat</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell>{t.code || "—"}</TableCell>
                    <TableCell>{t.assigned_user_name ?? t.users_count}</TableCell>
                    <TableCell>
                      <Badge className={t.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                        {t.is_active ? "Faol" : "Nofaol"}
                      </Badge>
                    </TableCell>
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
