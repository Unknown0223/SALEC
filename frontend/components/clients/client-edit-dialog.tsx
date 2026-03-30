"use client";

import type { ClientRow, ContactPersonSlot } from "@/lib/client-types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantSlug: string | null;
  client: ClientRow | null;
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

export function ClientEditDialog({ open, onOpenChange, tenantSlug, client }: Props) {
  const qc = useQueryClient();
  const [localError, setLocalError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [creditLimit, setCreditLimit] = useState("");
  const [category, setCategory] = useState("");
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
  const [visitDate, setVisitDate] = useState("");
  const [notes, setNotes] = useState("");
  const [clientFormat, setClientFormat] = useState("");
  const [agentId, setAgentId] = useState<string>("");
  const [contacts, setContacts] = useState<ContactPersonSlot[]>(padContacts([]));

  const usersQ = useQuery({
    queryKey: ["users", tenantSlug, "client-edit"],
    enabled: open && Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: Array<{ id: number; name: string; login: string }> }>(
        `/api/${tenantSlug}/users`
      );
      return data.data;
    }
  });

  useEffect(() => {
    if (!open || !client) return;
    setLocalError(null);
    setName(client.name);
    setPhone(client.phone ?? "");
    setIsActive(client.is_active);
    setCreditLimit(client.credit_limit);
    setCategory(client.category ?? "");
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
    setVisitDate(isoToDateInput(client.visit_date));
    setNotes(client.notes ?? "");
    setClientFormat(client.client_format ?? "");
    setAgentId(client.agent_id != null ? String(client.agent_id) : "");
    setContacts(padContacts(client.contact_persons));
  }, [open, client]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!tenantSlug || !client) throw new Error("Ma’lumot yo‘q");
      const credit = Number.parseFloat(creditLimit.replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(credit) || credit < 0) {
        throw new Error("Kredit limiti noto‘g‘ri");
      }
      let agent_id: number | null = null;
      if (agentId.trim() !== "") {
        const n = Number.parseInt(agentId, 10);
        if (!Number.isFinite(n) || n <= 0) throw new Error("Agent tanlovi noto‘g‘ri");
        agent_id = n;
      }

      const body: Record<string, unknown> = {
        name: name.trim(),
        phone: phone.trim() || null,
        is_active: isActive,
        credit_limit: credit,
        category: category.trim() || null,
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
        visit_date: visitDate.trim() ? dateInputToIso(visitDate) : null,
        notes: notes.trim() || null,
        client_format: clientFormat.trim() || null,
        agent_id,
        contact_persons: contacts.map((c) => ({
          firstName: c.firstName?.trim() || null,
          lastName: c.lastName?.trim() || null,
          phone: c.phone?.trim() || null
        }))
      };
      const { data } = await api.patch(`/api/${tenantSlug}/clients/${client.id}`, body);
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["clients", tenantSlug] });
      if (client) {
        await qc.invalidateQueries({ queryKey: ["client", tenantSlug, client.id] });
        await qc.invalidateQueries({ queryKey: ["client-audit", tenantSlug, client.id] });
        await qc.invalidateQueries({ queryKey: ["orders", tenantSlug] });
      }
      onOpenChange(false);
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

  if (!client) return null;

  const inputCls =
    "flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col gap-0 p-0" showCloseButton>
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Mijoz kartochkasi</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 overflow-y-auto px-6 py-4">
          <p className="text-xs text-muted-foreground">Bo‘sh maydonlar keyinroq to‘ldirilishi mumkin.</p>

          <section className="grid gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Asosiy</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ce-name">Nomi</Label>
                <Input id="ce-name" value={name} onChange={(e) => setName(e.target.value)} disabled={mutation.isPending} />
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
                  placeholder="masalan retail"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ce-format">Mijoz formati</Label>
                <Input
                  id="ce-format"
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
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ce-agent">Agent</Label>
                <select
                  id="ce-agent"
                  className={inputCls}
                  value={agentId}
                  onChange={(e) => setAgentId(e.target.value)}
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
                <Input id="ce-reg" value={region} onChange={(e) => setRegion(e.target.value)} disabled={mutation.isPending} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ce-dist">Tuman</Label>
                <Input id="ce-dist" value={district} onChange={(e) => setDistrict(e.target.value)} disabled={mutation.isPending} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ce-nei">Mahalla</Label>
                <Input
                  id="ce-nei"
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
              <div className="grid gap-1.5">
                <Label htmlFor="ce-vis">Sana (tashrif)</Label>
                <Input
                  id="ce-vis"
                  type="date"
                  value={visitDate}
                  onChange={(e) => setVisitDate(e.target.value)}
                  disabled={mutation.isPending}
                />
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
        </div>
        <DialogFooter className="border-t bg-muted/40 px-6 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
            Bekor
          </Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saqlanmoqda…" : "Saqlash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export type { ClientRow, ContactPersonSlot } from "@/lib/client-types";
