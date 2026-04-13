"use client";

import type { ClientRow } from "@/lib/client-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/dashboard/page-header";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { pickCityTerritoryHint } from "@/lib/city-territory-hint";
import { mergeRefOptions } from "@/lib/merge-ref-options";
import { mergeRefSelectOptions } from "@/lib/ref-select-options";
import { cn } from "@/lib/utils";
import { FilterSelect } from "@/components/ui/filter-select";

type ClientDetailApi = ClientRow & {
  phone_normalized?: string | null;
  open_orders_total?: string;
  delivered_unpaid_total?: string;
};

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

const VISIT_DAYS: { k: number; l: string }[] = [
  { k: 1, l: "Пн" },
  { k: 2, l: "Вт" },
  { k: 3, l: "Ср" },
  { k: 4, l: "Чт" },
  { k: 5, l: "Пт" },
  { k: 6, l: "Сб" },
  { k: 7, l: "Вс" }
];

const MAX_TEAM_ROWS = 10;

type AgentSlotForm = {
  agentId: string;
  expeditorUserId: string;
  weekdays: number[];
  /** UI da ko‘rinmaydi — mavjud yozuvni saqlash uchun */
  legacyVisitDate: string;
  legacyExpeditorPhone: string;
};

function emptyAgentSlot(): AgentSlotForm {
  return { agentId: "", expeditorUserId: "", weekdays: [], legacyVisitDate: "", legacyExpeditorPhone: "" };
}

function assignmentRowHasData(a: ClientRow["agent_assignments"][number]): boolean {
  const wd = Array.isArray(a.visit_weekdays) ? a.visit_weekdays.filter((x) => x >= 1 && x <= 7) : [];
  return (
    a.agent_id != null ||
    a.expeditor_user_id != null ||
    wd.length > 0 ||
    (a.visit_date != null && String(a.visit_date).trim() !== "") ||
    (a.expeditor_phone != null && a.expeditor_phone.trim() !== "")
  );
}

function buildAgentSlots(client: ClientRow): AgentSlotForm[] {
  const list = client.agent_assignments;
  const rows: AgentSlotForm[] = [];
  if (Array.isArray(list) && list.length > 0) {
    const sorted = [...list].sort((a, b) => a.slot - b.slot);
    for (const a of sorted) {
      if (!assignmentRowHasData(a)) continue;
      const wd = Array.isArray(a.visit_weekdays) ? a.visit_weekdays.filter((x) => x >= 1 && x <= 7) : [];
      rows.push({
        agentId: a.agent_id != null ? String(a.agent_id) : "",
        expeditorUserId: a.expeditor_user_id != null ? String(a.expeditor_user_id) : "",
        weekdays: wd,
        legacyVisitDate: isoToDateInput(a.visit_date),
        legacyExpeditorPhone: a.expeditor_phone ?? ""
      });
    }
  }
  if (rows.length === 0 && client.agent_id != null) {
    rows.push({
      agentId: String(client.agent_id),
      expeditorUserId: "",
      weekdays: [],
      legacyVisitDate: isoToDateInput(client.visit_date),
      legacyExpeditorPhone: ""
    });
  }
  return rows.length > 0 ? rows : [emptyAgentSlot()];
}

function toggleWeekday(slot: AgentSlotForm, day: number): number[] {
  const set = new Set(slot.weekdays);
  if (set.has(day)) set.delete(day);
  else set.add(day);
  return Array.from(set).sort((a, b) => a - b);
}

function Caption({ children, variant }: { children: ReactNode; variant?: "write" | "pick" }) {
  return (
    <p
      className={cn(
        "text-[11px] font-medium uppercase tracking-wide",
        variant === "write" && "text-blue-600 dark:text-blue-400",
        variant === "pick" && "text-emerald-700 dark:text-emerald-400",
        !variant && "text-muted-foreground"
      )}
    >
      {children}
    </p>
  );
}

function SpravochnikAdminLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
    >
      {children}
    </Link>
  );
}

/** Standart markaz (Toshkent atrofi) */
const MAP_DEFAULT_LAT = 41.311081;
const MAP_DEFAULT_LON = 69.279737;

/**
 * Ichki ko‘rinish: OpenStreetMap embed (CSP sababli Yandex map-widget `cs.js` xatolarini bermaydi).
 * Yandex — faqat qidiruv va «to‘liq xarita» havolalari orqali.
 */
