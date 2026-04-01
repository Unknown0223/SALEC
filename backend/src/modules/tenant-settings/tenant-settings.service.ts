import type { Prisma } from "@prisma/client";
import { prisma } from "../../config/database";
import {
  bonusPolicyToJson,
  mergeBonusStackPatch,
  parseBonusStackPolicy,
  type BonusStackJson,
  type BonusStackPolicy
} from "../orders/bonus-stack-policy";

function asRecord(v: unknown): Record<string, unknown> {
  if (v != null && typeof v === "object" && !Array.isArray(v)) {
    return { ...(v as Record<string, unknown>) };
  }
  return {};
}

export async function getTenantBonusStack(tenantId: number): Promise<BonusStackJson> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const policy = parseBonusStackPolicy(row?.settings);
  return bonusPolicyToJson(policy);
}

export async function updateTenantBonusStack(
  tenantId: number,
  patch: Partial<{
    mode: unknown;
    max_units: unknown;
    forbid_apply_all_eligible: unknown;
  }>
): Promise<{ policy: BonusStackPolicy; json: BonusStackJson }> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { settings: true }
  });
  const current = parseBonusStackPolicy(row?.settings);
  const policy = mergeBonusStackPatch(current, patch);
  const nextSettings = {
    ...asRecord(row?.settings),
    bonus_stack: bonusPolicyToJson(policy)
  };

  await prisma.tenant.update({
    where: { id: tenantId },
    data: { settings: nextSettings as Prisma.InputJsonValue }
  });

  return { policy, json: bonusPolicyToJson(policy) };
}

export type TenantProfileDto = {
  name: string;
  phone: string | null;
  address: string | null;
  logo_url: string | null;
  feature_flags: Record<string, unknown>;
  references: {
    payment_types: string[];
    return_reasons: string[];
    regions: string[];
    /** Mijoz kartochkasi — spravochnikdan tanlanadigan qiymatlar */
    client_categories: string[];
    client_type_codes: string[];
    client_formats: string[];
    sales_channels: string[];
    client_product_category_refs: string[];
  };
};

function stringArrayFromUnknown(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((s) => s.trim());
}

export async function getTenantProfile(tenantId: number): Promise<TenantProfileDto> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, phone: true, address: true, logo_url: true, settings: true }
  });
  if (!row) {
    throw new Error("NOT_FOUND");
  }
  const st = asRecord(row.settings);
  const ff = asRecord(st.feature_flags);
  const ref = asRecord(st.references);
  return {
    name: row.name,
    phone: row.phone,
    address: row.address,
    logo_url: row.logo_url,
    feature_flags: ff,
    references: {
      payment_types: stringArrayFromUnknown(ref.payment_types),
      return_reasons: stringArrayFromUnknown(ref.return_reasons),
      regions: stringArrayFromUnknown(ref.regions),
      client_categories: stringArrayFromUnknown(ref.client_categories),
      client_type_codes: stringArrayFromUnknown(ref.client_type_codes),
      client_formats: stringArrayFromUnknown(ref.client_formats),
      sales_channels: stringArrayFromUnknown(ref.sales_channels),
      client_product_category_refs: stringArrayFromUnknown(ref.client_product_category_refs)
    }
  };
}

export async function patchTenantProfile(
  tenantId: number,
  patch: Partial<{
    name: string;
    phone: string | null;
    address: string | null;
    logo_url: string | null;
    feature_flags: Record<string, unknown>;
    references: {
      payment_types?: string[];
      return_reasons?: string[];
      regions?: string[];
      client_categories?: string[];
      client_type_codes?: string[];
      client_formats?: string[];
      sales_channels?: string[];
      client_product_category_refs?: string[];
    };
  }>
): Promise<TenantProfileDto> {
  const row = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true, phone: true, address: true, logo_url: true, settings: true }
  });
  if (!row) {
    throw new Error("NOT_FOUND");
  }

  const data: Prisma.TenantUpdateInput = {};
  if (patch.name !== undefined) {
    data.name = patch.name.trim();
  }
  if (patch.phone !== undefined) {
    data.phone = patch.phone?.trim() || null;
  }
  if (patch.address !== undefined) {
    data.address = patch.address?.trim() || null;
  }
  if (patch.logo_url !== undefined) {
    data.logo_url = patch.logo_url?.trim() || null;
  }

  if (patch.feature_flags != null || patch.references != null) {
    const nextSettings = { ...asRecord(row.settings) };
    if (patch.feature_flags != null) {
      nextSettings.feature_flags = {
        ...asRecord(nextSettings.feature_flags),
        ...patch.feature_flags
      };
    }
    if (patch.references != null) {
      const prevRef = asRecord(nextSettings.references);
      const merged = { ...prevRef };
      if (patch.references.payment_types != null) {
        merged.payment_types = patch.references.payment_types;
      }
      if (patch.references.return_reasons != null) {
        merged.return_reasons = patch.references.return_reasons;
      }
      if (patch.references.regions != null) {
        merged.regions = patch.references.regions;
      }
      if (patch.references.client_categories != null) {
        merged.client_categories = patch.references.client_categories;
      }
      if (patch.references.client_type_codes != null) {
        merged.client_type_codes = patch.references.client_type_codes;
      }
      if (patch.references.client_formats != null) {
        merged.client_formats = patch.references.client_formats;
      }
      if (patch.references.sales_channels != null) {
        merged.sales_channels = patch.references.sales_channels;
      }
      if (patch.references.client_product_category_refs != null) {
        merged.client_product_category_refs = patch.references.client_product_category_refs;
      }
      nextSettings.references = merged;
    }
    data.settings = nextSettings as Prisma.InputJsonValue;
  }

  if (Object.keys(data).length > 0) {
    await prisma.tenant.update({
      where: { id: tenantId },
      data
    });
  }

  return getTenantProfile(tenantId);
}
