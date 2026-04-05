"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch, useTenant } from "@/lib/api-client";

interface Expense {
  id: number;
  expense_type: string;
  amount: string;
  currency: string;
  status: string;
  expense_date: string;
  agent_name: string | null;
  warehouse_name: string | null;
  created_by_name: string | null;
}

interface PnlReport {
  revenue: string;
  total_expenses_approved: string;
  total_expenses_draft: string;
  net_profit: string;
}

const typeMap: Record<string, string> = {
  transport: "Transport", marketing: "Marketing", rent: "Ijara", salary: "Ish haqi",
  office: "Ofis", other: "Boshqa", draft: "Qoralama", approved: "Tasdiqlangan", rejected: "Rad etilgan"
};

export default function ExpensesPage() {
  const tenant = useTenant();
  const [loading, setLoading] = useState(true);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [pnl, setPnl] = useState<PnlReport | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  async function fetchAll() {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: String(page), limit: "20",
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
      });
      const [data, pnlData] = await Promise.all([
        apiFetch(`/api/${tenant}/expenses?${params}`),
        apiFetch(`/api/${tenant}/expenses/pnl`)
      ]);
      setExpenses(data.data || []);
      setTotal(data.total || 0);
      setPnl(pnlData);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchAll(); }, [tenant, page, statusFilter]);

  const handleAction = async (id: number, action: string) => {
    await apiFetch(`/api/${tenant}/expenses/${id}/${action}`, { method: "POST", body: action === "reject" ? JSON.stringify({ note: "Rad etilgan" }) : undefined });
    fetchAll();
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Chiqimlar (Expenses)</h1>

      {/* PnL Summary */}
      {pnl && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Daromad</p><p className="text-2xl font-bold">{Number(pnl.revenue).toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Tasdiqlangan chiqimlar</p><p className="text-2xl font-bold text-orange-600">{Number(pnl.total_expenses_approved).toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Qoralama chiqimlar</p><p className="text-2xl font-bold text-gray-500">{Number(pnl.total_expenses_draft).toLocaleString()}</p></CardContent></Card>
          <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Sof foyda</p><p className="text-2xl font-bold text-green-600">{Number(pnl.net_profit).toLocaleString()}</p></CardContent></Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle>Chiqimlar ro'yxati</CardTitle>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Barchasi</SelectItem>
                <SelectItem value="draft">Qoralama</SelectItem>
                <SelectItem value="approved">Tasdiqlangan</SelectItem>
                <SelectItem value="rejected">Rad etilgan</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="py-8 text-center">Yuklanmoqda...</div> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tur</TableHead>
                  <TableHead>Summa</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Holat</TableHead>
                  <TableHead>Sana</TableHead>
                  <TableHead>Ombor</TableHead>
                  <TableHead className="text-right">Amallar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Ma'lumot yo'q</TableCell></TableRow>
                ) : expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{typeMap[e.expense_type] || e.expense_type}</TableCell>
                    <TableCell className="font-medium">{Number(e.amount).toLocaleString()} {e.currency}</TableCell>
                    <TableCell>{e.agent_name || "—"}</TableCell>
                    <TableCell>
                      <Badge className={
                        e.status === "approved" ? "bg-green-100 text-green-800" :
                        e.status === "rejected" ? "bg-red-100 text-red-800" :
                        "bg-yellow-100 text-yellow-800"
                      }>{typeMap[e.status] || e.status}</Badge>
                    </TableCell>
                    <TableCell>{new Date(e.expense_date).toLocaleDateString()}</TableCell>
                    <TableCell>{e.warehouse_name || "—"}</TableCell>
                    <TableCell className="text-right">
                      {e.status === "draft" && (
                        <div className="flex gap-1 justify-end">
                          <Button size="sm" variant="default" onClick={() => handleAction(e.id, "approve")}>Tasdiqlash</Button>
                          <Button size="sm" variant="destructive" onClick={() => handleAction(e.id, "reject")}>Rad etish</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {total > 20 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-muted-foreground">Jami: {total}</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Oldingi</Button>
                <Button variant="outline" size="sm" disabled={page * 20 >= total} onClick={() => setPage((p) => p + 1)}>Keyingi</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
