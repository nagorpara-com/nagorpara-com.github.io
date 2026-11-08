/**
 * Admin-editable theme colors (owner's order, 2026-11-01).
 *
 * The built-in brand defaults live in src/index.css (@theme).
 * An admin may override up to four of them from Website
 * Settings; the overrides are stored in site_settings
 * (migration 0037, NULL = default) and applied at runtime by
 * setting the same CSS variables on <html>, which every
 * Tailwind brand utility (bg-brand, text-gold, ring-accent, …)
 * resolves through — so the whole site recolors with no
 * rebuild. The alias variables (--color-primary,
 * --color-dark-green, --color-accent) are set alongside their
 * primaries, and the gold-dark shade is derived from gold.
 */

export interface ThemeColors {
  brand: string | null;
  brandDark: string | null;
  gold: string | null;
  brandLight: string | null;
}

export const DEFAULT_THEME: Record<keyof ThemeColors, string> = {
  brand: "#17623D",
  brandDark: "#0F4A2E",
  gold: "#F3C64E",
  brandLight: "#E8F3EC",
};

export const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

export function isHexColor(value: string): boolean {
  return HEX_RE.test(value.trim());
}

/** Darken a #RRGGBB color by a fraction (0..1) — used to derive
 *  the gold-dark shade from whatever gold the admin picks. */
export function darken(hex: string, fraction: number): string {
  const m = /^#([0-9A-Fa-f]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const scale = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - fraction))));
  const r = scale((n >> 16) & 255);
  const g = scale((n >> 8) & 255);
  const b = scale(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

const VAR_MAP: Array<{ key: keyof ThemeColors; vars: string[] }> = [
  { key: "brand", vars: ["--color-brand", "--color-primary"] },
  { key: "brandDark", vars: ["--color-brand-dark", "--color-dark-green"] },
  { key: "gold", vars: ["--color-gold", "--color-accent"] },
  { key: "brandLight", vars: ["--color-brand-light"] },
];

const ALL_VARS = [...VAR_MAP.flatMap((v) => v.vars), "--color-gold-dark"];

/** Apply the stored overrides (null entries keep the CSS
 *  defaults). Safe to call repeatedly. */
export function applyTheme(colors: ThemeColors): void {
  const root = document.documentElement;
  for (const { key, vars } of VAR_MAP) {
    const value = colors[key];
    if (value && isHexColor(value)) {
      for (const v of vars) root.style.setProperty(v, value);
    } else {
      for (const v of vars) root.style.removeProperty(v);
    }
  }
  if (colors.gold && isHexColor(colors.gold)) {
    root.style.setProperty("--color-gold-dark", darken(colors.gold, 0.18));
  } else {
    root.style.removeProperty("--color-gold-dark");
  }
}

/** Remove every runtime override (back to the built-in theme). */
export function clearTheme(): void {
  const root = document.documentElement;
  for (const v of ALL_VARS) root.style.removeProperty(v);
}
