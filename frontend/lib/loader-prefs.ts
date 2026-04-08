/**
 * Marshrut yuklanishi (loading.tsx / Suspense) spinner sozlamalari — brauzerda saqlanadi.
 */
export const LOADER_PREFS_STORAGE_KEY = "salec-loader-prefs";

/** Kartochka balandligi — markazlash effekti */
export type LoaderHeightMode = "compact" | "normal" | "tall" | "fullscreen";

export const LOADER_HEIGHT_MODE_IDS: LoaderHeightMode[] = [
  "compact",
  "normal",
  "tall",
  "fullscreen"
];

export type LoaderVariant =
  | "newtons-cradle"
  | "double-bounce"
  | "square-path"
  | "radial-balls"
  | "trace-chip"
  | "cube-3d";

export const LOADER_VARIANT_IDS: LoaderVariant[] = [
  "newtons-cradle",
  "double-bounce",
  "square-path",
  "radial-balls",
  "trace-chip",
  "cube-3d"
];

export const loaderVariantLabels: Record<LoaderVariant, string> = {
  "newtons-cradle": "Маятник (4 шарика)",
  "double-bounce": "Два круга (pulse)",
  "square-path": "Квадраты по траектории",
  "radial-balls": "Радиальные дорожки",
  "trace-chip": "Чип / схема (SVG)",
  "cube-3d": "Куб 3D"
};

export type LoaderColorMode = "theme" | "custom";

export const loaderColorModeLabels: Record<LoaderColorMode, string> = {
  theme: "Как в теме (primary)",
  custom: "Свой цвет"
};

export type LoaderPrefs = {
  /** Spinner diametri (px) */
  size: number;
  showMessage: boolean;
  message: string;
  heightMode: LoaderHeightMode;
  variant: LoaderVariant;
  colorMode: LoaderColorMode;
  /** #rrggbb — faqat colorMode === "custom" */
  customColor: string;
};

export const DEFAULT_LOADER_PREFS: LoaderPrefs = {
  size: 80,
  showMessage: true,
  message: "Загрузка…",
  heightMode: "tall",
  variant: "newtons-cradle",
  colorMode: "theme",
  customColor: "#14b8a6"
};

const SIZE_MIN = 40;
const SIZE_MAX = 128;

export function clampLoaderSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_LOADER_PREFS.size;
  return Math.min(SIZE_MAX, Math.max(SIZE_MIN, Math.round(n)));
}

/** SVG «чип»: tema rejimida klassik palitra, custom — bitta rangdan 5 soyada */
const TRACE_RAINBOW = ["#ffea00", "#00ccff", "#00ff15", "#9900ff", "#ff3300"] as const;

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.min(255, Math.max(0, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const l = (max + min) / 2;
  if (d > 1e-6) {
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
    return [h * 360, s * 100, l * 100];
  }
  return [0, 0, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(Math.min(k(n) - 3, 9 - k(n), 1), -1);
  return [255 * f(0), 255 * f(8), 255 * f(4)];
}

/** Asosiy rang atrofida n ta rang (trace uchun) */
export function deriveHuePalette(hex: string, n: number): string[] {
  const rgb = hexToRgb(hex);
  if (!rgb) return [...TRACE_RAINBOW].slice(0, n);
  const [h, s, l] = rgbToHsl(...rgb);
  const out: string[] = [];
  const step = 360 / Math.max(n, 1);
  for (let i = 0; i < n; i++) {
    const nh = (h + i * step * 0.85) % 360;
    const nl = Math.min(92, Math.max(38, l + (i % 2) * 6 - 3));
    const ns = Math.min(95, Math.max(45, s));
    out.push(rgbToHex(...hslToRgb(nh, ns, nl)));
  }
  return out;
}

export function traceStrokeColors(colorMode: LoaderColorMode, customColor: string): string[] {
  if (colorMode === "theme") return [...TRACE_RAINBOW];
  const hex = normalizeHex(customColor) ?? DEFAULT_LOADER_PREFS.customColor;
  return deriveHuePalette(hex, 5);
}

export function normalizeHex(input: string): string | null {
  const s = input.trim();
  const m = /^#?([0-9a-f]{6})$/i.exec(s);
  if (!m) return null;
  return `#${m[1].toLowerCase()}`;
}

export function parseLoaderPrefs(raw: string | null): LoaderPrefs {
  if (!raw) return { ...DEFAULT_LOADER_PREFS };
  try {
    const o = JSON.parse(raw) as Partial<LoaderPrefs>;
    const customColor = normalizeHex(
      typeof o.customColor === "string" ? o.customColor : DEFAULT_LOADER_PREFS.customColor
    );
    return {
      size: clampLoaderSize(typeof o.size === "number" ? o.size : DEFAULT_LOADER_PREFS.size),
      showMessage: typeof o.showMessage === "boolean" ? o.showMessage : DEFAULT_LOADER_PREFS.showMessage,
      message:
        typeof o.message === "string" && o.message.trim()
          ? o.message.trim().slice(0, 120)
          : DEFAULT_LOADER_PREFS.message,
      heightMode:
        o.heightMode === "compact" ||
        o.heightMode === "normal" ||
        o.heightMode === "tall" ||
        o.heightMode === "fullscreen"
          ? o.heightMode
          : DEFAULT_LOADER_PREFS.heightMode,
      variant:
        typeof o.variant === "string" && (LOADER_VARIANT_IDS as string[]).includes(o.variant)
          ? (o.variant as LoaderVariant)
          : DEFAULT_LOADER_PREFS.variant,
      colorMode: o.colorMode === "custom" || o.colorMode === "theme" ? o.colorMode : DEFAULT_LOADER_PREFS.colorMode,
      customColor: customColor ?? DEFAULT_LOADER_PREFS.customColor
    };
  } catch {
    return { ...DEFAULT_LOADER_PREFS };
  }
}

/** Ildiz `loading.tsx` yoki alohida to‘liq ekran fallback */
export function loaderMinHeightClass(mode: LoaderHeightMode): string {
  switch (mode) {
    case "compact":
      return "min-h-[52dvh]";
    case "normal":
      return "min-h-[min(72dvh,100vh)]";
    case "fullscreen":
      return "min-h-dvh";
    case "tall":
    default:
      return "min-h-[min(88dvh,100vh)]";
  }
}

/** Dashboard ichida: flex-1 bilan to‘ldiriladi; bu faqat vertikal padding */
export function loaderEmbeddedPaddingClass(mode: LoaderHeightMode): string {
  switch (mode) {
    case "compact":
      return "py-6 sm:py-8";
    case "normal":
      return "py-10 sm:py-12";
    case "fullscreen":
      return "py-14 sm:py-16";
    case "tall":
    default:
      return "py-14 sm:py-16";
  }
}

export const loaderHeightModeLabels: Record<LoaderHeightMode, string> = {
  compact: "Компакт (yuqoriroq)",
  normal: "O‘rtacha",
  tall: "Katta maydon",
  fullscreen: "Butun ekran (100dvh)"
};
