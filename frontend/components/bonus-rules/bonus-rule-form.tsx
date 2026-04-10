"use client";

import type { BonusRuleRow } from "@/components/bonus-rules/bonus-rule-types";
import { BonusRuleCategoryHoverField } from "@/components/bonus-rules/bonus-rule-category-hover-field";
import { BonusRulePrerequisitesField } from "@/components/bonus-rules/bonus-rule-prerequisites-field";
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
import { useEffect, useMemo, useRef, useState } from "react";

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

type ErrorTarget = "basics" | "restrictions" | "products" | "conditions" | "discount" | null;

function scrollToRef(el: HTMLElement | null) {
  if (!el) return;
  requestAnimationFrame(() => {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

const inputCls =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm shadow-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring";
/** `<select>` ga `flex` bermang — OS dropdown noto‘g‘ri chiziladi (Windows Chrome/Edge). */
const selectCls =
  "box-border h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-0 text-sm shadow-sm outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ring";

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

/** Ikkala cheklov ham o‘chiq bo‘lsa — Saqlashda chiqadigan xabar (matn bir xil bo‘lishi kerak). */
const BONUS_SCOPE_REQUIRED_MSG = "Shartlardan birini tanlash majburiy.";
const NAME_REQUIRED_MSG = "Qoida nomini kiriting.";

export type BonusRuleFormVariant = "default" | "discountOnly";

type Props = {
  tenantSlug: string;
  initialRule: BonusRuleRow | null;
  /** Chegirma bo‘limi: tur doim discount, saqlashdan keyin chegirmalar ro‘yxatiga qaytish */
  variant?: BonusRuleFormVariant;
};

export function BonusRuleForm({ tenantSlug, initialRule, variant = "default" }: Props) {
  const discountOnly = variant === "discountOnly";
  const listHref = discountOnly ? "/settings/discount-rules/active" : "/settings/bonus-rules/active";
  const router = useRouter();
  const qc = useQueryClient();
  const isEdit = Boolean(initialRule);
  const seedKey = initialRule?.id ?? "new";

  const profileRefsQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "bonus-form-refs"],
    staleTime: STALE.profile,
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{
        references?: {
          /** Yangi spravochnik */
          payment_method_entries?: { id?: string; name: string; active?: boolean }[];
          /** Legacy: faqat nomlar (backend `resolvePaymentMethodEntries` bilan bir xil manba) */
          payment_types?: string[];
          client_category_entries?: ClientRefEntry[];
        };
      }>(`/api/${tenantSlug}/settings/profile`);
      return data?.references ?? {};
    }
  });

  /** Faol yozuvlar; bo‘sh bo‘lsa `payment_types` dan (barchasi nofaol bo‘lib qolgan ham). */
  const paymentOptions = useMemo(() => {
    const refs = profileRefsQ.data;
    if (!refs) return [] as { key: string; name: string }[];
    const activeEntries = (refs.payment_method_entries ?? []).filter((p) => p.active !== false);
    if (activeEntries.length > 0) {
      return activeEntries.map((p, i) => ({
        key: p.id?.trim() || `pm-${i}-${p.name}`,
        name: p.name.trim()
      }));
    }
    const legacy = refs.payment_types ?? [];
    return legacy
      .map((n) => String(n).trim())
      .filter(Boolean)
      .map((name, i) => ({ key: `pt-${i}-${name}`, name }));
  }, [profileRefsQ.data]);
  const clientCategoryOptions = (profileRefsQ.data?.client_category_entries ?? []).filter((c) => c.active !== false);

  const priceTypesQ = useQuery({
    queryKey: ["price-types", tenantSlug, "bonus-form"],
    staleTime: STALE.reference,
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data } = await api.get<{ data: string[] }>(`/api/${tenantSlug}/price-types`);
      return data.data;
    }
  });

  const [name, setName] = useState("");
  const [type, setType] = useState<BonusType>(discountOnly ? "discount" : "qty");
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
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);
  const [targetAllClients, setTargetAllClients] = useState(true);
  const [selectedClientIdsStr, setSelectedClientIdsStr] = useState("");
  const [isManual, setIsManual] = useState(false);
  const [inBlocks, setInBlocks] = useState(false);
  const [oncePerClient, setOncePerClient] = useState(false);
  const [prerequisiteRuleIds, setPrerequisiteRuleIds] = useState<number[]>([]);
  const [onlyByAssortment, setOnlyByAssortment] = useState(false);
  const [onlyByCategory, setOnlyByCategory] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  /** Qaysi blokka scroll, ramka va ichki bildirishnoma bog‘langan */
  const [errorTarget, setErrorTarget] = useState<ErrorTarget>(null);
  const [errorShake, setErrorShake] = useState(false);
  const basicsRef = useRef<HTMLDivElement>(null);
  const restrictionsRef = useRef<HTMLDivElement>(null);
  const conditionsRef = useRef<HTMLDivElement>(null);
  const discountRef = useRef<HTMLDivElement>(null);
  const productsRef = useRef<HTMLDivElement>(null);

  const pulseErrorOn = (target: ErrorTarget) => {
    setErrorShake(true);
    window.setTimeout(() => setErrorShake(false), 500);
    if (target === "restrictions") scrollToRef(restrictionsRef.current);
    else if (target === "products") scrollToRef(productsRef.current);
    else if (target === "conditions") scrollToRef(conditionsRef.current);
    else if (target === "discount") scrollToRef(discountRef.current);
    else if (target === "basics") scrollToRef(basicsRef.current);
  };

  useEffect(() => {
    setLocalError(null);
    setErrorTarget(null);
    const rule = initialRule;
    if (rule) {
      setName(rule.name);
      setType(
        discountOnly
          ? rule.type === "sum" || rule.type === "discount"
            ? (rule.type as BonusType)
            : "discount"
          : ((rule.type as BonusType) || "qty")
      );
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
      setBonusProductIds([...(rule.bonus_product_ids ?? [])]);
      setTargetAllClients(rule.target_all_clients ?? true);
      setSelectedClientIdsStr(formatIdList(rule.selected_client_ids ?? []));
      setIsManual(rule.is_manual ?? false);
      setInBlocks(rule.in_blocks ?? false);
      setOncePerClient(rule.once_per_client ?? false);
      setPrerequisiteRuleIds([...(rule.prerequisite_rule_ids ?? [])]);
      const pids = [...(rule.product_ids ?? [])];
      const cids = [...(rule.product_category_ids ?? [])];
      if (cids.length > 0 && pids.length > 0) {
        setOnlyByCategory(true);
        setOnlyByAssortment(false);
        setTriggerProductIds(pids);
        setSelectedCategoryIds(cids);
      } else if (pids.length > 0) {
        setOnlyByAssortment(true);
        setOnlyByCategory(false);
        setTriggerProductIds(pids);
        setSelectedCategoryIds([]);
      } else if (cids.length > 0) {
        setOnlyByAssortment(false);
        setOnlyByCategory(true);
        setTriggerProductIds([]);
        setSelectedCategoryIds(cids);
      } else {
        setOnlyByAssortment(false);
        setOnlyByCategory(false);
        setTriggerProductIds([]);
        setSelectedCategoryIds([]);
      }
    } else {
      setName("");
      setType(discountOnly ? "discount" : "qty");
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
      setSelectedCategoryIds([]);
      setTargetAllClients(true);
      setSelectedClientIdsStr("");
      setIsManual(false);
      setInBlocks(false);
      setOncePerClient(false);
      setPrerequisiteRuleIds([]);
      setOnlyByAssortment(false);
      setOnlyByCategory(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat id o‘zgarganda seed
  }, [seedKey]);

  useEffect(() => {
    if (onlyByAssortment || onlyByCategory) {
      setErrorTarget((t) => (t === "restrictions" ? null : t));
      setLocalError((prev) => (prev === BONUS_SCOPE_REQUIRED_MSG ? null : prev));
    }
  }, [onlyByAssortment, onlyByCategory]);

  useEffect(() => {
    if (errorTarget !== "basics" || localError !== NAME_REQUIRED_MSG) return;
    if (name.trim()) {
      setLocalError(null);
      setErrorTarget(null);
    }
  }, [name, errorTarget, localError]);

  useEffect(() => {
    if (errorTarget !== "products") return;
    if (triggerProductIds.length > 0) {
      setLocalError(null);
      setErrorTarget(null);
    }
  }, [triggerProductIds.length, errorTarget]);

  const errorTargetRef = useRef<ErrorTarget>(null);
  errorTargetRef.current = errorTarget;

  useEffect(() => {
    if (errorTargetRef.current !== "conditions") return;
    setLocalError(null);
    setErrorTarget(null);
  }, [conditions, minSum, type]);

  useEffect(() => {
    if (errorTargetRef.current !== "discount") return;
    setLocalError(null);
    setErrorTarget(null);
  }, [discountPct]);

  const mutation = useMutation({
    mutationFn: async () => {
      const p = Number.parseInt(priority, 10);
      const product_ids = onlyByAssortment || onlyByCategory ? triggerProductIds : [];
      const product_category_ids = onlyByCategory ? selectedCategoryIds : [];
      const assortmentOnlyNoBonusPicker = onlyByAssortment && !onlyByCategory;
      const bonus_product_ids =
        assortmentOnlyNoBonusPicker && (type === "qty" || type === "sum") ? [] : bonusProductIds;
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
        bonus_product_ids,
        product_category_ids,
        target_all_clients: targetAllClients,
        selected_client_ids: targetAllClients ? [] : parseIdList(selectedClientIdsStr),
        is_manual: isManual,
        in_blocks: inBlocks,
        once_per_client: oncePerClient,
        one_plus_one_gift: isEdit && initialRule ? initialRule.one_plus_one_gift : false,
        prerequisite_rule_ids: prerequisiteRuleIds
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
      router.push(listHref);
    },
    onError: (e: unknown) => {
      const ax = e as { response?: { data?: { error?: string }; status?: number } };
      if (ax.response?.status === 403) {
        setLocalError("Ruxsat yo‘q (faqat admin yoki operator).");
        setErrorTarget(null);
        return;
      }
      if (ax.response?.data?.error === "ValidationError") {
        setLocalError("Server tekshiruvi: maydonlarni qayta ko‘rib chiqing (nom, muddat, mahsulotlar, shartlar).");
        setErrorTarget("basics");
        pulseErrorOn("basics");
        return;
      }
      if (ax.response?.data?.error === "ProductScopeRequired") {
        setLocalError(BONUS_SCOPE_REQUIRED_MSG);
        setErrorTarget("restrictions");
        pulseErrorOn("restrictions");
        return;
      }
      setLocalError(e instanceof Error ? e.message : "Saqlashda xato");
      setErrorTarget(null);
    }
  });

  const submit = () => {
    setLocalError(null);
    setErrorTarget(null);

    if (!name.trim()) {
      setLocalError(NAME_REQUIRED_MSG);
      setErrorTarget("basics");
      pulseErrorOn("basics");
      return;
    }
    if (!onlyByAssortment && !onlyByCategory) {
      setLocalError(BONUS_SCOPE_REQUIRED_MSG);
      setErrorTarget("restrictions");
      pulseErrorOn("restrictions");
      return;
    }
    if (onlyByAssortment) {
      if ((type === "qty" || type === "sum") && triggerProductIds.length === 0) {
        setLocalError("«Faqat assortiment» yoqilgan: chapdan kamida bitta trigger mahsulotni belgilang.");
        setErrorTarget("products");
        pulseErrorOn("products");
        return;
      }
      if (type === "discount" && triggerProductIds.length === 0) {
        setLocalError(
          "Assortiment cheklovi uchun kamida bitta mahsulotni chapdan tanlang yoki «Faqat assortiment»ni o‘chiring."
        );
        setErrorTarget("products");
        pulseErrorOn("products");
        return;
      }
    }
    if (
      onlyByCategory &&
      (type === "qty" || type === "sum" || type === "discount") &&
      triggerProductIds.length === 0
    ) {
      setLocalError(
        "«Kategoriya» rejimida chapdan kamida bitta trigger mahsulotni belgilang (kategoriya + tanlangan SKU lar bo‘yicha shart)."
      );
      setErrorTarget("products");
      pulseErrorOn("products");
      return;
    }
    if (type === "sum") {
      const m = Number.parseFloat(minSum);
      if (minSum.trim() === "" || Number.isNaN(m) || m < 0) {
        setLocalError("Minimal summani kiriting: 0 yoki undan katta haqiqiy son.");
        setErrorTarget("conditions");
        pulseErrorOn("conditions");
        return;
      }
    }
    if (type === "discount") {
      const d = Number.parseFloat(discountPct);
      if (discountPct.trim() === "" || Number.isNaN(d) || d < 0 || d > 100) {
        setLocalError("Chegirma foizini 0 dan 100 gacha kiriting.");
        setErrorTarget("discount");
        pulseErrorOn("discount");
        return;
      }
    }
    if (type === "qty") {
      for (let i = 0; i < conditions.length; i++) {
        try {
          parseCondRow(conditions[i]);
        } catch (err) {
          const base = err instanceof Error ? err.message : "Shartlarni tekshiring";
          setLocalError(conditions.length > 1 ? `${base} (shart #${i + 1})` : base);
          setErrorTarget("conditions");
          pulseErrorOn("conditions");
          return;
        }
      }
    }
    mutation.mutate();
  };

  const showBonusColumn =
    (type === "qty" || type === "sum") && !(onlyByAssortment && !onlyByCategory);
  const showTriggerColumn =
    type === "qty" || type === "sum" || (type === "discount" && (onlyByAssortment || onlyByCategory));

  const sectionAlert = (target: ErrorTarget) =>
    errorTarget === target && localError ? (
      <div
        role="alert"
        aria-live="assertive"
        className="mb-4 rounded-lg border border-destructive/45 bg-destructive/10 px-3 py-2.5 text-sm font-medium text-destructive"
      >
        {localError}
      </div>
    ) : null;

  return (
    <div className="w-full space-y-6">
      {localError && errorTarget === null ? (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-xl border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {localError}
        </div>
      ) : null}
      <div
        ref={basicsRef}
        className={cn(
          "rounded-xl",
          errorTarget === "basics" &&
            "ring-2 ring-destructive ring-offset-2 ring-offset-background",
          errorTarget === "basics" && errorShake && "animate-bonus-rule-shake"
        )}
      >
      <Card className="shadow-panel">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle>Asosiy sozlamalar</CardTitle>
          <CardDescription>
            {discountOnly
              ? "Nom, muddat va profil filtrlari. Tur: foizli chegirma yoki minimal summa (sovg‘a) — shartlar mos blokda. Pastda — to‘lov, kim uchun, usul va belgilar."
              : "Yuqorida — nom, bonus turi (faqat dona/miqdor), muddat va profil filtrlari; pastda — to‘lov, kim uchun, usul va belgilar (ketma-ketlik uchun ustunlik oxirida)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 pt-6">
          {sectionAlert("basics")}
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
                  aria-invalid={errorTarget === "basics" && !name.trim()}
                />
              </div>
              {discountOnly ? (
                <div className="grid min-w-0 gap-1.5">
                  <Label htmlFor="br-skidka-type">Skidka turi</Label>
                  <select
                    id="br-skidka-type"
                    className={selectCls}
                    title="Foizli chegirma yoki minimal summa bo‘yicha sovg‘a"
                    value={type === "sum" || type === "discount" ? type : "discount"}
                    onChange={(e) => setType(e.target.value as BonusType)}
                    disabled={mutation.isPending}
                  >
                    <option value="discount">Foizli chegirma (%)</option>
                    <option value="sum">Minimal buyurtma summasi (sovg‘a)</option>
                  </select>
                </div>
              ) : (
                <div className="grid min-w-0 gap-1.5 rounded-lg border border-border/70 bg-muted/15 p-3 text-sm">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tur</span>
                  <p className="text-foreground/90">
                    Faqat <strong>miqdor (dona)</strong> bo‘yicha bonus. Minimal summa va foizli chegirma —{" "}
                    <strong>Skidkalar</strong> bo‘limida.
                  </p>
                </div>
              )}
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

          {/* 2-qator: barcha guruhlar bir xil karta ko‘rinishida (5 ustun) */}
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            <div className="flex min-h-full min-w-0 flex-col rounded-lg border border-border/80 bg-muted/15 p-4">
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  To‘lov usuli
                </p>
                <select
                  id="br-payment"
                  className={selectCls}
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value)}
                  disabled={mutation.isPending || profileRefsQ.isLoading}
                  aria-label="To‘lov usuli"
                >
                  <option value="">Barchasi</option>
                  {paymentOptions.map((p) => (
                    <option key={p.key} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
                {profileRefsQ.isSuccess && paymentOptions.length === 0 ? (
                  <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
                    Faol to‘lov turi topilmadi.{" "}
                    <a className="underline underline-offset-2 hover:text-foreground" href="/settings/payment-methods">
                      To‘lov turlari
                    </a>
                    da qo‘shing.
                  </p>
                ) : null}
            </div>
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

            <div
              ref={restrictionsRef}
              id="bonus-rule-restrictions"
              className={cn(
                "flex flex-col rounded-lg border bg-muted/15 p-4 transition-[border-color,box-shadow] duration-200",
                errorTarget === "restrictions"
                  ? "border-2 border-destructive shadow-[0_0_0_1px_hsl(var(--destructive)/0.35)]"
                  : "border-border/80",
                errorTarget === "restrictions" && errorShake && "animate-bonus-rule-shake"
              )}
            >
                {sectionAlert("restrictions")}
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
                        if (v) {
                          setOnlyByCategory(false);
                          setSelectedCategoryIds([]);
                          setBonusProductIds([]);
                        }
                        if (!v) setTriggerProductIds([]);
                      }}
                      disabled={mutation.isPending}
                    />
                    Faqat assortiment
                  </label>
                  <BonusRuleCategoryHoverField
                    checked={onlyByCategory}
                    onCheckedChange={(v) => {
                      setOnlyByCategory(v);
                      if (v) {
                        setOnlyByAssortment(false);
                      }
                      if (!v) setSelectedCategoryIds([]);
                    }}
                    disabled={mutation.isPending}
                  />
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

          {!isManual ? (
            <div className="mt-4 rounded-lg border border-border/80 bg-muted/15 p-4">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Oldindan shartlar (bog‘langan qoidalar)
              </p>
              <p className="mb-3 text-[11px] leading-relaxed text-muted-foreground">
                Tanlangan qoidalar shu zakazda o‘z turi bo‘yicha avtomatik tekshiruvdan o‘tmasa, ushbu qoida qo‘llanmaydi.
                Boshqa zakazlarda ular mustaqil ishlashda davom etadi.
              </p>
              <BonusRulePrerequisitesField
                tenantSlug={tenantSlug}
                excludeRuleId={initialRule?.id ?? null}
                value={prerequisiteRuleIds}
                onChange={setPrerequisiteRuleIds}
                disabled={mutation.isPending}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
      </div>

      {type === "qty" || type === "sum" ? (
      <div
        ref={conditionsRef}
        className={cn(
          "rounded-xl",
          errorTarget === "conditions" &&
            "ring-2 ring-destructive ring-offset-2 ring-offset-background",
          errorTarget === "conditions" && errorShake && "animate-bonus-rule-shake"
        )}
      >
      <Card className="shadow-panel">
        <CardHeader className="border-b border-border/60 pb-4">
          <CardTitle>Shartlar</CardTitle>
          <CardDescription>
            {type === "qty"
              ? "Har bir qator — alohida «pog‘ona»: min/max oralig‘i, qadam (masalan 6), bonus (masalan 1). Zakazda sotilgan miqdor qaysi qator oralig‘iga tushsa, faqat o‘sha qator qo‘llanadi (bir vaqtda bitta). «Yana shart qo‘shish» — yangi pog‘ona qo‘shadi (masalan 6–11 dona uchun boshqa qadam)."
              : "Buyurtma summasi ushbu qiymatdan oshganda."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          {sectionAlert("conditions")}
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
        </CardContent>
      </Card>
      </div>
      ) : null}

      {type === "discount" ? (
        <div
          ref={discountRef}
          className={cn(
            "rounded-xl",
            errorTarget === "discount" &&
              "ring-2 ring-destructive ring-offset-2 ring-offset-background",
            errorTarget === "discount" && errorShake && "animate-bonus-rule-shake"
          )}
        >
          <Card className="shadow-panel">
            <CardHeader className="border-b border-border/60 pb-4">
              <CardTitle>Chegirma (skidka)</CardTitle>
              <CardDescription>
                Foizli chegirma tanlangan mahsulotlar (assortiment yoki kategoriya + trigger SKU) bo‘yicha buyurtma
                qatorlariga avtomatik qo‘llanadi; ombor qoldig‘iga ta’sir qilmaydi. Pastdagi «Mahsulotlar» blokida
                qaysi pozitsiyalar uchun ishlayishini belgilang.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {sectionAlert("discount")}
              <div className="grid max-w-md gap-1.5">
                <Label htmlFor="br-discount-pct">Chegirma foizi (%)</Label>
                <Input
                  id="br-discount-pct"
                  className={inputCls}
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={discountPct}
                  onChange={(e) => setDiscountPct(e.target.value)}
                  disabled={mutation.isPending}
                  aria-invalid={errorTarget === "discount"}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {showTriggerColumn || showBonusColumn ? (
        <div
          ref={productsRef}
          className={cn(
            "rounded-xl",
            errorTarget === "products" &&
              "ring-2 ring-destructive ring-offset-2 ring-offset-background",
            errorTarget === "products" && errorShake && "animate-bonus-rule-shake"
          )}
        >
        <Card className="shadow-panel">
          <CardHeader className="border-b border-border/60 pb-4">
            <CardTitle>Mahsulotlar</CardTitle>
            <CardDescription className="space-y-2 text-pretty">
              <span className="block">
                Bu yerda <strong>o‘tmishdagi savdalar ro‘yxati</strong> emas: trigger va bonus — katalogdagi mahsulotlar
                bo‘lib, ular <strong>buyurtma tuzilganda</strong> qator sifatida qo‘shilganda qoida ishlaydi.
              </span>
              <span className="block">
                <strong>Faqat assortiment:</strong> chapda trigger SKU lar; bonus o‘ngda ko‘rinmaydi — sovg‘a
                shart bajarilgan qatordagi mahsulotdan (yoki minimal summa bonusida zakazdagi eng ko‘p miqdorli qatordan).
                <strong> Kategoriya:</strong> chapda trigger SKU lar; o‘ngda bonus mahsulotlari.{" "}
                <strong>Bonuslar (dona):</strong> va <strong>Skidkalar (foiz yoki min. summa)</strong> uchun ham saqlashdan
                oldin «Faqat assortiment» yoki «Kategoriya»dan bittasini belgilash majburiy.
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0 pt-6">
            {sectionAlert("products")}
            <BonusRuleProductDualPanels
              tenantSlug={tenantSlug}
              triggerProductIds={triggerProductIds}
              bonusProductIds={bonusProductIds}
              onTriggerChange={setTriggerProductIds}
              onBonusChange={setBonusProductIds}
              onlyByAssortment={onlyByAssortment}
              onlyByCategory={onlyByCategory}
              showTriggerColumn={showTriggerColumn}
              showBonusColumn={showBonusColumn}
              disabled={mutation.isPending}
            />
          </CardContent>
        </Card>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push(listHref)}
          disabled={mutation.isPending}
        >
          Bekor
        </Button>
        <Button type="button" onClick={submit} disabled={mutation.isPending}>
          {mutation.isPending ? "Saqlanmoqda…" : "Saqlash"}
        </Button>
      </div>
    </div>
  );
}
