import { describe, expect, it } from "vitest";
import {
  buildDuplicateCompositeKey,
  duplicateKeyFromExistingRow,
  normalizeDuplicateKeyFields,
  normalizeUpdateApplyFields
} from "../src/modules/clients/client-import-masks";

describe("client-import-masks", () => {
  it("normalizeDuplicateKeyFields defaults when empty", () => {
    expect(normalizeDuplicateKeyFields([])).toEqual(["client_code", "city"]);
    expect(normalizeDuplicateKeyFields(undefined)).toEqual(["client_code", "city"]);
  });

  it("normalizeDuplicateKeyFields filters unknown keys", () => {
    expect(normalizeDuplicateKeyFields(["client_code", "bogus", "phone"])).toEqual(["client_code", "phone"]);
  });

  it("normalizeUpdateApplyFields null means apply all", () => {
    expect(normalizeUpdateApplyFields(undefined)).toBeNull();
    expect(normalizeUpdateApplyFields([])).toBeNull();
  });

  it("buildDuplicateCompositeKey joins selected parts", () => {
    const k = buildDuplicateCompositeKey(["client_code", "city"], {
      client_code: "ABC",
      client_pinfl: null,
      inn: null,
      nameLower: "test",
      phoneDigits: null,
      cityNorm: "toshkent"
    });
    expect(k).toContain("cc:ABC");
    expect(k).toContain("city:toshkent");
  });

  it("duplicateKeyFromExistingRow matches storage shape", () => {
    const k = duplicateKeyFromExistingRow(
      {
        name: "X",
        phone_normalized: "998901234567",
        client_code: "C1",
        client_pinfl: null,
        inn: null,
        city: "Y"
      },
      ["client_code", "city"]
    );
    expect(k).toBeTruthy();
    expect(k).toContain("cc:C1");
  });
});
