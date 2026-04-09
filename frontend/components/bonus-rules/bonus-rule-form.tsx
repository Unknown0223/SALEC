"use client";

import type { BonusRuleRow } from "@/components/bonus-rules/bonus-rule-types";
import { BonusRuleProductDualPanels } from "@/components/bonus-rules/bonus-rule-product-dual-panels";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type BonusType = "qty" | "sum" | "discount";

type CondForm = {
  min_qty: string;
  max_qty: string;
  step_qty: string;
  bonus_qty: string;
  max_bonus_qty: string;
};

type ClientRefEntry = { id: string; name: string; active?: boolean };

function isoToLocalDatetime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localDatetimeToIso(local: string): string | null {
  const t = local.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseIdList(s: string): number[] {
  return s
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => Number.parseInt(x, 10))
    .filter((n) => !Number.isNaN(n) && n > 0);
}

function formatIdList(ids: number[]): string {
  return ids.length ? ids.join(", ") : "";
}

const emptyCond = (): CondForm => ({
  min_qty: "",
  max_qty: "",
  step_qty: "6",
  bonus_qty: "1",
  max_bonus_qty: ""
});

const inputCls =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring";
const selectCls = cn(inputCls, "py-0");

function parseCondRow(c: CondForm) {
  const min_qty = c.min_qty.trim() === "" ? null : Number.parseFloat(c.min_qty);
  const max_qty = c.max_qty.trim() === "" ? null : Number.parseFloat(c.max_qty);
  const step_qty = Number.parseFloat(c.step_qty);
  const bonus_qty = Number.parseFloat(c.bonus_qty);
  const max_bonus_qty = c.max_bonus_qty.trim() === "" ? null : Number.parseFloat(c.max_bonus_qty);
  if (Number.isNaN(step_qty) || step_qty <= 0 || Number.isNaN(bonus_qty) || bonus_qty < 0) {
    throw new Error("Shart qatorlarida qadam va bonus sonini to‘ldiring");
  }
  if (min_qty != null && Number.isNaN(min_qty)) throw new Error("Min noto‘g‘ri");
  if (max_qty != null && Number.isNaN(max_qty)) throw new Error("Max noto‘g‘ri");
  if (min_qty != null && max_qty != null && min_qty > max_qty) throw new Error("min ≤ max bo‘lishi kerak");
  if (max_bonus_qty != null && (Number.isNaN(max_bonus_qty) || max_bonus_qty < 0)) {
    throw new Error("Maks. bonus noto‘g‘ri");
  }
  return {
    min_qty,
    max_qty,
    step_qty,
    bonus_qty,
    max_bonus_qty: max_bonus_qty != null && !Number.isNaN(max_bonus_qty) ? max_bonus_qty : null
  };
}

type Props = {
  tenantSlug: string;
  initialRule: BonusRuleRow | null;
};

