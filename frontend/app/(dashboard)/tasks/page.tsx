"use client";

import { PageHeader } from "@/components/dashboard/page-header";
import { PageShell } from "@/components/dashboard/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuthStore, useEffectiveRole } from "@/lib/auth-store";
import { api } from "@/lib/api";
import { agentDisplayName, type AgentListItem } from "@/lib/agent-display";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

type TaskRow = {
  id: number;
  title: string;
  status: string;
  priority: string;
  due_at: string | null;
  assignee: { id: number; name: string } | null;
};

const WRITE = ["admin", "operator", "supervisor"];

export default function TasksPage() {
  const tenantSlug = useAuthStore((s) => s.tenantSlug);
  const role = useEffectiveRole();
  const canWrite = role != null && WRITE.includes(role);
  const qc = useQueryClient();
  const [mine, setMine] = useState(false);
  const [title, setTitle] = useState("");
  const [assigneeId, setAssigneeId] = useState("");

  const staffQ = useQuery({
    queryKey: ["tasks-agents", tenantSlug],
    enabled: Boolean(tenantSlug) && canWrite,
    queryFn: async () => {
      const { data } = await api.get<{ data: AgentListItem[] }>(
        `/api/${tenantSlug}/agents?is_active=true`
      );
      return data.data;
    }
  });

  const listQ = useQuery({
    queryKey: ["tenant-tasks", tenantSlug, mine],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "80");
      if (mine) params.set("mine", "true");
      const { data } = await api.get<{ data: TaskRow[]; total: number }>(
        `/api/${tenantSlug}/tenant-tasks?${params}`
      );
      return data.data;
    }
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const aid = assigneeId ? Number.parseInt(assigneeId, 10) : null;
      await api.post(`/api/${tenantSlug}/tenant-tasks`, {
        title: title.trim(),
        assignee_user_id: aid && Number.isFinite(aid) ? aid : null
      });
    },
    onSuccess: async () => {
      setTitle("");
      setAssigneeId("");
      await qc.invalidateQueries({ queryKey: ["tenant-tasks", tenantSlug] });
    }
  });

  const doneMut = useMutation({
    mutationFn: async (id: number) => {
      await api.patch(`/api/${tenantSlug}/tenant-tasks/${id}`, { status: "done" });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tenant-tasks", tenantSlug] });
    }
  });

  const pickers = useMemo(() => staffQ.data ?? [], [staffQ.data]);

  return (
    <PageShell>
      <PageHeader title="Задачи" description="Внутренние задачи сотрудников." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button type="button" variant={mine ? "default" : "outline"} size="sm" onClick={() => setMine((m) => !m)}>
          Мои задачи
        </Button>
      </div>
      {canWrite ? (
        <div className="mb-6 space-y-3 rounded-lg border bg-card p-4">
          <h2 className="text-sm font-semibold">Новая задача</h2>
          <div className="flex flex-wrap gap-2">
            <Input
              className="max-w-md"
              placeholder="Заголовок"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <select
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
            >
              <option value="">Исполнитель — любой</option>
              {pickers.map((u) => (
                <option key={u.id} value={u.id}>
                  {agentDisplayName(u)}
                </option>
              ))}
            </select>
            <Button
              type="button"
              disabled={!title.trim() || createMut.isPending}
              onClick={() => void createMut.mutate()}
            >
              Создать
            </Button>
          </div>
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="app-table-thead">
            <tr>
              <th className="px-3 py-2 text-left">Задача</th>
              <th className="px-3 py-2 text-left">Исполнитель</th>
              <th className="px-3 py-2 text-left">Приоритет</th>
              <th className="px-3 py-2 text-left">Статус</th>
              <th className="px-3 py-2 text-right" />
            </tr>
          </thead>
          <tbody>
            {(listQ.data ?? []).map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-3 py-2 font-medium">{t.title}</td>
                <td className="px-3 py-2">{t.assignee?.name ?? "—"}</td>
                <td className="px-3 py-2">{t.priority}</td>
                <td className="px-3 py-2">{t.status}</td>
                <td className="px-3 py-2 text-right">
                  {t.status === "open" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={doneMut.isPending}
                      onClick={() => void doneMut.mutate(t.id)}
                    >
                      Выполнено
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageShell>
  );
}
