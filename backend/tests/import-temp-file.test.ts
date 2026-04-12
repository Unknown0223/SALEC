import * as os from "os";
import * as path from "path";
import { describe, expect, it } from "vitest";
import { isSafeImportTempPath } from "../src/jobs/import-temp-file";

describe("isSafeImportTempPath", () => {
  it("allows files under os tmp salesdoc-imports", () => {
    const ok = path.join(os.tmpdir(), "salesdoc-imports", "cli-test.xlsx");
    expect(isSafeImportTempPath(ok)).toBe(true);
  });

  it("rejects path traversal outside imports dir", () => {
    const bad = path.join(os.tmpdir(), "other", "secret.xlsx");
    expect(isSafeImportTempPath(bad)).toBe(false);
  });

  it("rejects bare tmpdir", () => {
    expect(isSafeImportTempPath(path.join(os.tmpdir(), "salesdoc-imports"))).toBe(false);
  });
});
