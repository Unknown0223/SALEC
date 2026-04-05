"use client";

import { type Dispatch, type SetStateAction } from "react";
import { cn } from "@/lib/utils";

export type RolePickerUser = { id: number; name: string; login: string };

export type RolePickerColumn = { role: string; label: string; pool: string };

export function emptySetsForRoles(roleOrder: string[]): Record<string, Set<number>> {
  const o: Record<string, Set<number>> = {};
  for (const r of roleOrder) o[r] = new Set();
  return o;
}

export function cloneRoleSets(
  roleOrder: string[],
  src: Record<string, Set<number>>
): Record<string, Set<number>> {
  const o = emptySetsForRoles(roleOrder);
  for (const r of roleOrder) {
    o[r] = new Set(src[r] ?? []);
  }
  return o;
}

export function toggleUserOneRoleColumn(
  roleOrder: string[],
  sets: Record<string, Set<number>>,
  role: string,
  userId: number,
  on: boolean
): Record<string, Set<number>> {
  const next = cloneRoleSets(roleOrder, sets);
  if (on) {
    for (const r of roleOrder) {
      if (r !== role) next[r].delete(userId);
    }
    next[role].add(userId);
  } else {
    next[role].delete(userId);
  }
  return next;
}

export function setsFromRoleLinks(
  roleOrder: string[],
  links: { link_role: string; user_id: number }[]
): Record<string, Set<number>> {
  const m = emptySetsForRoles(roleOrder);
  for (const l of links) {
    if (m[l.link_role]) m[l.link_role].add(l.user_id);
  }
  return m;
}

export function linksFromRoleSets(
  roleOrder: string[],
  sets: Record<string, Set<number>>
): { user_id: number; link_role: string }[] {
  const out: { user_id: number; link_role: string }[] = [];
  for (const role of roleOrder) {
    sets[role]?.forEach((uid) => out.push({ user_id: uid, link_role: role }));
  }
  return out;
}

type Pools = Record<string, RolePickerUser[] | undefined>;

/**
 * Rollar — flex-wrap; tashqi vertikal scroll; kartada qat’iy balandlik → ro‘yxat ichida vertikal scroll.
 */
export function RoleLinkPickerGrid({
  roleOrder,
  columns,
  pickers,
  local,
  setLocal,
  search
}: {
  roleOrder: string[];
  columns: RolePickerColumn[];
  pickers: Pools | undefined;
  local: Record<string, Set<number>>;
  setLocal: Dispatch<SetStateAction<Record<string, Set<number>>>>;
  search: string;
}) {
  const q = search.trim().toLowerCase();
  const match = (u: RolePickerUser) =>
    !q || u.name.toLowerCase().includes(q) || u.login.toLowerCase().includes(q);

  if (!pickers) {
    return (
      <div className="flex min-h-[240px] items-center justify-center rounded-lg border border-border bg-muted/20 text-sm text-muted-foreground">
        Загрузка списков…
      </div>
    );
  }

  return (
    <div className="flex w-full max-w-full flex-col overflow-hidden rounded-lg border border-border/50 bg-muted/10">
      {/* Внешний вертикальный скролл; max-h — без лишнего пустого места под блоками */}
      <div
        className={cn(
          "max-h-[min(48vh,400px)] min-h-[240px] overflow-y-auto overflow-x-hidden overscroll-y-contain p-1.5 sm:max-h-[min(52vh,440px)] sm:min-h-[260px] sm:p-2",
          "[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
        )}
      >
        <div
          role="group"
          aria-label="Группы по ролям"
          className="flex flex-wrap content-start items-start justify-start gap-2 sm:gap-2.5"
        >
          {columns.map((col) => {
            const pool = pickers[col.pool] ?? [];
            const users = pool.filter(match);
            const allIds = users.map((u) => u.id);
            const setForRole = local[col.role] ?? new Set<number>();
            const allOn = allIds.length > 0 && allIds.every((id) => setForRole.has(id));
            return (
              <div
                key={col.role}
                className={cn(
                  "flex min-w-[148px] max-w-[210px] flex-[1_1_160px] flex-col overflow-hidden rounded-md border border-border/80 bg-card shadow-sm",
                  /* Фиксированная высота карточки; список — внутренний скролл */
                  "h-[216px] sm:h-[244px]"
                )}
              >
                <div className="shrink-0 border-b border-teal-800/30 bg-teal-600 px-2 py-1.5 text-white dark:bg-teal-700">
                  <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-x-2 sm:gap-y-0">
                    <span
                      className="min-w-0 truncate text-left text-[12px] font-semibold leading-tight sm:text-[13px]"
                      title={col.label}
                    >
                      {col.label}
                    </span>
                    <label
                      className={cn(
                        "flex cursor-pointer select-none items-center justify-end",
                        allIds.length === 0 && "cursor-not-allowed opacity-45"
                      )}
                      title="Выбрать всех в этой роли"
                    >
                      <input
                        type="checkbox"
                        checked={allOn}
                        disabled={allIds.length === 0}
                        aria-label={`Выбрать всех в роли «${col.label}»`}
                        className="size-3.5 shrink-0 rounded border-2 border-white/80 bg-white/20 accent-white sm:size-4"
                        onChange={(e) => {
                          setLocal((prev) => {
                            let next = cloneRoleSets(roleOrder, prev);
                            if (e.target.checked) {
                              for (const id of allIds) {
                                next = toggleUserOneRoleColumn(roleOrder, next, col.role, id, true);
                              }
                            } else {
                              for (const id of allIds) {
                                next[col.role].delete(id);
                              }
                            }
                            return next;
                          });
                        }}
                      />
                    </label>
                  </div>
                </div>
                <div
                  className={cn(
                    "min-h-0 flex-1 overflow-x-hidden overflow-y-auto bg-background",
                    "px-1 py-1 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
                  )}
                >
                  {users.length === 0 ? (
                    <p className="flex min-h-[64px] items-center justify-center px-2 text-center text-xs leading-relaxed text-muted-foreground sm:text-sm">
                      Нет данных
                    </p>
                  ) : (
                    <ul className="divide-y divide-border/40">
                      {users.map((u) => {
                        const on = setForRole.has(u.id);
                        return (
                          <li key={u.id}>
                            <label
                              className={cn(
                                "flex w-full cursor-pointer items-center gap-2 px-2 py-2 text-left text-[13px] transition-colors",
                                "hover:bg-muted/40 has-[:focus-visible]:bg-muted/40",
                                on && "bg-teal-50 dark:bg-teal-950/35"
                              )}
                            >
                              <input
                                type="checkbox"
                                checked={on}
                                className="size-3.5 shrink-0 rounded border-input accent-teal-600 sm:size-4"
                                onChange={(ev) => {
                                  setLocal((prev) =>
                                    toggleUserOneRoleColumn(
                                      roleOrder,
                                      prev,
                                      col.role,
                                      u.id,
                                      ev.target.checked
                                    )
                                  );
                                }}
                              />
                              <span className="min-w-0 flex-1 text-left leading-snug">
                                <span className="block break-words font-medium text-foreground">{u.name}</span>
                                <span className="mt-0.5 block break-all text-[11px] text-muted-foreground sm:text-xs">{u.login}</span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
