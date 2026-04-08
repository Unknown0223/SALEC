"use client";

import { DoubleBounceSpinner } from "@/components/ui/double-bounce-spinner";
import { NewtonsCradleLoader } from "@/components/ui/newtons-cradle-loader";
import { cn } from "@/lib/utils";
import type { LoaderColorMode, LoaderVariant } from "@/lib/loader-prefs";
import { normalizeHex, traceStrokeColors } from "@/lib/loader-prefs";
import type { CSSProperties } from "react";

type Props = {
  variant: LoaderVariant;
  size: number;
  label: string;
  colorMode: LoaderColorMode;
  customColor: string;
  className?: string;
};

const TRACE_PATHS = [
  "M 22 24 L 98 24",
  "M 102 30 L 102 50",
  "M 98 56 L 22 56",
  "M 18 50 L 18 30",
  "M 34 40 L 86 40"
] as const;

const TRACE_BG_D =
  "M 20 18 h 80 a 10 10 0 0 1 10 10 v 24 a 10 10 0 0 1 -10 10 h -80 a 10 10 0 0 1 -10 -10 v -24 a 10 10 0 0 1 10 -10 z";

function accentVars(colorMode: LoaderColorMode, customColor: string): CSSProperties | undefined {
  if (colorMode !== "custom") return undefined;
  const hex = normalizeHex(customColor);
  if (!hex) return undefined;
  return { "--loader-accent": hex } as CSSProperties;
}

/**
 * Barcha marshrut loader variantlari + rang (`--loader-accent` yoki SVG palitra).
 */
export function SalecLoaderSpinner({
  variant,
  size,
  label,
  colorMode,
  customColor,
  className
}: Props) {
  const accentStyle = accentVars(colorMode, customColor);
  const wrapClass = cn("inline-flex items-center justify-center overflow-visible", className);

  switch (variant) {
    case "newtons-cradle":
      return (
        <div className={wrapClass} style={accentStyle}>
          <NewtonsCradleLoader size={size} label={label} />
        </div>
      );

    case "double-bounce":
      return (
        <div className={wrapClass} style={accentStyle}>
          <DoubleBounceSpinner size={size} label={label} />
        </div>
      );

    case "square-path": {
      const sc = Math.max(0.42, Math.min(1.4, size / 96));
      return (
        <div className={wrapClass} style={{ width: size, height: size, ...accentStyle }}>
          <div className="salec-square-path" role="status" aria-label={label}>
            <span className="sr-only">{label}</span>
            <div
              className="salec-square-path__inner"
              style={{ transform: `rotate(45deg) scale(${sc})` }}
              aria-hidden
            >
              {Array.from({ length: 7 }, (_, i) => (
                <div key={i} className="salec-square-path__cell" />
              ))}
            </div>
          </div>
        </div>
      );
    }

    case "radial-balls": {
      const unit = size / 26;
      return (
        <div className={wrapClass} style={accentStyle}>
          <div
            className="salec-radial-balls"
            style={
              {
                "--salec-rfb-unit": `${unit}px`,
                "--salec-rfb-box": `${size}px`
              } as CSSProperties
            }
            role="status"
            aria-label={label}
          >
            <span className="sr-only">{label}</span>
            <div className="salec-radial-balls__tracks" aria-hidden>
              {Array.from({ length: 9 }, (_, i) => (
                <div key={`t-${i}`} className="salec-radial-balls__track" />
              ))}
            </div>
            <div className="salec-radial-balls__arms" aria-hidden>
              {Array.from({ length: 9 }, (_, i) => (
                <div key={`a-${i}`} className="salec-radial-balls__arm">
                  <div className="salec-radial-balls__ball" />
                </div>
              ))}
            </div>
          </div>
        </div>
      );
    }

    case "cube-3d":
      return (
        <div className={wrapClass} style={accentStyle}>
          <div
            className="salec-cube-loader"
            style={{ "--salec-cube-s": `${size}px` } as CSSProperties}
            role="status"
            aria-label={label}
          >
            <span className="sr-only">{label}</span>
            <div className="salec-cube-loader__top" aria-hidden />
            <div className="salec-cube-loader__wrap" aria-hidden>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="salec-cube-loader__face"
                  style={{ "--salec-cube-i": i } as CSSProperties}
                />
              ))}
            </div>
          </div>
        </div>
      );

    case "trace-chip": {
      const colors = traceStrokeColors(colorMode, customColor);
      const w = Math.round(size * 1.4);
      const h = Math.round(size * 0.78);
      return (
        <div className={wrapClass} role="status" aria-label={label}>
          <span className="sr-only">{label}</span>
          <svg
            className="shrink-0 overflow-visible"
            width={w}
            height={h}
            viewBox="0 0 120 72"
            aria-hidden
          >
            <path d={TRACE_BG_D} className="salec-trace-chip__bg" />
            {TRACE_PATHS.map((d, i) => (
              <path
                key={i}
                d={d}
                className="salec-trace-chip__flow"
                style={{
                  stroke: colors[i % colors.length],
                  animationDelay: `${i * 0.24}s`
                }}
              />
            ))}
          </svg>
        </div>
      );
    }

    default:
      return (
        <div className={wrapClass} style={accentStyle}>
          <NewtonsCradleLoader size={size} label={label} />
        </div>
      );
  }
}