export function BonusRuleForm({ tenantSlug, initialRule }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const isEdit = Boolean(initialRule);
  const seedKey = initialRule?.id ?? "new";

  const profileRefsQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "bonus-form-refs"],
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<{
        references: {
          payment_method_entries?: { name: string; active?: boolean }[];
          client_category_entries?: ClientRefEntry[];
        };
      }>(`/api/${tenantSlug}/settings/profile`);
      return data.references;
    }
  });

  const paymentOptions = (profileRefsQ.data?.payment_method_entries ?? []).filter((p) => p.active !== false);
  const clientCategoryOptions = (profileRefsQ.data?.client_category_entries ?? []).filter((c) => c.active !== false);

  const priceTypesQ = useQuery({
    queryKey: ["price-types", tenantSlug, "bonus-form"],
    staleTime: STALE.reference,
    queryFn: async () => {
      const { data } = await api.get<{ data: string[] }>(`/api/${tenantSlug}/price-types`);
      return data.data;
    }
  });

  const [name, setName] = useState("");
  const [type, setType] = useState<BonusType>("qty");
  const [minSum, setMinSum] = useState("");
  const [discountPct, setDiscountPct] = useState("");
  const [priority, setPriority] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [conditions, setConditions] = useState<CondForm[]>([emptyCond()]);
  const [clientCategory, setClientCategory] = useState("");
  const [paymentType, setPaymentType] = useState("");
  const [clientType, setClientType] = useState("");
  const [salesChannel, setSalesChannel] = useState("");
  const [priceType, setPriceType] = useState("");
  const [triggerProductIds, setTriggerProductIds] = useState<number[]>([]);
  const [bonusProductIds, setBonusProductIds] = useState<number[]>([]);
  /** UI da ko‘rsatilmaydi — mavjud qoida kategoriya filtrini saqlash uchun */
  const [categoryIdsStr, setCategoryIdsStr] = useState("");
  const [targetAllClients, setTargetAllClients] = useState(true);
  const [selectedClientIdsStr, setSelectedClientIdsStr] = useState("");
  const [isManual, setIsManual] = useState(false);
  const [inBlocks, setInBlocks] = useState(false);
  const [oncePerClient, setOncePerClient] = useState(false);
  const [onlyByAssortment, setOnlyByAssortment] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setLocalError(null);
    const rule = initialRule;
    if (rule) {
      setName(rule.name);
      setType((rule.type as BonusType) || "qty");
      setMinSum(rule.min_sum != null ? String(rule.min_sum) : "");
      setDiscountPct(rule.discount_pct != null ? String(rule.discount_pct) : "");
      setPriority(String(rule.priority));
      setIsActive(rule.is_active);
      setValidFrom(isoToLocalDatetime(rule.valid_from));
      setValidTo(isoToLocalDatetime(rule.valid_to));
      if (rule.conditions?.length) {
        setConditions(
          rule.conditions.map((c) => ({
            min_qty: c.min_qty != null ? String(c.min_qty) : "",
            max_qty: c.max_qty != null ? String(c.max_qty) : "",
            step_qty: String(c.step_qty),
            bonus_qty: String(c.bonus_qty),
            max_bonus_qty: c.max_bonus_qty != null ? String(c.max_bonus_qty) : ""
          }))
        );
      } else {
        setConditions([
          {
            min_qty: "",
            max_qty: "",
            step_qty: rule.buy_qty != null ? String(rule.buy_qty) : "6",
            bonus_qty: rule.free_qty != null ? String(rule.free_qty) : "1",
            max_bonus_qty: ""
          }
        ]);
      }
      setClientCategory(rule.client_category ?? "");
      setPaymentType(rule.payment_type ?? "");
      setClientType(rule.client_type ?? "");
      setSalesChannel(rule.sales_channel ?? "");
      setPriceType(rule.price_type ?? "");
      setTriggerProductIds([...(rule.product_ids ?? [])]);
      setBonusProductIds([...(rule.bonus_product_ids ?? [])]);
      setCategoryIdsStr(formatIdList(rule.product_category_ids ?? []));
      setTargetAllClients(rule.target_all_clients ?? true);
      setSelectedClientIdsStr(formatIdList(rule.selected_client_ids ?? []));
      setIsManual(rule.is_manual ?? false);
      setInBlocks(rule.in_blocks ?? false);
      setOncePerClient(rule.once_per_client ?? false);
      const hasScope =
        (rule.product_ids?.length ?? 0) > 0 || (rule.product_category_ids?.length ?? 0) > 0;
      setOnlyByAssortment(hasScope);
    } else {
      setName("");
      setType("qty");
      setMinSum("");
      setDiscountPct("");
      setPriority("0");
      setIsActive(true);
      setValidFrom("");
      setValidTo("");
      setConditions([emptyCond()]);
      setClientCategory("");
      setPaymentType("");
      setClientType("");
      setSalesChannel("");
      setPriceType("");
      setTriggerProductIds([]);
      setBonusProductIds([]);
      setCategoryIdsStr("");
      setTargetAllClients(true);
      setSelectedClientIdsStr("");
      setIsManual(false);
      setInBlocks(false);
      setOncePerClient(false);
      setOnlyByAssortment(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat id o‘zgarganda seed
  }, [seedKey]);

  const mutation = useMutation({
    mutationFn: async () => {
      const p = Number.parseInt(priority, 10);
      const product_ids = onlyByAssortment ? triggerProductIds : [];
      const payload: Record<string, unknown> = {
        name: name.trim(),
        type,
        priority: Number.isNaN(p) ? 0 : p,
        is_active: isActive,
        valid_from: localDatetimeToIso(validFrom),
        valid_to: localDatetimeToIso(validTo),
        client_category: clientCategory.trim() || null,
        payment_type: paymentType.trim() || null,
        client_type: clientType.trim() || null,
        sales_channel: salesChannel.trim() || null,
        price_type: priceType.trim() || null,
        product_ids,
        bonus_product_ids: bonusProductIds,
        product_category_ids: parseIdList(categoryIdsStr),
        target_all_clients: targetAllClients,
        selected_client_ids: targetAllClients ? [] : parseIdList(selectedClientIdsStr),
        is_manual: isManual,
        in_blocks: inBlocks,
        once_per_client: oncePerClient,
        one_plus_one_gift: isEdit && initialRule ? initialRule.one_plus_one_gift : false
      };

      if (type === "qty") {
        const rows = conditions.map(parseCondRow);
        payload.conditions = rows.map((r, i) => ({ ...r, sort_order: i }));
        payload.buy_qty = Math.floor(rows[0].step_qty);
        payload.free_qty = Math.floor(rows[0].bonus_qty);
        payload.min_sum = null;
        payload.discount_pct = null;
      } else if (type === "sum") {
        payload.min_sum = Number.parseFloat(minSum);
        payload.buy_qty = null;
        payload.free_qty = null;
        payload.discount_pct = null;
        payload.conditions = [];
      } else {
        payload.discount_pct = Number.parseFloat(discountPct);
        payload.buy_qty = null;
        payload.free_qty = null;
        payload.min_sum = null;
        payload.conditions = [];
      }

      if (isEdit && initialRule) {
        const { data } = await api.put(`/api/${tenantSlug}/bonus-rules/${initialRule.id}`, payload);
        return data;
      }
      const { data } = await api.post(`/api/${tenantSlug}/bonus-rules`, payload);
      return data;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["bonus-rules", tenantSlug] });
      if (initialRule?.id != null) {
        await qc.invalidateQueries({ queryKey: ["bonus-rule", tenantSlug, initialRule.id] });
      }
      router.push("/settings/bonus-rules/active");
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { data?: { error?: string }; status?: number } };
      if (ax.response?.status === 403) {
        setLocalError("Ruxsat yo‘q (faqat admin yoki operator).");
        return;
      }
      if (ax.response?.data?.error === "ValidationError") {
        setLocalError("Maydonlarni tekshiring.");
        return;
      }
      setLocalError(e instanceof Error ? e.message : "Saqlashda xato");
    }
  });

  const submit = () => {
    setLocalError(null);
    if (!name.trim()) return;
    if (onlyByAssortment) {
      const hasCategoryScope = parseIdList(categoryIdsStr).length > 0;
      if ((type === "qty" || type === "sum") && triggerProductIds.length === 0 && !hasCategoryScope) {
        setLocalError(
          "«Faqat assortiment» yoqilgan: chapdan mahsulot tanlang yoki (mavjud qoida) kategoriya filtri saqlangan bo‘lsa mahsulot qo‘shing."
        );
        return;
      }
      if (type === "discount" && triggerProductIds.length === 0 && !hasCategoryScope) {
        setLocalError("Assortiment cheklovi uchun kamida bitta mahsulot tanlang yoki «Faqat assortiment»ni o‘chiring.");
        return;
      }
    }
    if ((type === "qty" || type === "sum") && bonusProductIds.length === 0) {
      setLocalError("Kamida bitta bonus mahsulotni o‘ng ro‘yxatdan tanlang.");
      return;
    }
    try {
      if (type === "qty") {
        for (const row of conditions) parseCondRow(row);
      }
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Shartlarni tekshiring");
      return;
    }
    mutation.mutate();
  };

  const showBonusColumn = type === "qty" || type === "sum";
  const showTriggerColumn = type === "qty" || type === "sum" || (type === "discount" && onlyByAssortment);

  return (
    <div className="w-full space-y-6">
      <Card className="shadow-panel">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle>Asosiy sozlamalar</CardTitle>
          <CardDescription>
            Yuqorida — nom, bonus turi, muddat va profil filtrlari; pastda — to‘lov, kim uchun, usul va belgilar
            (ketma-ketlik uchun ustunlik oxirida).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 pt-6">
          {/* 1-bo‘lim: 2 qator — siqilishsiz, barcha ustunlarda bir xil label→maydon tartibi */}
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(14rem,22rem)] md:items-start">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="br-name">Nomi</Label>
                <Input
                  id="br-name"
                  className={inputCls}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="br-type">Bonus turi</Label>
                <select
                  id="br-type"
                  className={selectCls}
                  title="Qoida qanday hisoblanishini tanlang: miqdor, summa yoki foizli chegirma"
                  value={type}
                  onChange={(e) => setType(e.target.value as BonusType)}
                  disabled={mutation.isPending}
                >
                  <option value="qty">Miqdor bo‘yicha bonus</option>
                  <option value="sum">Buyurtma summasi bo‘yicha</option>
                  <option value="discount">Chegirma (%)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[minmax(12.5rem,1.15fr)_minmax(12.5rem,1.15fr)_minmax(11rem,1fr)_minmax(11rem,1fr)_minmax(5.25rem,5.5rem)]">
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="br-valid-from">Amal boshlanishi</Label>
                <Input
                  id="br-valid-from"
                  className={inputCls}
                  type="datetime-local"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
              <div className="grid min-w-0 gap-1.5">
                <Label htmlFor="br-valid-to">Amal tugashi</Label>
                <Input
                  id="br-valid-to"
                  className={inputCls}
                  type="datetime-local"
                  value={validTo}
                  onChange={(e) => setValidTo(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
              <div className="grid min-w-0 gap-1.5 sm:col-span-2 lg:col-span-1 xl:col-span-1">
                <Label htmlFor="br-client-cat">Mijoz kategoriyasi</Label>
                <select
                  id="br-client-cat"
                  className={selectCls}
                  value={
                    clientCategory &&
                    !clientCategoryOptions.some((c) => c.name === clientCategory)
                      ? `__custom:${clientCategory}`
                      : clientCategory
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    setClientCategory(v.startsWith("__custom:") ? v.slice(11) : v);
                  }}
                  disabled={mutation.isPending}
                >
                  <option value="">Barchasi</option>
                  {clientCategory &&
                  !clientCategoryOptions.some((c) => c.name === clientCategory) ? (
                    <option value={`__custom:${clientCategory}`}>{clientCategory} (joriy qiymat)</option>
                  ) : null}
                  {clientCategoryOptions.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid min-w-0 gap-1.5 sm:col-span-2 lg:col-span-1 xl:col-span-1">
                <Label htmlFor="br-price-type">Narx turi</Label>
                <select
                  id="br-price-type"
                  className={selectCls}
                  value={priceType}
                  onChange={(e) => setPriceType(e.target.value)}
                  disabled={mutation.isPending}
                >
                  <option value="">Barchasi</option>
                  {(priceTypesQ.data ?? []).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid min-w-0 gap-1.5 sm:col-span-2 lg:col-span-1 xl:col-span-1">
                <Label htmlFor="br-priority" title="Bir nechta qoida bo‘lsa, qaysi biri avval ishlashi">
                  Ustunlik
                </Label>
                <Input
                  id="br-priority"
                  className={cn(inputCls, "max-w-full xl:max-w-[5.5rem]")}
                  type="number"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  disabled={mutation.isPending}
                />
              </div>
            </div>
          </div>

          {/* 2-qator: to‘lov + yonma-yon guruhlar (kim / usul / holat / cheklovlar) */}
          <div className="flex flex-col gap-4 xl:flex-row xl:items-stretch">
            <div className="grid min-w-0 shrink-0 gap-1.5 xl:w-52 xl:max-w-[14rem]">
              <Label htmlFor="br-payment">To‘lov usuli</Label>
              <select
                id="br-payment"
                className={selectCls}
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                disabled={mutation.isPending}
              >
                <option value="">Barchasi</option>
                {paymentOptions.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="flex flex-col rounded-lg border border-border/80 bg-muted/15 p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Kim uchun
                </p>
                <div className="flex flex-col gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="br-target-clients"
                      className="h-4 w-4 accent-primary"
                      checked={targetAllClients}
                      onChange={() => setTargetAllClients(true)}
                      disabled={mutation.isPending}
                    />
                    Barcha mijozlar
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="br-target-clients"
                      className="h-4 w-4 accent-primary"
                      checked={!targetAllClients}
                      onChange={() => setTargetAllClients(false)}
                      disabled={mutation.isPending}
                    />
                    Tanlangan mijozlar
                  </label>
                </div>
                {!targetAllClients ? (
                  <div className="mt-3 grid gap-1.5 border-t border-border/60 pt-3">
                    <Label className="text-xs">Mijoz ID (vergul bilan)</Label>
                    <Input
                      className={inputCls}
                      value={selectedClientIdsStr}
                      onChange={(e) => setSelectedClientIdsStr(e.target.value)}
                      disabled={mutation.isPending}
                      placeholder="10, 20, 30"
                    />
                  </div>
                ) : null}
              </div>

              <div className="flex flex-col rounded-lg border border-border/80 bg-muted/15 p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Usul</p>
                <div className="flex flex-col gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="br-method"
                      className="h-4 w-4 accent-primary"
                      checked={!isManual}
                      onChange={() => setIsManual(false)}
                      disabled={mutation.isPending}
                    />
                    Avtomatik
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="br-method"
                      className="h-4 w-4 accent-primary"
                      checked={isManual}
                      onChange={() => setIsManual(true)}
                      disabled={mutation.isPending}
                    />
                    Qo‘lda
                  </label>
                </div>
              </div>

              <div className="flex flex-col rounded-lg border border-border/80 bg-muted/15 p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Holat</p>
                <div className="flex flex-col gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      disabled={mutation.isPending}
                    />
                    Faol
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={inBlocks}
                      onChange={(e) => setInBlocks(e.target.checked)}
                      disabled={mutation.isPending}
                    />
                    Bloklarda
                  </label>
                </div>
              </div>

              <div className="flex flex-col rounded-lg border border-border/80 bg-muted/15 p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Cheklovlar
                </p>
                <div className="flex flex-col gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={onlyByAssortment}
                      onChange={(e) => {
                        const v = e.target.checked;
                        setOnlyByAssortment(v);
                        if (!v) setTriggerProductIds([]);
                      }}
                      disabled={mutation.isPending}
                    />
                    Faqat assortiment
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={oncePerClient}
                      onChange={(e) => setOncePerClient(e.target.checked)}
                      disabled={mutation.isPending}
                    />
                    Har mijozga bir marta
                  </label>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-panel">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle>Shartlar</CardTitle>
          <CardDescription>
            {type === "qty"
              ? "Minimal / maksimal miqdor oralig‘i, qadam, bonus va maks. bonus. «Yana qo‘shish» bilan bir nechta pog‘ona."
              : type === "sum"
                ? "Buyurtma summasi ushbu qiymatdan oshganda."
                : "Buyurtmaga qo‘llanadigan chegirma foizi."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {type === "qty" ? (
            <>
              {conditions.map((row, idx) => (
                <div key={idx} className="rounded-xl border border-border/80 bg-muted/20 p-4">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">Shart #{idx + 1}</p>
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Minimal miqdor</Label>
                      <Input
                        className={inputCls}
                        value={row.min_qty}
                        onChange={(e) => {
                          const next = [...conditions];
                          next[idx] = { ...next[idx], min_qty: e.target.value };
                          setConditions(next);
                        }}
                        disabled={mutation.isPending}
                        placeholder="masalan 24"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Maks. miqdor (oralig‘)</Label>
                      <Input
                        className={inputCls}
                        value={row.max_qty}
                        onChange={(e) => {
                          const next = [...conditions];
                          next[idx] = { ...next[idx], max_qty: e.target.value };
                          setConditions(next);
                        }}
                        disabled={mutation.isPending}
                        placeholder="masalan 100"
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Qadam (har nechta)</Label>
                      <Input
                        className={inputCls}
                        value={row.step_qty}
                        onChange={(e) => {
                          const next = [...conditions];
                          next[idx] = { ...next[idx], step_qty: e.target.value };
                          setConditions(next);
                        }}
                        disabled={mutation.isPending}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Bonus miqdori</Label>
                      <Input
                        className={inputCls}
                        value={row.bonus_qty}
                        onChange={(e) => {
                          const next = [...conditions];
                          next[idx] = { ...next[idx], bonus_qty: e.target.value };
                          setConditions(next);
                        }}
                        disabled={mutation.isPending}
                      />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">Maks. bonus (jami chegara)</Label>
                      <Input
                        className={inputCls}
                        value={row.max_bonus_qty}
                        onChange={(e) => {
                          const next = [...conditions];
                          next[idx] = { ...next[idx], max_bonus_qty: e.target.value };
                          setConditions(next);
                        }}
                        disabled={mutation.isPending}
                      />
                    </div>
                  </div>
                  {conditions.length > 1 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => setConditions(conditions.filter((_, i) => i !== idx))}
                    >
                      Ushbu shartni o‘chirish
                    </Button>
                  ) : null}
                </div>
              ))}
              <Button
                type="button"
                className="w-full sm:w-auto"
                onClick={() => setConditions([...conditions, emptyCond()])}
                disabled={mutation.isPending}
              >
                Yana shart qo‘shish
              </Button>
            </>
          ) : null}

          {type === "sum" ? (
            <div className="grid max-w-md gap-1.5">
              <Label>Minimal summa</Label>
              <Input
                className={inputCls}
                type="number"
                min={0}
                step="0.01"
                value={minSum}
                onChange={(e) => setMinSum(e.target.value)}
                disabled={mutation.isPending}
              />
            </div>
          ) : null}

          {type === "discount" ? (
            <div className="grid max-w-md gap-1.5">
              <Label>Chegirma (%)</Label>
              <Input
                className={inputCls}
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value)}
                disabled={mutation.isPending}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {showTriggerColumn || showBonusColumn ? (
        <Card className="shadow-panel">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle>Mahsulotlar</CardTitle>
            <CardDescription>
              Chapda trigger, o‘ngda bonus mahsulotlari — faol mahsulotlar kategoriya bo‘yicha ochiladi. «Faqat
              assortiment» o‘chiq bo‘lsa ham ro‘yxat ko‘rinadi; tanlov saqlanmaydi, barcha mahsulotlar trigger hisoblanadi.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <BonusRuleProductDualPanels
              tenantSlug={tenantSlug}
              triggerProductIds={triggerProductIds}
              bonusProductIds={bonusProductIds}
              onTriggerChange={setTriggerProductIds}
              onBonusChange={setBonusProductIds}
              onlyByAssortment={onlyByAssortment}
              showTriggerColumn={showTriggerColumn}
              showBonusColumn={showBonusColumn}
              disabled={mutation.isPending}
            />
          </CardContent>
        </Card>
      ) : null}

      {localError ? <p className="text-sm text-destructive">{localError}</p> : null}

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/settings/bonus-rules/active")}
          disabled={mutation.isPending}
        >
          Bekor
        </Button>
        <Button type="button" onClick={submit} disabled={mutation.isPending || !name.trim()}>
          {mutation.isPending ? "Saqlanmoqda…" : "Saqlash"}
        </Button>
      </div>
    </div>
  );
}
