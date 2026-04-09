import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOADER_PREFS,
  clampLoaderSize,
  deriveHuePalette,
  loaderEmbeddedPaddingClass,
  loaderMinHeightClass,
  normalizeHex,
  parseLoaderPrefs,
  traceStrokeColors
} from "./loader-prefs";

describe("clampLoaderSize", () => {
  it("clamps to 40–128", () => {
    expect(clampLoaderSize(10)).toBe(40);
    expect(clampLoaderSize(200)).toBe(128);
    expect(clampLoaderSize(64.4)).toBe(64);
  });

  it("returns default for non-finite", () => {
    expect(clampLoaderSize(Number.NaN)).toBe(DEFAULT_LOADER_PREFS.size);
  });
});

describe("normalizeHex", () => {
  it("accepts #RRGGBB", () => {
    expect(normalizeHex("#14B8A6")).toBe("#14b8a6");
    expect(normalizeHex("ff3300")).toBe("#ff3300");
  });

  it("rejects invalid", () => {
    expect(normalizeHex("#fff")).toBeNull();
    expect(normalizeHex("")).toBeNull();
  });
});

describe("parseLoaderPrefs", () => {
  it("returns defaults for null", () => {
    expect(parseLoaderPrefs(null)).toEqual(DEFAULT_LOADER_PREFS);
  });

  it("merges partial JSON", () => {
    const raw = JSON.stringify({
      size: 99,
      variant: "cube-3d",
      colorMode: "custom",
      customColor: "#abcdef"
    });
    const p = parseLoaderPrefs(raw);
    expect(p.size).toBe(99);
    expect(p.variant).toBe("cube-3d");
    expect(p.colorMode).toBe("custom");
    expect(p.customColor).toBe("#abcdef");
    expect(p.message).toBe(DEFAULT_LOADER_PREFS.message);
  });

  it("falls back on bad variant", () => {
    const p = parseLoaderPrefs(JSON.stringify({ variant: "nope" }));
    expect(p.variant).toBe(DEFAULT_LOADER_PREFS.variant);
  });

  it("trims message and caps length", () => {
    const long = "x".repeat(200);
    const p = parseLoaderPrefs(JSON.stringify({ message: `  ${long}  ` }));
    expect(p.message.length).toBe(120);
  });
});

describe("traceStrokeColors", () => {
  it("uses rainbow in theme mode", () => {
    const c = traceStrokeColors("theme", "#000000");
    expect(c).toHaveLength(5);
    expect(c[0]).toMatch(/^#/);
  });

  it("derives from custom hex", () => {
    const c = traceStrokeColors("custom", "#14b8a6");
    expect(c).toHaveLength(5);
    expect(new Set(c).size).toBeGreaterThan(1);
  });
});

describe("deriveHuePalette", () => {
  it("returns n colors", () => {
    expect(deriveHuePalette("#14b8a6", 3)).toHaveLength(3);
  });
});

describe("loaderMinHeightClass", () => {
  it("returns tailwind classes", () => {
    expect(loaderMinHeightClass("fullscreen")).toContain("dvh");
    expect(loaderMinHeightClass("compact")).toBeTruthy();
  });
});

describe("loaderEmbeddedPaddingClass", () => {
  it("returns padding utilities", () => {
    expect(loaderEmbeddedPaddingClass("compact")).toContain("py-");
  });
});
