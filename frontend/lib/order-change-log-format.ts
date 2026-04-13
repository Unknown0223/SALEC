function formatIdDelta(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return String(v);
}

export function formatOrderChangeSummary(action: string, payload: unknown): string {
  if (!payload || typeof payload !== "object") return "—";
  const p = payload as Record<string, unknown>;
  if (action === "meta") {
    const wh = p.warehouse_id as { from?: unknown; to?: unknown } | undefined;
    const ag = p.agent_id as { from?: unknown; to?: unknown } | undefined;
    const ex = p.expeditor_user_id as { from?: unknown; to?: unknown } | undefined;
    const parts: string[] = [];
    if (wh) parts.push(`Ombor ID: ${formatIdDelta(wh.from)} → ${formatIdDelta(wh.to)}`);
    if (ag) parts.push(`Agent ID: ${formatIdDelta(ag.from)} → ${formatIdDelta(ag.to)}`);
    if (ex) parts.push(`Dastavchik ID: ${formatIdDelta(ex.from)} → ${formatIdDelta(ex.to)}`);
    return parts.join("; ") || "—";
  }
  if (action === "lines") {
    const ts = p.total_sum as { from?: string; to?: string } | undefined;
    const bs = p.bonus_sum as { from?: string; to?: string } | undefined;
    const parts: string[] = [];
    if (ts) parts.push(`To‘lov jami: ${ts.from ?? "—"} → ${ts.to ?? "—"}`);
    if (bs) parts.push(`Bonus: ${bs.from ?? "—"} → ${bs.to ?? "—"}`);
    return parts.join("; ") || "To‘lov qatorlari yangilandi";
  }
  return JSON.stringify(payload);
}

export function changeLogActionLabel(action: string): string {
  if (action === "lines") return "To‘lov qatorlari";
  if (action === "meta") return "Ombor / agent / dastavchik";
  return action;
}
