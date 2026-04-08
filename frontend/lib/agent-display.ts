/**
 * `GET /api/:slug/agents` → `StaffRow[]` — ko‘rinadigan ism `fio` da (`name` yo‘q).
 */
export type AgentListItem = {
  id: number;
  fio?: string | null;
  /** Ba’zi eski mocklar */
  name?: string | null;
  login?: string | null;
};

export function agentDisplayName(a: AgentListItem): string {
  const fromFio = (a.fio ?? a.name ?? "").trim();
  if (fromFio) return fromFio;
  const fromLogin = (a.login ?? "").trim();
  if (fromLogin) return fromLogin;
  return `#${a.id}`;
}
