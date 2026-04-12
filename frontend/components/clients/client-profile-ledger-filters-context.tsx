"use client";

import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";

export type ProfileLedgerAgentFilter = { agentIds: number[]; noAgent: boolean };

type Ctx = {
  agentFilter: ProfileLedgerAgentFilter;
  setAgentFilter: Dispatch<SetStateAction<ProfileLedgerAgentFilter>>;
  showGeneralBlock: boolean;
  setShowGeneralBlock: Dispatch<SetStateAction<boolean>>;
};

const ClientProfileLedgerFiltersContext = createContext<Ctx | null>(null);

export function ClientProfileLedgerFiltersProvider({ clientId, children }: { clientId: number; children: ReactNode }) {
  const [agentFilter, setAgentFilter] = useState<ProfileLedgerAgentFilter>({ agentIds: [], noAgent: false });
  const [showGeneralBlock, setShowGeneralBlock] = useState(true);

  useEffect(() => {
    setAgentFilter({ agentIds: [], noAgent: false });
    setShowGeneralBlock(true);
  }, [clientId]);

  const value = useMemo(
    () => ({ agentFilter, setAgentFilter, showGeneralBlock, setShowGeneralBlock }),
    [agentFilter, showGeneralBlock]
  );

  return <ClientProfileLedgerFiltersContext.Provider value={value}>{children}</ClientProfileLedgerFiltersContext.Provider>;
}

export function useClientProfileLedgerFilters(): Ctx {
  const v = useContext(ClientProfileLedgerFiltersContext);
  if (!v) throw new Error("useClientProfileLedgerFilters must be used within ClientProfileLedgerFiltersProvider");
  return v;
}

/** Вкладка «Долги» вне провайдера не используется; для `embedded` всегда есть контекст. */
export function useClientProfileLedgerFiltersOptional(): Ctx | null {
  return useContext(ClientProfileLedgerFiltersContext);
}
