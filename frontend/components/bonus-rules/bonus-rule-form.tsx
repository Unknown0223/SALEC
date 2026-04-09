"use client";

import type { BonusRuleRow } from "@/components/bonus-rules/bonus-rule-types";
import { BonusRuleProductScopePicker } from "@/components/bonus-rules/bonus-rule-product-scope-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { STALE } from "@/lib/query-stale";
import { cn } from "@/lib/utils";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type BonusType = "qty" | "sum" | "discount";

type CondForm = {
  min_qty: string;
  max_qty: string;
  step_qty: string;
  bonus_qty: string;
  max_bonus_qty: string;
};

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

function liveSummary(
  type: BonusType,
  conditions: CondForm[],
  minSum: string,
  discountPct: string
): string {
  if (type === "sum") {
    const n = Number.parseFloat(minSum);
    return Number.isFinite(n) ? `Buyurtma summasi ≥ ${n}` : "Minimal summani kiriting";
  }
  if (type === "discount") {
    const n = Number.parseFloat(discountPct);
    return Number.isFinite(n) ? `Chegirma: ${n}%` : "Foizni kiriting";
  }
  try {
    const rows = conditions.map(parseCondRow);
    return rows
      .map((r, i) => {
        const range =
          r.min_qty != null || r.max_qty != null
            ? `[${r.min_qty ?? "—"}…${r.max_qty ?? "—"}] `
            : "";
        return `${i + 1}) ${range}har ${r.step_qty} ta → +${r.bonus_qty} bonus${r.max_bonus_qty != null ? ` (≤${r.max_bonus_qty})` : ""}`;
      })
      .join(" · ");
  } catch {
    return "Shart qatorlarini to‘liq va to‘g‘ri to‘ldiring";
  }
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

  const paymentMethodsQ = useQuery({
    queryKey: ["settings", "profile", tenantSlug, "bonus-payment-methods"],
    staleTime: STALE.profile,
    queryFn: async () => {
      const { data } = await api.get<{
        references: { payment_method_entries?: { name: string; active?: boolean }[] };
      }>(`/api/${tenantSlug}/settings/profile`);
      return (data.references.payment_method_entries ?? []).filter((p) => p.active !== false).map((p) => p.name);
    }
  });

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
  const [productIdsStr, setProductIdsStr] = useState("");
  const [bonusProductIdsStr, setBonusProductIdsStr] = useState("");
  const [categoryIdsStr, setCategoryIdsStr] = useState("");
  const [targetAllClients, setTargetAllClients] = useState(true);
  const [selectedClientIdsStr, setSelectedClientIdsStr] = useState("");
  const [isManual, setIsManual] = useState(false);
  const [inBlocks, setInBlocks] = useState(true);
  const [oncePerClient, setOncePerClient] = useState(false);
  const [onePlusOne, setOnePlusOne] = useState(false);
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
      setProductIdsStr(formatIdList(rule.product_ids ?? []));
      setBonusProductIdsStr(formatIdList(rule.bonus_product_ids ?? []));
      setCategoryIdsStr(formatIdList(rule.product_category_ids ?? []));
      setTargetAllClients(rule.target_all_clients ?? true);
      setSelectedClientIdsStr(formatIdList(rule.selected_client_ids ?? []));
      setIsManual(rule.is_manual ?? false);
      setInBlocks(rule.in_blocks ?? true);
      setOncePerClient(rule.once_per_client ?? false);
      setOnePlusOne(rule.one_plus_one_gift ?? false);
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
      setProductIdsStr("");
      setBonusProductIdsStr("");
      setCategoryIdsStr("");
      setTargetAllClients(true);
      setSelectedClientIdsStr("");
      setIsManual(false);
      setInBlocks(true);
      setOncePerClient(false);
      setOnePlusOne(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat id o‘zgarganda seed qilamiz (referens yangilanishi formani bekor qilmasin)
  }, [seedKey]);

  const summaryLine = useMemo(
    () => liveSummary(type, conditions, minSum, discountPct),
    [type, conditions, minSum, discountPct]
  );

  const mutation = useMutation({
    mutationFn: async () => {
      const p = Number.parseInt(priority, 10);
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
        product_ids: parseIdList(productIdsStr),
        bonus_product_ids: parseIdList(bonusProductIdsStr),
        product_category_ids: parseIdList(categoryIdsStr),
        target_all_clients: targetAllClients,
        selected_client_ids: targetAllClients ? [] : parseIdList(selectedClientIdsStr),
        is_manual: isManual,
        in_blocks: inBlocks,
        once_per_client: oncePerClient,
        one_plus_one_gift: onePlusOne
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

  const typeLabel =
    type === "qty" ? "Miqdor (6+1, qatorlar)" : type === "sum" ? "Minimal summa" : "Chegirma %";

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      <div className="space-y-6 lg:col-span-8">
        <Card className="shadow-panel">
          <CardHeader>
            <CardTitle>Asosiy</CardTitle>
            <CardDescription>Nomi, tur va ustunlik — qoida ro‘yxatida tartiblash uchun.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="br-name">Nomi</Label>
              <Input id="br-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} disabled={mutation.isPending} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="br-type">Tur</Label>
              <select
                id="br-type"
                className={selectCls}
                value={type}
                onChange={(e) => setType(e.target.value as BonusType)}
                disabled={mutation.isPending}
              >
                <option value="qty">Miqdor (6+1, qatorlar)</option>
                <option value="sum">Minimal summa</option>
                <option value="discount">Chegirma %</option>
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="br-priority">Ustunlik</Label>
              <Input
                id="br-priority"
                className={inputCls}
                type="number"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                disabled={mutation.isPending}
              />
            </div>
            <label className="flex items-center gap-2 sm:col-span-2">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} disabled={mutation.isPending} />
              <span className="text-sm">Faol</span>
            </label>
          </CardContent>
        </Card>

        <Card className="shadow-panel">
          <CardHeader>
            <CardTitle>Shartlar</CardTitle>
            <CardDescription>
              {type === "qty"
                ? "Har bir qator alohida oraliq: min/max miqdor, qadam, bonus, ixtiyoriy maks. bonus."
                : type === "sum"
                  ? "Buyurtma umumiy summasi ushbu qiymatdan oshganda qoida ishlaydi."
                  : "Buyurtmaga qo‘llanadigan chegirma foizi."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {type === "qty" ? (
              <>
                {conditions.map((row, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-border/80 bg-muted/20 p-4"
                  >
                    <p className="mb-3 text-xs font-medium text-muted-foreground">Shart qatori #{idx + 1}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Min miqdor</Label>
                        <Input
                          className={inputCls}
                          value={row.min_qty}
                          onChange={(e) => {
                            const next = [...conditions];
                            next[idx] = { ...next[idx], min_qty: e.target.value };
                            setConditions(next);
                          }}
                          disabled={mutation.isPending}
                          placeholder="24"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Max miqdor</Label>
                        <Input
                          className={inputCls}
                          value={row.max_qty}
                          onChange={(e) => {
                            const next = [...conditions];
                            next[idx] = { ...next[idx], max_qty: e.target.value };
                            setConditions(next);
                          }}
                          disabled={mutation.isPending}
                          placeholder="100"
                        />
                      </div>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-3">
                      <div className="grid gap-1.5">
                        <Label className="text-xs">Qadam</Label>
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
                        <Label className="text-xs">Bonus</Label>
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
                        <Label className="text-xs">Maks. bonus</Label>
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
                        className="mt-3 w-full"
                        onClick={() => setConditions(conditions.filter((_, i) => i !== idx))}
                      >
                        Ushbu qatorni o‘chirish
                      </Button>
                    ) : null}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  onClick={() => setConditions([...conditions, emptyCond()])}
                  disabled={mutation.isPending}
                >
                  + Yana shart qatori
                </Button>
              </>
            ) : null}

            {type === "sum" ? (
              <div className="grid gap-1.5">
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
              <div className="grid gap-1.5">
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

        <Card className="shadow-panel">
          <CardHeader>
            <CardTitle>Amal qilish muddati</CardTitle>
            <CardDescription>Bo‘sh qoldirsangiz — vaqt cheklovsiz.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label>Kuchga kirish</Label>
              <Input
                className={inputCls}
                type="datetime-local"
                value={validFrom}
                onChange={(e) => setValidFrom(e.target.value)}
                disabled={mutation.isPending}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Tugash</Label>
              <Input
                className={inputCls}
                type="datetime-local"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                disabled={mutation.isPending}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-panel">
          <CardHeader>
            <CardTitle>Filtrlar</CardTitle>
            <CardDescription>
              Bo‘sh maydonlar cheklov qo‘ymaydi. Mahsulot qamrovini pastdagi kategoriya tanlovi yoki ID matnidan
              bering. <span className="text-foreground/90">Agar bir vaqtning o‘zida mahsulot ID va kategoriya ID
              ikkalasini ham to‘ldirsangiz, backend ikkala shartni ham talab qiladi (AND).</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Mijoz kategoriyasi</Label>
              <Input className={inputCls} value={clientCategory} onChange={(e) => setClientCategory(e.target.value)} disabled={mutation.isPending} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">To‘lov turi</Label>
              <Input
                className={inputCls}
                list="bonus-rule-payment-types"
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                disabled={mutation.isPending}
              />
              <datalist id="bonus-rule-payment-types">
                {(paymentMethodsQ.data ?? []).map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Mijoz turi</Label>
              <Input className={inputCls} value={clientType} onChange={(e) => setClientType(e.target.value)} disabled={mutation.isPending} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Sotish kanali</Label>
              <Input className={inputCls} value={salesChannel} onChange={(e) => setSalesChannel(e.target.value)} disabled={mutation.isPending} />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label className="text-xs">Narx turi</Label>
              <Input
                className={inputCls}
                list="bonus-rule-price-types"
                value={priceType}
                onChange={(e) => setPriceType(e.target.value)}
                disabled={mutation.isPending}
              />
              <datalist id="bonus-rule-price-types">
                {(priceTypesQ.data ?? []).map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label className="text-sm font-medium">Qamrov: mahsulotlar</Label>
              <BonusRuleProductScopePicker
                tenantSlug={tenantSlug}
                value={parseIdList(productIdsStr)}
                onChange={(ids) => {
                  setProductIdsStr(formatIdList(ids));
                  setCategoryIdsStr("");
                }}
                onClearCategoryScope={() => setCategoryIdsStr("")}
                disabled={mutation.isPending}
              />
              <Label className="text-xs text-muted-foreground">Qo‘lda mahsulot ID (ixtiyoriy)</Label>
              <Input
                className={inputCls}
                value={productIdsStr}
                onChange={(e) => setProductIdsStr(e.target.value)}
                disabled={mutation.isPending}
                placeholder="1, 2, 5"
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label className="text-xs">Bonus mahsulot ID</Label>
              <Input
                className={inputCls}
                value={bonusProductIdsStr}
                onChange={(e) => setBonusProductIdsStr(e.target.value)}
                disabled={mutation.isPending}
              />
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label className="text-xs">Mahsulot kategoriya ID</Label>
              <Input
                className={inputCls}
                value={categoryIdsStr}
                onChange={(e) => setCategoryIdsStr(e.target.value)}
                disabled={mutation.isPending}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-panel">
          <CardHeader>
            <CardTitle>Mijozlar va qo‘llanish</CardTitle>
            <CardDescription>Bloklar, qo‘lda qo‘llash va boshqa maxsus rejimlar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <label className="flex items-start gap-2 rounded-lg border border-transparent px-1 py-1 hover:bg-muted/40">
              <input
                type="checkbox"
                className="mt-1"
                checked={targetAllClients}
                onChange={(e) => setTargetAllClients(e.target.checked)}
                disabled={mutation.isPending}
              />
              <span>Barcha mijozlar</span>
            </label>
            {!targetAllClients ? (
              <div className="grid gap-1.5 pl-6">
                <Label className="text-xs">Tanlangan mijoz ID</Label>
                <Input
                  className={inputCls}
                  value={selectedClientIdsStr}
                  onChange={(e) => setSelectedClientIdsStr(e.target.value)}
                  disabled={mutation.isPending}
                  placeholder="10, 20"
                />
              </div>
            ) : null}
            <label className="flex items-start gap-2 rounded-lg border border-transparent px-1 py-1 hover:bg-muted/40">
              <input type="checkbox" className="mt-1" checked={isManual} onChange={(e) => setIsManual(e.target.checked)} disabled={mutation.isPending} />
              <span>Qo‘lda qo‘llash (manual)</span>
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-transparent px-1 py-1 hover:bg-muted/40">
              <input type="checkbox" className="mt-1" checked={inBlocks} onChange={(e) => setInBlocks(e.target.checked)} disabled={mutation.isPending} />
              <span>Bloklarda (har to‘liq qadam uchun bonus)</span>
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-transparent px-1 py-1 hover:bg-muted/40">
              <input
                type="checkbox"
                className="mt-1"
                checked={oncePerClient}
                onChange={(e) => setOncePerClient(e.target.checked)}
                disabled={mutation.isPending}
              />
              <span>Har mijozga faqat bir marta</span>
            </label>
            <label className="flex items-start gap-2 rounded-lg border border-transparent px-1 py-1 hover:bg-muted/40">
              <input
                type="checkbox"
                className="mt-1"
                checked={onePlusOne}
                onChange={(e) => setOnePlusOne(e.target.checked)}
                disabled={mutation.isPending}
              />
              <span>1+1 sovg‘a (avtomatik qadam 1, bonus 1)</span>
            </label>
          </CardContent>
        </Card>

        {localError ? <p className="text-sm text-destructive">{localError}</p> : null}

        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/settings/bonus-rules/active")}
            disabled={mutation.isPending}
          >
            Bekor
          </Button>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending || !name.trim()}>
            {mutation.isPending ? "Saqlanmoqda…" : isEdit ? "O‘zgarishlarni saqlash" : "Qoidani yaratish"}
          </Button>
        </div>
      </div>

      <aside className="lg:col-span-4">
        <div className="lg:sticky lg:top-4 space-y-4">
          <Card className="border-primary/20 bg-primary/5 shadow-panel">
            <CardHeader>
              <CardTitle className="text-primary">Qisqacha</CardTitle>
              <CardDescription>Maydonlarga qarab yangilanadi</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs font-medium text-muted-foreground">Tur</p>
                <p className="font-medium">{typeLabel}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Nomi</p>
                <p className="font-medium">{name.trim() || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-muted-foreground">Shart / hisob</p>
                <p className="whitespace-pre-wrap break-words text-muted-foreground">{summaryLine}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {isActive ? (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-700 dark:text-emerald-400">Faol</span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5">Nofaol</span>
                )}
                {inBlocks && type === "qty" ? (
                  <span className="rounded-full bg-muted px-2 py-0.5">Bloklar</span>
                ) : null}
                {isManual ? <span className="rounded-full bg-muted px-2 py-0.5">Manual</span> : null}
              </div>
            </CardContent>
          </Card>
        </div>
      </aside>
    </div>
  );
}