function openStreetMapEmbedUrl(lat: number, lon: number, withMarker: boolean): string {
  const dLat = withMarker ? 0.006 : 0.11;
  const dLon = withMarker ? 0.008 : 0.14;
  const minLon = lon - dLon;
  const minLat = lat - dLat;
  const maxLon = lon + dLon;
  const maxLat = lat + dLat;
  const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
  let url = `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(bbox)}&layer=mapnik`;
  if (withMarker) {
    url += `&marker=${encodeURIComponent(`${lat},${lon}`)}`;
  }
  return url;
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
  const [tab, setTab] = useState<"main" | "extra">("main");

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
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [street, setStreet] = useState("");
  const [houseNumber, setHouseNumber] = useState("");
  const [apartment, setApartment] = useState("");
  const [gpsText, setGpsText] = useState("");
  const [notes, setNotes] = useState("");
  const [clientFormat, setClientFormat] = useState("");
  const [clientCode, setClientCode] = useState("");
  const [salesChannel, setSalesChannel] = useState("");
  const [productCategoryRef, setProductCategoryRef] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankMfo, setBankMfo] = useState("");
  const [clientPinfl, setClientPinfl] = useState("");
  const [oked, setOked] = useState("");
  const [contractNumber, setContractNumber] = useState("");
  const [vatRegCode, setVatRegCode] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [zone, setZone] = useState("");
  const [mapSearchText, setMapSearchText] = useState("");
  const [agentSlots, setAgentSlots] = useState<AgentSlotForm[]>(() => [emptyAgentSlot()]);

  const clientQ = useQuery({
    queryKey: ["client", tenantSlug, clientId],
    enabled: Boolean(tenantSlug) && clientId > 0,
    staleTime: STALE.detail,
    queryFn: async () => {
      const { data } = await api.get<ClientDetailApi>(`/api/${tenantSlug}/clients/${clientId}`);
      return data;
    }
  });

  const agentsPickerQ = useQuery({
    queryKey: ["agents", tenantSlug, "client-edit"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{
        data: Array<{ id: number; fio: string; login: string; is_active: boolean }>;
      }>(`/api/${tenantSlug}/agents`);
      return data.data
        .filter((r) => r.is_active)
        .map((r) => ({ id: r.id, name: r.fio, login: r.login }));
    }
  });

  const expeditorsPickerQ = useQuery({
    queryKey: ["expeditors", tenantSlug, "client-edit"],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{
        data: Array<{ id: number; fio: string; login: string; is_active: boolean }>;
      }>(`/api/${tenantSlug}/expeditors`);
      return data.data
        .filter((r) => r.is_active)
        .map((r) => ({ id: r.id, name: r.fio, login: r.login }));
    }
  });

  const refsQ = useQuery({
    queryKey: ["clients-references", tenantSlug],
    enabled: Boolean(tenantSlug),
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{
        categories: string[];
        client_type_codes: string[];
        regions: string[];
        districts: string[];
        cities: string[];
        neighborhoods: string[];
        zones: string[];
        client_formats: string[];
        sales_channels: string[];
        product_category_refs: string[];
        logistics_services: string[];
        category_options?: { value: string; label: string }[];
        client_type_options?: { value: string; label: string }[];
        client_format_options?: { value: string; label: string }[];
        sales_channel_options?: { value: string; label: string }[];
        city_options?: { value: string; label: string }[];
        region_options?: { value: string; label: string }[];
        city_territory_hints?: Record<
          string,
          {
            region_stored: string | null;
            region_label: string | null;
            zone_stored: string | null;
            zone_label: string | null;
            district_stored: string | null;
            district_label: string | null;
          }
        >;
      }>(`/api/${tenantSlug}/clients/references`);
      return data;
    }
  });

  const catOpts = useMemo(() => {
    const d = refsQ.data;
    if (!d) return [];
    if (d.category_options?.length) {
      return mergeRefSelectOptions(category, d.category_options, d.categories);
    }
    return mergeRefOptions(category, d.categories).map((v) => ({ value: v, label: v }));
  }, [category, refsQ.data]);
  const typeOpts = useMemo(() => {
    const d = refsQ.data;
    if (!d) return [];
    if (d.client_type_options?.length) {
      return mergeRefSelectOptions(clientTypeCode, d.client_type_options, d.client_type_codes);
    }
    return mergeRefOptions(clientTypeCode, d.client_type_codes).map((v) => ({ value: v, label: v }));
  }, [clientTypeCode, refsQ.data]);
  const terrOpts = useMemo(() => {
    const d = refsQ.data;
    if (!d) return [];
    if (d.region_options?.length) {
      return mergeRefSelectOptions(region, d.region_options, d.regions);
    }
    return mergeRefOptions(region, d.regions).map((v) => ({ value: v, label: v }));
  }, [region, refsQ.data]);
  const formatOpts = useMemo(() => {
    const d = refsQ.data;
    if (!d) return [];
    if (d.client_format_options?.length) {
      return mergeRefSelectOptions(clientFormat, d.client_format_options, d.client_formats);
    }
    return mergeRefOptions(clientFormat, d.client_formats).map((v) => ({ value: v, label: v }));
  }, [clientFormat, refsQ.data]);
  const salesOpts = useMemo(() => {
    const d = refsQ.data;
    if (!d) return [];
    if (d.sales_channel_options?.length) {
      return mergeRefSelectOptions(salesChannel, d.sales_channel_options, d.sales_channels);
    }
    return mergeRefOptions(salesChannel, d.sales_channels).map((v) => ({ value: v, label: v }));
  }, [salesChannel, refsQ.data]);
  const prodCatOpts = useMemo(
    () => mergeRefOptions(productCategoryRef, refsQ.data?.product_category_refs),
    [productCategoryRef, refsQ.data?.product_category_refs]
  );
  const cityOpts = useMemo(() => {
    const d = refsQ.data;
    if (!d) return [];
    if (d.city_options?.length) {
      return mergeRefSelectOptions(city, d.city_options, d.cities);
    }
    return mergeRefOptions(city, d.cities).map((v) => ({ value: v, label: v }));
  }, [city, refsQ.data]);
  const distOpts = useMemo(() => mergeRefOptions(district, refsQ.data?.districts), [district, refsQ.data?.districts]);
  const neiOpts = useMemo(
    () => mergeRefOptions(neighborhood, refsQ.data?.neighborhoods),
    [neighborhood, refsQ.data?.neighborhoods]
  );
  const zoneOpts = useMemo(() => mergeRefOptions(zone, refsQ.data?.zones), [zone, refsQ.data?.zones]);
  const logOpts = useMemo(
    () => mergeRefOptions(logisticsService, refsQ.data?.logistics_services),
    [logisticsService, refsQ.data?.logistics_services]
  );

  const cityHint = useMemo(
    () => pickCityTerritoryHint(refsQ.data?.city_territory_hints, city),
    [refsQ.data?.city_territory_hints, city]
  );

  const onCitySelect = (next: string) => {
    setCity(next);
    const h = pickCityTerritoryHint(refsQ.data?.city_territory_hints, next);
    if (!h) return;
    if (h.region_stored) setRegion(h.region_stored);
    if (h.zone_stored) setZone(h.zone_stored);
    if (h.district_stored) setDistrict(h.district_stored);
  };

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
    setCity(client.city ?? "");
    setDistrict(client.district ?? "");
    setNeighborhood(client.neighborhood ?? "");
    setStreet(client.street ?? "");
    setHouseNumber(client.house_number ?? "");
    setApartment(client.apartment ?? "");
    setGpsText(client.gps_text ?? "");
    setNotes(client.notes ?? "");
    setClientFormat(client.client_format ?? "");
    setClientCode(client.client_code ?? "");
    setSalesChannel(client.sales_channel ?? "");
    setProductCategoryRef(client.product_category_ref ?? "");
    setBankName(client.bank_name ?? "");
    setBankAccount(client.bank_account ?? "");
    setBankMfo(client.bank_mfo ?? "");
    setClientPinfl(client.client_pinfl ?? "");
    setOked(client.oked ?? "");
    setContractNumber(client.contract_number ?? "");
    setVatRegCode(client.vat_reg_code ?? "");
    setLatitude(client.latitude ?? "");
    setLongitude(client.longitude ?? "");
    setZone(client.zone ?? "");
    setAgentSlots(buildAgentSlots(client));
  }, [clientQ.data]);

  useEffect(() => {
    const client = clientQ.data;
    const hints = refsQ.data?.city_territory_hints;
    if (!client || !hints) return;
    const c = client.city?.trim();
    if (!c) return;
    const h = pickCityTerritoryHint(hints, c);
    if (!h) return;
    if (h.region_stored) setRegion(h.region_stored);
    if (h.zone_stored) setZone(h.zone_stored);
    if (h.district_stored) setDistrict(h.district_stored);
  }, [clientQ.data?.id, refsQ.data?.city_territory_hints]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!tenantSlug) throw new Error("Нет данных");
      const credit = Number.parseFloat(creditLimit.replace(/\s/g, "").replace(",", "."));
      if (!Number.isFinite(credit) || credit < 0) {
        throw new Error("Некорректный кредитный лимит");
      }

      const filled = agentSlots.filter(
        (s) =>
          s.agentId.trim() !== "" ||
          s.expeditorUserId.trim() !== "" ||
          s.weekdays.length > 0 ||
          s.legacyVisitDate.trim() !== "" ||
          s.legacyExpeditorPhone.trim() !== ""
      );
      const agent_assignments = filled.map((s, idx) => {
        const slot = idx + 1;
        let agent_id: number | null = null;
        if (s.agentId.trim() !== "") {
          const n = Number.parseInt(s.agentId, 10);
          if (!Number.isFinite(n) || n <= 0) throw new Error(`Некорректный выбор агента в строке ${slot}`);
          agent_id = n;
        }
        let expeditor_user_id: number | null = null;
        if (s.expeditorUserId.trim() !== "") {
          const e = Number.parseInt(s.expeditorUserId, 10);
          if (!Number.isFinite(e) || e <= 0) throw new Error(`Некорректный доставщик в строке ${slot}`);
          expeditor_user_id = e;
        }
        return {
          slot,
          agent_id,
          visit_date: s.legacyVisitDate.trim() ? dateInputToIso(s.legacyVisitDate) : null,
          expeditor_phone: s.legacyExpeditorPhone.trim() || null,
          expeditor_user_id,
          visit_weekdays: s.weekdays.length ? s.weekdays : undefined
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
        city: city.trim() || null,
        district: district.trim() || null,
        neighborhood: neighborhood.trim() || null,
        street: street.trim() || null,
        house_number: houseNumber.trim() || null,
        apartment: apartment.trim() || null,
        gps_text: gpsText.trim() || null,
        notes: notes.trim() || null,
        client_format: clientFormat.trim() || null,
        client_code: clientCode.trim().slice(0, 20) || null,
        sales_channel: salesChannel.trim() || null,
        product_category_ref: productCategoryRef.trim() || null,
        bank_name: bankName.trim() || null,
        bank_account: bankAccount.trim() || null,
        bank_mfo: bankMfo.trim() || null,
        client_pinfl: clientPinfl.trim() || null,
        oked: oked.trim() || null,
        contract_number: contractNumber.trim() || null,
        vat_reg_code: vatRegCode.trim() || null,
        latitude: latitude.trim() === "" ? null : latitude.trim(),
        longitude: longitude.trim() === "" ? null : longitude.trim(),
        zone: zone.trim() || null,
        agent_assignments
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
        setLocalError("Сессия истекла — войдите снова.");
        return;
      }
      if (ax.response?.status === 403) {
        setLocalError("Нет доступа (только администратор или оператор).");
        return;
      }
      setLocalError(e instanceof Error ? e.message : "Ошибка сохранения");
    }
  });

  const inputCls =
    "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";
  const selectCls = inputCls;

  const latN = latitude.trim().replace(",", ".");
  const lonN = longitude.trim().replace(",", ".");
  const mapOk =
    latN !== "" && lonN !== "" && Number.isFinite(Number.parseFloat(latN)) && Number.isFinite(Number.parseFloat(lonN));
  const latNum = mapOk ? Number.parseFloat(latN) : MAP_DEFAULT_LAT;
  const lonNum = mapOk ? Number.parseFloat(lonN) : MAP_DEFAULT_LON;
  const mapEmbedUrl = openStreetMapEmbedUrl(latNum, lonNum, mapOk);
  const yandexMapsHref = mapOk
    ? `https://yandex.com/maps/?pt=${encodeURIComponent(lonN)},${encodeURIComponent(latN)}&z=17&l=map`
    : `https://yandex.com/maps/?ll=${encodeURIComponent(String(MAP_DEFAULT_LON))}%2C${encodeURIComponent(String(MAP_DEFAULT_LAT))}&z=11`;

  if (clientQ.isError) {
    return (
      <div className="space-y-4">
        <PageHeader title="Редактирование клиента" description="Ошибка загрузки" />
        <p className="text-sm text-destructive">Не удалось загрузить карточку.</p>
        <Button type="button" variant="outline" onClick={onCancel}>
          Назад
        </Button>
      </div>
    );
  }

  if (!clientQ.data && clientQ.isLoading) {
    return <p className="text-sm text-muted-foreground">Загрузка…</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-[min(100%,90rem)] flex-col gap-4 px-3 pb-10 pt-1 sm:px-4 lg:px-6">
      <PageHeader
        title="Редактирование клиента"
        description="На основной вкладке: сверху ввод с клавиатуры, ниже — выбор из справочников. Команда и карта справа."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            Назад
          </Button>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-xs">
        <div className="flex flex-wrap gap-3">
          <span>
            <span className="text-blue-600 dark:text-blue-400">■</span> Ввод с клавиатуры
          </span>
          <span>
            <span className="text-emerald-700 dark:text-emerald-400">■</span> Выбор из справочников (
            <Link href="/settings/spravochnik/client-lists" className="underline underline-offset-2">
              справочники клиента
            </Link>
            ,{" "}
            <Link href="/settings/spravochnik/agents" className="underline underline-offset-2">
              агенты
            </Link>
            ,{" "}
            <Link href="/settings/spravochnik/expeditors" className="underline underline-offset-2">
              экспедиторы
            </Link>
            )
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {(
          [
            ["main", "Основные сведения"],
            ["extra", "Дополнительно"]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={cn(
              "rounded-t-md border border-b-0 px-3 py-2 text-sm font-medium transition-colors",
              tab === id
                ? "border-border bg-background text-foreground"
                : "border-transparent bg-muted/40 text-muted-foreground hover:bg-muted/60"
            )}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "main" && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.95fr)] xl:gap-8">
          <div className="flex flex-col gap-6">
            <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-5">
              <Caption variant="write">Ввод с клавиатуры</Caption>
              <p className="mt-1 text-xs text-muted-foreground">
                Название, адрес, телефон и др. — вводятся напрямую.
              </p>
              <div className="mt-4 grid gap-4">
                <div className="grid gap-1.5">
                  <Label htmlFor="ce-name">Название</Label>
                  <Input id="ce-name" value={name} onChange={(e) => setName(e.target.value)} disabled={mutation.isPending} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ce-legal">Юр. название / фирма</Label>
                  <Input
                    id="ce-legal"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    disabled={mutation.isPending}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ce-addr">Адрес</Label>
                  <Input id="ce-addr" value={address} onChange={(e) => setAddress(e.target.value)} disabled={mutation.isPending} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ce-land">Ориентир</Label>
                  <Input id="ce-land" value={landmark} onChange={(e) => setLandmark(e.target.value)} disabled={mutation.isPending} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="ce-phone">Телефон</Label>
                    <Input id="ce-phone" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={mutation.isPending} />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="ce-code">Код</Label>
                    <Input
                      id="ce-code"
                      maxLength={20}
                      value={clientCode}
                      onChange={(e) => setClientCode(e.target.value)}
                      disabled={mutation.isPending}
                    />
                    <span className="text-[10px] text-muted-foreground">{clientCode.length} / 20</span>
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ce-contact">Контактное лицо</Label>
                  <Input
                    id="ce-contact"
                    placeholder="ФИО или краткая пометка"
                    value={responsiblePerson}
                    onChange={(e) => setResponsiblePerson(e.target.value)}
                    disabled={mutation.isPending}
                  />
                </div>
                <div className="flex items-center gap-2 rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2">
                  <input
                    id="ce-active"
                    type="checkbox"
                    className="h-4 w-4 rounded border-input accent-primary"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    disabled={mutation.isPending}
                  />
                  <Label htmlFor="ce-active" className="font-normal">
                    Активный
                  </Label>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ce-notes">Примечание</Label>
                  <textarea
                    id="ce-notes"
                    className={`${inputCls} min-h-[100px] resize-y py-2.5`}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={mutation.isPending}
                  />
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-5">
              <Caption variant="pick">Справочники</Caption>
              <p className="mt-1 text-xs text-muted-foreground">
                Списки заполняет администратор в{" "}
                <SpravochnikAdminLink href="/settings/spravochnik/client-lists">справочниках клиента</SpravochnikAdminLink>{" "}
                (категория, район, махалля, зона, логистика и др.) и в{" "}
                <SpravochnikAdminLink href="/settings/territories">территориях компании</SpravochnikAdminLink>.
              </p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="mb-0">Категория</Label>
                    <SpravochnikAdminLink href="/settings/client-categories">Значения</SpravochnikAdminLink>
                  </div>
                  <FilterSelect
                    className={cn(selectCls, "min-w-0 max-w-none")}
                    emptyLabel="Категория"
                    aria-label="Категория"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    disabled={mutation.isPending}
                  >
                    {catOpts.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="mb-0">Тип</Label>
                    <SpravochnikAdminLink href="/settings/client-types">Значения</SpravochnikAdminLink>
                  </div>
                  <FilterSelect
                    className={cn(selectCls, "min-w-0 max-w-none")}
                    emptyLabel="Тип"
                    aria-label="Тип"
                    value={clientTypeCode}
                    onChange={(e) => setClientTypeCode(e.target.value)}
                    disabled={mutation.isPending}
                  >
                    {typeOpts.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="mb-0">Область</Label>
                    <SpravochnikAdminLink href="/settings/territories">Территории</SpravochnikAdminLink>
                  </div>
                  <FilterSelect
                    className={cn(selectCls, "min-w-0 max-w-none")}
                    emptyLabel="Область"
                    aria-label="Область"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    disabled={mutation.isPending}
                  >
                    {terrOpts.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="mb-0">Формат клиента</Label>
                    <SpravochnikAdminLink href="/settings/client-formats">Значения</SpravochnikAdminLink>
                  </div>
                  <FilterSelect
                    className={cn(selectCls, "min-w-0 max-w-none")}
                    emptyLabel="Формат клиента"
                    aria-label="Формат клиента"
                    value={clientFormat}
                    onChange={(e) => setClientFormat(e.target.value)}
                    disabled={mutation.isPending}
                  >
                    {formatOpts.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-5">
              <Caption>Адрес (детально, необязательно)</Caption>
              <p className="mt-1 text-xs text-muted-foreground">
                Список задаётся в{" "}
                <SpravochnikAdminLink href="/settings/spravochnik/client-lists#ref-city">справочниках клиента</SpravochnikAdminLink>
                ; значения из существующих клиентов тоже попадают в список. При выборе города область и зона подставляются из дерева
                территорий (если оно настроено).
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="mb-0">Город (код в БД)</Label>
                    <SpravochnikAdminLink href="/settings/spravochnik/client-lists#ref-city">Значения</SpravochnikAdminLink>
                  </div>
                  <FilterSelect
                    className={cn(selectCls, "min-w-0 max-w-none")}
                    emptyLabel="Город"
                    aria-label="Город"
                    value={city}
                    onChange={(e) => onCitySelect(e.target.value)}
                    disabled={mutation.isPending}
                  >
                    {cityOpts.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </FilterSelect>
                  {cityHint ? (
                    <p className="text-[11px] text-muted-foreground">
                      По дереву территорий: <span className="font-medium text-foreground">область</span> —{" "}
                      {cityHint.region_label ?? cityHint.region_stored ?? "—"};{" "}
                      {(cityHint.district_label ?? cityHint.district_stored)?.trim() ? (
                        <>
                          <span className="font-medium text-foreground">район</span> —{" "}
                          {cityHint.district_label ?? cityHint.district_stored};{" "}
                        </>
                      ) : null}
                      <span className="font-medium text-foreground">зона</span> —{" "}
                      {cityHint.zone_label ?? cityHint.zone_stored ?? "—"}
                    </p>
                  ) : null}
                </div>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="mb-0">Район</Label>
                    <SpravochnikAdminLink href="/settings/spravochnik/client-lists#ref-district">Значения</SpravochnikAdminLink>
                  </div>
                  <FilterSelect
                    className={cn(selectCls, "min-w-0 max-w-none")}
                    emptyLabel="Район"
                    aria-label="Район"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                    disabled={mutation.isPending}
                  >
                    {distOpts.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="mb-0">Махалля</Label>
                    <SpravochnikAdminLink href="/settings/spravochnik/client-lists#ref-neighborhood">Значения</SpravochnikAdminLink>
                  </div>
                  <FilterSelect
                    className={cn(selectCls, "min-w-0 max-w-none")}
                    emptyLabel="Махалля"
                    aria-label="Махалля"
                    value={neighborhood}
                    onChange={(e) => setNeighborhood(e.target.value)}
                    disabled={mutation.isPending}
                  >
                    {neiOpts.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="mb-0">Зона</Label>
                    <SpravochnikAdminLink href="/settings/spravochnik/client-lists#ref-zone">Значения</SpravochnikAdminLink>
                  </div>
                  <FilterSelect
                    className={cn(selectCls, "min-w-0 max-w-none")}
                    emptyLabel="Зона"
                    aria-label="Зона"
                    value={zone}
                    onChange={(e) => setZone(e.target.value)}
                    disabled={mutation.isPending}
                  >
                    {zoneOpts.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </FilterSelect>
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="ce-str">Улица</Label>
                  <Input id="ce-str" value={street} onChange={(e) => setStreet(e.target.value)} disabled={mutation.isPending} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ce-house">Дом</Label>
                  <Input
                    id="ce-house"
                    value={houseNumber}
                    onChange={(e) => setHouseNumber(e.target.value)}
                    disabled={mutation.isPending}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="ce-apt">Квартира</Label>
                  <Input
                    id="ce-apt"
                    value={apartment}
                    onChange={(e) => setApartment(e.target.value)}
                    disabled={mutation.isPending}
                  />
                </div>
                <div className="grid gap-1.5 sm:col-span-2">
                  <Label htmlFor="ce-gps">Текст GPS</Label>
                  <Input id="ce-gps" value={gpsText} onChange={(e) => setGpsText(e.target.value)} disabled={mutation.isPending} />
                </div>
              </div>
            </section>
          </div>

          <div className="flex flex-col gap-6">
            <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-5">
              <Caption variant="write">Карта</Caption>
              <p className="mt-1 text-xs text-muted-foreground">
                Предпросмотр — OpenStreetMap. Для точки на карте укажите широту и долготу. Поиск по адресу — Yandex (поле и ссылка ниже).
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <Input
                  className={cn(inputCls, "sm:flex-1")}
                  placeholder="Адрес или объект (поиск в Yandex)"
                  value={mapSearchText}
                  onChange={(e) => setMapSearchText(e.target.value)}
                  disabled={mutation.isPending}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    const t = mapSearchText.trim();
                    if (!t) return;
                    window.open(`https://yandex.com/maps/?text=${encodeURIComponent(t)}`, "_blank", "noopener,noreferrer");
                  }}
                />
                <Button
                  type="button"
                  variant="secondary"
                  className="h-10 shrink-0 sm:w-auto"
                  disabled={mutation.isPending || !mapSearchText.trim()}
                  onClick={() => {
                    const t = mapSearchText.trim();
                    if (!t) return;
                    window.open(`https://yandex.com/maps/?text=${encodeURIComponent(t)}`, "_blank", "noopener,noreferrer");
                  }}
                >
                  Поиск
                </Button>
              </div>
              <div className="relative mt-3 overflow-hidden rounded-lg border bg-muted/30">
                <iframe
                  title="Карта — OpenStreetMap"
                  src={mapEmbedUrl}
                  width="100%"
                  height={420}
                  className="block min-h-[280px] w-full border-0 sm:min-h-[360px]"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                {!mapOk ? (
                  <div className="pointer-events-none absolute bottom-2 left-2 right-2 rounded-md bg-background/95 px-2 py-1.5 text-center text-[11px] text-muted-foreground shadow-sm ring-1 ring-border/60">
                    Точка на карте: введите широту и долготу ниже
                  </div>
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <Label htmlFor="ce-lat">Широта</Label>
                  <Input
                    id="ce-lat"
                    inputMode="decimal"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    disabled={mutation.isPending}
                  />
                </div>
                <div className="grid gap-1">
                  <Label htmlFor="ce-lon">Долгота</Label>
                  <Input
                    id="ce-lon"
                    inputMode="decimal"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    disabled={mutation.isPending}
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setLatitude("");
                    setLongitude("");
                  }}
                  disabled={mutation.isPending}
                >
                  Очистить координаты
                </Button>
                <a
                  href={yandexMapsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center text-sm text-primary underline-offset-4 hover:underline"
                >
                  {mapOk ? "Открыть на полной карте" : "Яндекс.Карты (новая вкладка)"}
                </a>
              </div>
            </section>

            <div className="rounded-lg border bg-card p-4 shadow-sm">
              <Caption variant="pick">
                Команда (агент / доставщик — в разделе пользователей)
              </Caption>
              <p className="mt-1 text-xs text-muted-foreground">
                Можно добавить несколько команд подряд (макс. {MAX_TEAM_ROWS}).
              </p>
              <div className="mt-3 space-y-3">
                {agentSlots.map((slot, idx) => (
                  <div key={idx} className="rounded-md border bg-background p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-muted-foreground">Команда {idx + 1}</span>
                      {agentSlots.length > 1 ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          disabled={mutation.isPending}
                          onClick={() => {
                            setAgentSlots((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
                          }}
                        >
                          Удалить
                        </Button>
                      ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Агент</Label>
                        <FilterSelect
                          className={cn(selectCls, "min-w-0 max-w-none")}
                          emptyLabel="Агент"
                          aria-label="Агент"
                          value={slot.agentId}
                          onChange={(e) => {
                            const next = [...agentSlots];
                            next[idx] = { ...next[idx], agentId: e.target.value };
                            setAgentSlots(next);
                          }}
                          disabled={mutation.isPending}
                        >
                          {(agentsPickerQ.data ?? []).map((u) => (
                            <option key={u.id} value={String(u.id)}>
                              {u.name} ({u.login})
                            </option>
                          ))}
                        </FilterSelect>
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Доставщик</Label>
                        <FilterSelect
                          className={cn(selectCls, "min-w-0 max-w-none")}
                          emptyLabel="Доставщик"
                          aria-label="Доставщик"
                          value={slot.expeditorUserId}
                          onChange={(e) => {
                            const next = [...agentSlots];
                            next[idx] = { ...next[idx], expeditorUserId: e.target.value };
                            setAgentSlots(next);
                          }}
                          disabled={mutation.isPending}
                        >
                          {(expeditorsPickerQ.data ?? []).map((u) => (
                            <option key={u.id} value={String(u.id)}>
                              {u.name} ({u.login})
                            </option>
                          ))}
                        </FilterSelect>
                      </div>
                    </div>
                    <div className="mt-3">
                      <Label className="text-xs text-muted-foreground">День посещения (неделя)</Label>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {VISIT_DAYS.map(({ k, l }) => (
                          <label key={k} className="flex cursor-pointer items-center gap-1.5 text-xs">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-input accent-primary"
                              checked={slot.weekdays.includes(k)}
                              onChange={() => {
                                const next = [...agentSlots];
                                next[idx] = { ...next[idx], weekdays: toggleWeekday(next[idx], k) };
                                setAgentSlots(next);
                              }}
                              disabled={mutation.isPending}
                            />
                            {l}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={mutation.isPending || agentSlots.length >= MAX_TEAM_ROWS}
                  onClick={() => setAgentSlots((prev) => (prev.length >= MAX_TEAM_ROWS ? prev : [...prev, emptyAgentSlot()]))}
                >
                  Добавить
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "extra" && (
        <div className="mx-auto w-full max-w-4xl space-y-6">
          <section className="rounded-lg border bg-card p-4 shadow-sm sm:p-5">
            <Caption variant="pick">Выбор из справочника</Caption>
            <p className="mt-1 text-xs text-muted-foreground">
              Значения создаются в разделе{" "}
              <SpravochnikAdminLink href="/settings/spravochnik/client-lists#ref-prod-cat">
                справочники клиента
              </SpravochnikAdminLink>
              .
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0">Категория продукта</Label>
                  <SpravochnikAdminLink href="/settings/spravochnik/client-lists#ref-prod-cat">Значения</SpravochnikAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Категория продукта"
                  aria-label="Категория продукта"
                  value={productCategoryRef}
                  onChange={(e) => setProductCategoryRef(e.target.value)}
                  disabled={mutation.isPending}
                >
                  {prodCatOpts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0">Канал продаж</Label>
                  <SpravochnikAdminLink href="/settings/spravochnik/client-lists#ref-sales">Значения</SpravochnikAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Канал продаж"
                  aria-label="Канал продаж"
                  value={salesChannel}
                  onChange={(e) => setSalesChannel(e.target.value)}
                  disabled={mutation.isPending}
                >
                  {salesOpts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </FilterSelect>
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <Caption variant="write">Ввод с клавиатуры</Caption>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ce-bank">Bank</Label>
                <Input id="ce-bank" value={bankName} onChange={(e) => setBankName(e.target.value)} disabled={mutation.isPending} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ce-rs">Расчётный счёт</Label>
                <Input
                  id="ce-rs"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ce-mfo">MFO</Label>
                <Input id="ce-mfo" value={bankMfo} onChange={(e) => setBankMfo(e.target.value)} disabled={mutation.isPending} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ce-inn">INN</Label>
                <Input id="ce-inn" value={inn} onChange={(e) => setInn(e.target.value)} disabled={mutation.isPending} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ce-pinfl">JSHSHIR / PINFL</Label>
                <Input
                  id="ce-pinfl"
                  inputMode="numeric"
                  value={clientPinfl}
                  onChange={(e) => setClientPinfl(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ce-oked">OKED / OKONH</Label>
                <Input id="ce-oked" value={oked} onChange={(e) => setOked(e.target.value)} disabled={mutation.isPending} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ce-contract">Договор №</Label>
                <Input
                  id="ce-contract"
                  value={contractNumber}
                  onChange={(e) => setContractNumber(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="ce-vat">Код регистрации по НДС</Label>
                <Input
                  id="ce-vat"
                  value={vatRegCode}
                  onChange={(e) => setVatRegCode(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4 shadow-sm">
            <Caption>Прочее (ввод или выбор)</Caption>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-1.5">
                <Label htmlFor="ce-credit">Кредитный лимит (UZS)</Label>
                <Input
                  id="ce-credit"
                  inputMode="decimal"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
              <div className="grid gap-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label className="mb-0">Логистическая услуга</Label>
                  <SpravochnikAdminLink href="/settings/spravochnik/client-lists#ref-logistics">Значения</SpravochnikAdminLink>
                </div>
                <FilterSelect
                  className={cn(selectCls, "min-w-0 max-w-none")}
                  emptyLabel="Логистическая услуга"
                  aria-label="Логистическая услуга"
                  value={logisticsService}
                  onChange={(e) => setLogisticsService(e.target.value)}
                  disabled={mutation.isPending}
                >
                  {logOpts.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </FilterSelect>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ce-lic">Срок лицензии</Label>
                <Input
                  id="ce-lic"
                  type="date"
                  value={licenseUntil}
                  onChange={(e) => setLicenseUntil(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ce-wh">Часы работы</Label>
                <Input
                  id="ce-wh"
                  value={workingHours}
                  onChange={(e) => setWorkingHours(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
              <div className="grid gap-1.5 sm:col-span-2 lg:col-span-4">
                <Label htmlFor="ce-pdl">P-D-L</Label>
                <Input id="ce-pdl" value={pdl} onChange={(e) => setPdl(e.target.value)} disabled={mutation.isPending} />
              </div>
            </div>
          </section>
        </div>
      )}

      {localError ? <p className="text-sm text-destructive">{localError}</p> : null}

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={mutation.isPending}>
          Отмена
        </Button>
        <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? "Сохранение…" : "Сохранить"}
        </Button>
        <Link href={`/clients/${clientId}`} className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          К карточке
        </Link>
      </div>
    </div>
  );
}
