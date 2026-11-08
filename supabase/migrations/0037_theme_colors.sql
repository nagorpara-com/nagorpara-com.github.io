-- 0037_theme_colors.sql
-- APPLIED LIVE 2026-11-02 (owner's approval; Dashboard SQL
-- Editor, before/after verified: theme columns 0 -> 4).
--
-- Admin-editable website theme colors (owner's order, 2026-11-01:
-- "থিমের রং Admin প্যানেল থেকে বদলানোর ব্যবস্থা বানাও").
--
-- Four nullable columns on the single site_settings row (id = 1).
-- NULL means "use the built-in brand default" — the defaults stay
-- in src/index.css (@theme) and in src/utils/theme.ts:
--   theme_brand       -> --color-brand        (default #17623D)
--   theme_brand_dark  -> --color-brand-dark   (default #0F4A2E)
--   theme_gold        -> --color-gold         (default #F3C64E)
--   theme_brand_light -> --color-brand-light  (default #E8F3EC)
-- The app reads these on every load and, for each non-null value,
-- overrides the matching CSS variable, so the whole site
-- (public + admin) recolors without a rebuild. The gold-dark
-- shade (--color-gold-dark) is derived from theme_gold in code;
-- it is not a separate column.
--
-- Each value is constrained to the #RRGGBB hex form. Column-only
-- change on an existing table: the table-level grants and RLS
-- policies from 0001 already cover the new columns (anon reads
-- the settings row for the public site; admin-only writes via
-- the existing "site_settings: admin writes" policy), so no new
-- GRANT or policy is needed.

alter table public.site_settings
  add column if not exists theme_brand text,
  add column if not exists theme_brand_dark text,
  add column if not exists theme_gold text,
  add column if not exists theme_brand_light text;

alter table public.site_settings
  drop constraint if exists site_settings_theme_brand_hex,
  drop constraint if exists site_settings_theme_brand_dark_hex,
  drop constraint if exists site_settings_theme_gold_hex,
  drop constraint if exists site_settings_theme_brand_light_hex;

alter table public.site_settings
  add constraint site_settings_theme_brand_hex
    check (theme_brand is null or theme_brand ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint site_settings_theme_brand_dark_hex
    check (theme_brand_dark is null or theme_brand_dark ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint site_settings_theme_gold_hex
    check (theme_gold is null or theme_gold ~ '^#[0-9A-Fa-f]{6}$'),
  add constraint site_settings_theme_brand_light_hex
    check (theme_brand_light is null or theme_brand_light ~ '^#[0-9A-Fa-f]{6}$');
