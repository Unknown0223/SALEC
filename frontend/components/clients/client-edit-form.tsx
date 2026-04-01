"use client";

import type { ClientRow, ContactPersonSlot } from "@/lib/client-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/dashboard/page-header";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

type ClientDetailApi = ClientRow & {
  phone_normalized?: string | null;
  open_orders_total?: string;
};

function padContacts(raw: ContactPersonSlot[] | undefined): ContactPersonSlot[] {
  const a = raw ?? [];
  return Array.from({ length: 10 }, (_, i) => ({
    firstName: a[i]?.firstName ?? null,
    lastName: a[i]?.lastName ?? null,
    phone: a[i]?.phone ?? null
  }));
}

function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function dateInputToIso(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  const d = new Date(t + "T12:00:00");
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type AgentSlotForm = { agentId: string; visitDate: string; expeditorPhone: string };

function buildAgentSlots(client: ClientRow): AgentSlotForm[] {
  const slots: AgentSlotForm[] = Array.from({ length: 10 }, () => ({
    agentId: "",
    visitDate: "",
    expeditorPhone: ""
  }));
  const list = client.agent_assignments;
  if (Array.isArray(list)) {
    for (const a of list) {
      const i = a.slot - 1;
      if (i < 0 || i > 9) continue;
      slots[i] = {
        agentId: a.agent_id != null ? String(a.agent_id) : "",
        visitDate: isoToDateInput(a.visit_date),
        expeditorPhone: a.expeditor_phone ?? ""
      };
    }
    return slots;
  }
  if (client.agent_id != null) {
    slots[0] = {
      agentId: String(client.agent_id),
      visitDate: isoToDateInput(client.visit_date),
      expeditorPhone: ""
    };
  }
  return slots;
}

type Props = {
  tenantSlug: string | null;
  clientId: number;
  onSuccess: () => void;
  onCancel: () => void;
};

export function ClientEditForm({ tenantSlug, clientId, onSuccess, onCancel }: Props) {
  const qc = useQueryClient();
  const [localError, setLocalError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [phone, setPhone] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [creditLimit, setCreditLimit] = useState("");
  const [category, setCategory] = useState("");
  const [clientTypeCode, setClientTypeCode] = useState("");
  const [address, setAddress] = useState("");
  const [responsiblePerson, setResponsiblePerson] = useState("");
  const [landmark, setLandmark] = useState("");
  const [inn, setInn] = useState("");
  const [pdl, setPdl] = useState("");
  const [logisticsService, setLogisticsService] = useState("");
  const [licenseUntil, setLicenseUntil] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [region, setRegion] = useState("");
  const [district, setDistrict] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [apartment, setApartment] = useState("");
  const [gpsText, setGpsText] = useState("");
  const [notes, setNotes] = useState("");
  const [clientFormat, setClientFormat] = useState("");
  const [agentSlots, setAgentSlots] = useState<AgentSlotForm[]>(() =>
    Array.from({ length: 10 }, () => ({ agentId: "", visitDate: "", expeditorPhone: "" }))
  );
  const [contacts, setContacts] = useState<ContactPersonSlot[]>(padContacts([]));

  const clientQ = useQuery({
    queryKey: ["client", tenantSlug, clientId],
    enabled: Boolean(tenantSlug) && clientId > 0,
    queryFn: async () => {
      const { data } = await api.get<ClientDetailApi>(`/api/${tenantSlug}/clients/${clientId}`);
      return data;
    }
  });

  const usersQ = useQuery({
    queryKey: ["users", tenantSlug, "client-edit"],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: Array<{ id: number; name: string; login: string }> }>(
        `/api/${tenantSlug}/users`
      );
      return data.data;
    }
  });

  const refsQ = useQuery({
    queryKey: ["clients-references", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{
        categories: string[];
        client_type_codes: string[];
        regions: string[];
        districts: string[];
        neighborhoods: string[];
        client_formats: string[];
        logistics_services: string[];
      }>(`/api/${tenantSlug}/clients/references`);
      return data;
    }
  });

  useEffect(() => {
    const client = clientQ.data;
    if (!client) return;
    setLocalError(null);
    setName(client.name);
    setLegalName(client.legal_name ?? "");
    setPhone(client.phone ?? "");
    setIsActive(client.is_active);
    setCreditLimit(client.credit_limit);
    setCategory(client.category ?? "");
    setClientTypeCode(client.client_type_code ?? "");
    setAddress(client.address ?? "");
    setResponsiblePerson(client.responsible_person ?? "");
    setLandmark(client.landmark ?? "");
    setInn(client.inn ?? "");
    setPdl(client.pdl ?? "");
    setLogisticsService(client.logistics_service ?? "");
    setLicenseUntil(isoToDateInput(client.license_until));
    setWorkingHours(client.working_hours ?? "");
    setRegion(client.region ?? "");
    setDistrict(client.district ?? "");
    setNeighborhood(client.neighborhood ?? "");
    setStreet(client.street ?? "");
    setHouseNumber(client.house_number ?? "");
    setApartment(client.apartment ?? "");
    setGpsText(client.gps_text ?? "");
    setNotes(client.notes ?? "");
    setClientFormat(client.client_format ?? "");
    setAgentSlots(buildAgentSlots(client));
    setContacts(padContacts(client.contact_persons));
  }, [clientQ.data]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!tenantSlug) throw new Error("Ma’lumot yo‘q");
      const credit = Number.parseFloat(creditLimit.replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(credit) || credit < 0) {
        throw new Error("Kredit limiti noto‘g‘ri");
      }

      const agent_assignments = agentSlots.map((s, idx) => {
        const slot = idx + 1;
        let agent_id: number | null = null;
        if (s.agentId.trim() !== "") {
          const n = Number.parseInt(s.agentId, 10);
          if (!Number.isFinite(n) || n <= 0) throw new Error(`Agent #${slot} tanlovi noto‘g‘ri`);
          agent_id = n;
        }
        return {
          slot,
          agent_id,
          visit_date: s.visitDate.trim() ? dateInputToIso(s.visitDate) : null,
          expeditor_phone: s.expeditorPhone.trim() || null
        };
      });

      const body: Record<string, unknown> = {
        name: name.trim(),
        legal_name: legalName.trim() || null,
        phone: phone.trim() || null,
        is_active: isActive,
        credit_limit: credit,
        category: category.trim() || null,
        client_type_code: clientTypeCode.trim() || null,
        address: address.trim() || null,
        responsible_person: responsiblePerson.trim() || null,
        landmark: landmark.trim() || null,
        inn: inn.trim() || null,
        pdl: pdl.trim() || null,
        logistics_service: logisticsService.trim() || null,
        license_until: licenseUntil.trim() ? dateInputToIso(licenseUntil) : null,
        working_hours: workingHours.trim() || null,
        region: region.trim() || null,
        district: district.trim() || null,
        neighborhood: neighborhood.trim() || null,
        street: street.trim() || null,
        house_number: houseNumber.trim() || null,
        apartment: apartment.trim() || null,
        gps_text: gpsText.trim() || null,
        notes: notes.trim() || null,
        client_format: clientFormat.trim() || null,
        agent_assignments,
        contact_persons: contacts.map((c) => ({
          firstName: c.firstName?.trim() || null,
          lastName: c.lastName?.trim() || null,
          phone: c.phone?.trim() || null
        }))
      };
      const { data } = await api.patch(`/api/${tenantSlug}/clients/${clientId}`, body);
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["clients", tenantSlug] });
      await qc.invalidateQueries({ queryKey: ["client", tenantSlug, clientId] });
      await qc.invalidateQueries({ queryKey: ["client-audit", tenantSlug, clientId] });
      await qc.invalidateQueries({ queryKey: ["orders", tenantSlug] });
      onSuccess();
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { status?: number } };
      if (ax.response?.status === 401) {
        setLocalError("Sessiya tugagan — qayta kiring.");
        return;
      }
      if (ax.response?.status === 403) {
        setLocalError("Ruxsat yo‘q (faqat admin yoki operator).");
        return;
      }
      setLocalError(e instanceof Error ? e.message : "Saqlashda xato");
    }
  });

  const inputCls =
    "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  if (clientQ.isError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Mijozni tahrirlash" description="Yuklashda xato" />
        <p className="text-sm text-destructive">Kartochkani yuklab bo‘lmadi.</p>
        <Button type="button" variant="outline" onClick={onCancel}>
          Orqaga
        </Button>
      </div>
    );
  }

  if (!clientQ.data && clientQ.isLoading) {
    return <p className="text-sm text-muted-foreground">Yuklanmoqda…</p>;
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 pb-10">
      <PageHeader
        title="Mijoz kartochkasi"
        description="Barcha maydonlarni to‘liq sahifada tahrirlash"
        actions={
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Orqaga
          </Button>
        }
      />

      <p className="text-xs text-muted-foreground">Bo‘sh maydonlar keyinroq to‘ldirilishi mumkin.</p>

      <section className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Asosiy</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ce-name">Nomi</Label>
            <Input id="ce-name" value={name} onChange={(e) => setName(e.target.value)} disabled={mutation.isPending} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ce-legal">Yuridik nom</Label>
            <Input
              id="ce-legal"
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-phone">Telefon</Label>
            <Input id="ce-phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={mutation.isPending} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-credit">Kredit limiti (UZS)</Label>
            <Input
              id="ce-credit"
              type="text"
              inputMode="decimal"
              value={creditLimit}
              onChange={(e) => setCreditLimit(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-cat">Toifa</Label>
            <Input
              id="ce-cat"
              list="client-categories-list"
              placeholder="masalan retail"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-type-code">Mijoz turi (kod)</Label>
            <Input
              id="ce-type-code"
              list="client-type-codes-list"
              value={clientTypeCode}
              onChange={(e) => setClientTypeCode(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-format">Mijoz formati</Label>
            <Input
              id="ce-format"
              list="client-formats-list"
              value={clientFormat}
              onChange={(e) => setClientFormat(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <input
              id="ce-active"
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={mutation.isPending}
            />
            <Label htmlFor="ce-active" className="font-normal">
              Faol
            </Label>
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agentlar (10 slot)</h3>
        <p className="text-xs text-muted-foreground">Har bir qatorda agent, tashrif sanasi va ekspeditor telefoni.</p>
        <div className="space-y-3">
          {agentSlots.map((slot, idx) => (
            <div
              key={idx}
              className="grid gap-2 rounded-md border border-dashed p-3 sm:grid-cols-[auto_1fr_1fr_1fr] sm:items-end"
            >
              <span className="text-xs font-medium text-muted-foreground sm:pt-2">#{idx + 1}</span>
              <div className="grid gap-1">
                <Label className="text-xs">Agent</Label>
                <select
                  className={inputCls}
                  value={slot.agentId}
                  onChange={(e) => {
                    const next = [...agentSlots];
                    next[idx] = { ...next[idx], agentId: e.target.value };
                    setAgentSlots(next);
                  }}
                  disabled={mutation.isPending}
                >
                  <option value="">—</option>
                  {(usersQ.data ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.login})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Tashrif sanasi</Label>
                <Input
                  type="date"
                  value={slot.visitDate}
                  onChange={(e) => {
                    const next = [...agentSlots];
                    next[idx] = { ...next[idx], visitDate: e.target.value };
                    setAgentSlots(next);
                  }}
                  disabled={mutation.isPending}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Ekspeditor tel.</Label>
                <Input
                  value={slot.expeditorPhone}
                  onChange={(e) => {
                    const next = [...agentSlots];
                    next[idx] = { ...next[idx], expeditorPhone: e.target.value };
                    setAgentSlots(next);
                  }}
                  disabled={mutation.isPending}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Manzil va rekvizitlar</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ce-addr">Manzil (to‘liq)</Label>
            <Input id="ce-addr" value={address} onChange={(e) => setAddress(e.target.value)} disabled={mutation.isPending} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-resp">Mas’ul shaxs</Label>
            <Input
              id="ce-resp"
              value={responsiblePerson}
              onChange={(e) => setResponsiblePerson(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-land">Mo‘ljal</Label>
            <Input id="ce-land" value={landmark} onChange={(e) => setLandmark(e.target.value)} disabled={mutation.isPending} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-inn">INN</Label>
            <Input id="ce-inn" value={inn} onChange={(e) => setInn(e.target.value)} disabled={mutation.isPending} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-pdl">P-D-L</Label>
            <Input id="ce-pdl" value={pdl} onChange={(e) => setPdl(e.target.value)} disabled={mutation.isPending} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ce-log">Logistika xizmati</Label>
            <Input
              id="ce-log"
              list="client-logistics-list"
              value={logisticsService}
              onChange={(e) => setLogisticsService(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-lic">Litsenziya muddati</Label>
            <Input
              id="ce-lic"
              type="date"
              value={licenseUntil}
              onChange={(e) => setLicenseUntil(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-wh">Ish vaqti</Label>
            <Input
              id="ce-wh"
              value={workingHours}
              onChange={(e) => setWorkingHours(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-reg">Viloyat</Label>
            <Input
              id="ce-reg"
              list="client-regions-list"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-dist">Tuman</Label>
            <Input
              id="ce-dist"
              list="client-districts-list"
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-nei">Mahalla</Label>
            <Input
              id="ce-nei"
              list="client-neighborhoods-list"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-str">Ko‘cha</Label>
            <Input id="ce-str" value={street} onChange={(e) => setStreet(e.target.value)} disabled={mutation.isPending} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-house">Uy</Label>
            <Input
              id="ce-house"
              value={houseNumber}
              onChange={(e) => setHouseNumber(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ce-apt">Xonadon</Label>
            <Input
              id="ce-apt"
              value={apartment}
              onChange={(e) => setApartment(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ce-gps">GPS</Label>
            <Input id="ce-gps" value={gpsText} onChange={(e) => setGpsText(e.target.value)} disabled={mutation.isPending} />
          </div>
          <div className="grid gap-1.5 sm:col-span-2">
            <Label htmlFor="ce-notes">Izoh</Label>
            <textarea
              id="ce-notes"
              className={`${inputCls} min-h-[72px] py-2`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={mutation.isPending}
            />
          </div>
        </div>
      </section>

      <section className="grid gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Kontaktlar (10 gacha)</h3>
        <div className="space-y-3">
          {contacts.map((slot, idx) => (
            <div key={idx} className="grid gap-2 rounded-md border border-dashed p-2 sm:grid-cols-3">
              <Input
                placeholder={`Ism ${idx + 1}`}
                value={slot.firstName ?? ""}
                onChange={(e) => {
                  const next = [...contacts];
                  next[idx] = { ...next[idx], firstName: e.target.value || null };
                  setContacts(next);
                }}
                disabled={mutation.isPending}
              />
              <Input
                placeholder={`Familiya ${idx + 1}`}
                value={slot.lastName ?? ""}
                onChange={(e) => {
                  const next = [...contacts];
                  next[idx] = { ...next[idx], lastName: e.target.value || null };
                  setContacts(next);
                }}
                disabled={mutation.isPending}
              />
              <Input
                placeholder={`Telefon ${idx + 1}`}
                value={slot.phone ?? ""}
                onChange={(e) => {
                  const next = [...contacts];
                  next[idx] = { ...next[idx], phone: e.target.value || null };
                  setContacts(next);
                }}
                disabled={mutation.isPending}
              />
            </div>
          ))}
        </div>
      </section>

      {localError ? <p className="text-sm text-destructive">{localError}</p> : null}

      <datalist id="client-categories-list">
        {(refsQ.data?.categories ?? []).map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="client-type-codes-list">
        {(refsQ.data?.client_type_codes ?? []).map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="client-formats-list">
        {(refsQ.data?.client_formats ?? []).map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="client-logistics-list">
        {(refsQ.data?.logistics_services ?? []).map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="client-regions-list">
        {(refsQ.data?.regions ?? []).map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="client-districts-list">
        {(refsQ.data?.districts ?? []).map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
      <datalist id="client-neighborhoods-list">
        {(refsQ.data?.neighborhoods ?? []).map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending}>
          Bekor
        </Button>
        <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Saqlanmoqda…" : "Saqlash"}
        </Button>
        <Link href={`/clients/${clientId}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Kartochkaga qaytish
        </Link>
      </div>
    </div>
  );
}
