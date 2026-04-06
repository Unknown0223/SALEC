"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { apiFetch, useTenant } from "@/lib/api-client";

interface Transfer {
  id: number;
  number: string;
  from_warehouse_name: string;
  to_warehouse_name: string;
  status: string;
  total_qty: string;
  transfer_date: string | null;
  created_at: string;
}

const statusLabels: Record<string, string> = {
  draft: "Qoralama",
  in_transit: "Yo'lda",
  received: "Qabul qilindi",
  cancelled: "Bekor qilindi"
};

const statusColors: Record<string, string> = {
  draft: "bg-yellow-100 text-yellow-800",
  in_transit: "bg-blue-100 text-blue-800",
  received: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800"
};

export default function TransfersPage() {
  const tenant = useTenant();
  const [loading, setLoading] = useState(true);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const limit = 20;

  async function fetchTransfers() {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(search ? { search } : {}),
      });
      const data = await apiFetch<{ data?: Transfer[]; total?: number }>(
        `/api/${tenant}/transfers?${params}`
      );
      setTransfers(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      console.error("Failed to fetch transfers:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchTransfers(); }, [tenant, page, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Omborlar Ko'chirish</h1>
          <p className="text-muted-foreground">Ombor A dan ombor B ga mahsulot ko'chirish</p>
        </div>
        <Link href="/stock/transfers/new">
          <Button>Yangi Ko'chirish</Button>
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Filtrlash</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-3 flex-wrap">
          <Select
            value={statusFilter}
            onValueChange={(v: string) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Holat" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barchasi</SelectItem>
              <SelectItem value="draft">Qoralama</SelectItem>
              <SelectItem value="in_transit">Yo'lda</SelectItem>
              <SelectItem value="received">Qabul qilindi</SelectItem>
              <SelectItem value="cancelled">Bekor qilingan</SelectItem>
            </SelectContent>
          </Select>
          <Input
            placeholder="Qidirish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64"
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="text-center py-8">Yuklanmoqda...</div>
          ) : transfers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Hech qanday ko'chirish topilmadi
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nomer</TableHead>
                  <TableHead>Dan → Ga</TableHead>
                  <TableHead>Holat</TableHead>
                  <TableHead>Miqdor</TableHead>
                  <TableHead>Sana</TableHead>
                  <TableHead className="text-right">Amallar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.number}</TableCell>
                    <TableCell>
                      {t.from_warehouse_name} → {t.to_warehouse_name}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[t.status]}>
                        {statusLabels[t.status] || t.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{t.total_qty}</TableCell>
                    <TableCell>
                      {t.transfer_date
                        ? new Date(t.transfer_date).toLocaleDateString()
                        : new Date(t.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Link href={`/stock/transfers/${t.id}`}>
                          <Button variant="outline" size="sm">Ko'rish</Button>
                        </Link>
                        {t.status === "draft" && (
                          <Button variant="default" size="sm"
                            onClick={() => apiFetch(`/api/${tenant}/transfers/${t.id}/start`, { method: "POST" }).then(fetchTransfers)}>
                            Boshlash
                          </Button>
                        )}
                        {t.status === "in_transit" && (
                          <Button variant="secondary" size="sm"
                            onClick={() => apiFetch(`/api/${tenant}/transfers/${t.id}/receive`, { method: "POST" }).then(fetchTransfers)}>
                            Qabul qilish
                          </Button>
                        )}
                        {(t.status === "draft" || t.status === "in_transit") && (
                          <Button variant="destructive" size="sm"
                            onClick={() => apiFetch(`/api/${tenant}/transfers/${t.id}/cancel`, { method: "POST" }).then(fetchTransfers)}>
                            Bekor qilish
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {total > limit && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">
                Jami: {total}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Oldingi
                </Button>
                <Button variant="outline" size="sm" disabled={page * limit >= total} onClick={() => setPage((p) => p + 1)}>
                  Keyingi
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
