import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";

/**
 * Village Location settings (migration 0034, 2026-10-29) — the
 * four "অবস্থান ও ঠিকানা" tiles on the public Village Page
 * (গ্রাম / উপজেলা / জেলা / দেশ), stored as nullable columns on
 * the single site_settings row. NULL (or a column that does not
 * exist yet, pre-0034) = the built-in default below is shown —
 * the confirmed facts, exactly what the page hardcoded before.
 *
 * The fetch selects ONLY these columns (never the main settings
 * select), so a missing column can only ever affect this section.
 *
 * The Admin side mirrors useVillagePageSettings: load the four
 * columns PLUS the existing `address` column (the পূর্ণ ঠিকানা
 * line, edited from the same page), save, and verify by reading
 * the row back — a write that does not come back identical is
 * reported as a failure (the project's write-verification rule).
 */
export const VILLAGE_LOCATION_DEFAULTS = {
  villageName: "নগর পাড়া",
  upazilaName: "তাড়াশ",
  districtName: "সিরাজগঞ্জ",
  countryName: "বাংলাদেশ",
} as const;

export interface VillageLocationValue {
  villageName: string;
  upazilaName: string;
  districtName: string;
  countryName: string;
}

const LOCATION_COLUMNS =
  "village_name, upazila_name, district_name, country_name";

function nonEmpty(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function toLocation(row: Record<string, unknown>): VillageLocationValue {
  return {
    villageName: nonEmpty(row.village_name) ?? VILLAGE_LOCATION_DEFAULTS.villageName,
    upazilaName: nonEmpty(row.upazila_name) ?? VILLAGE_LOCATION_DEFAULTS.upazilaName,
    districtName: nonEmpty(row.district_name) ?? VILLAGE_LOCATION_DEFAULTS.districtName,
    countryName: nonEmpty(row.country_name) ?? VILLAGE_LOCATION_DEFAULTS.countryName,
  };
}

/** Public read: the four tile values (defaults merged in). */
export function useVillageLocationPublic(): VillageLocationValue {
  const [value, setValue] = useState<VillageLocationValue>({
    ...VILLAGE_LOCATION_DEFAULTS,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isSupabaseConfigured || !supabase) return;
      const { data, error } = await supabase
        .from("site_settings")
        .select(LOCATION_COLUMNS)
        .eq("id", 1)
        .single();
      if (cancelled || error || !data) return; // keep defaults
      setValue(toLocation(data as Record<string, unknown>));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return value;
}

export interface VillageLocationAdminValue extends VillageLocationValue {
  address: string;
}

const ADMIN_COLUMNS = `${LOCATION_COLUMNS}, address`;

export function useVillageLocationAdmin() {
  const [value, setValue] = useState<VillageLocationAdminValue>({
    ...VILLAGE_LOCATION_DEFAULTS,
    address: "",
  });
  /** The raw stored strings ("" = nothing stored, default shows). */
  const [stored, setStored] = useState({
    villageName: "",
    upazilaName: "",
    districtName: "",
    countryName: "",
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** True when the four columns do not exist yet (migration 0034
   * not applied) — the page shows a pending notice, save disabled. */
  const [migrationPending, setMigrationPending] = useState(false);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("site_settings")
      .select(ADMIN_COLUMNS)
      .eq("id", 1)
      .single();
    setLoading(false);
    if (error || !data) {
      if ((error as { code?: string } | null)?.code === "42703") {
        setMigrationPending(true);
        setLoadError(null);
        return;
      }
      setLoadError("তথ্য পড়া যায়নি — আবার চেষ্টা করুন।");
      return;
    }
    setLoadError(null);
    setMigrationPending(false);
    const row = data as Record<string, unknown>;
    const raw = {
      villageName: typeof row.village_name === "string" ? row.village_name : "",
      upazilaName: typeof row.upazila_name === "string" ? row.upazila_name : "",
      districtName: typeof row.district_name === "string" ? row.district_name : "",
      countryName: typeof row.country_name === "string" ? row.country_name : "",
    };
    setStored(raw);
    setValue({
      villageName: raw.villageName.trim() !== "" ? raw.villageName : VILLAGE_LOCATION_DEFAULTS.villageName,
      upazilaName: raw.upazilaName.trim() !== "" ? raw.upazilaName : VILLAGE_LOCATION_DEFAULTS.upazilaName,
      districtName: raw.districtName.trim() !== "" ? raw.districtName : VILLAGE_LOCATION_DEFAULTS.districtName,
      countryName: raw.countryName.trim() !== "" ? raw.countryName : VILLAGE_LOCATION_DEFAULTS.countryName,
      address: typeof row.address === "string" ? row.address : "",
    });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Save the admin form and verify by reading the row back.
   * `form` holds what the admin typed; an emptied tile field is
   * stored as NULL so the built-in default comes back. */
  const save = useCallback(
    async (form: VillageLocationAdminValue): Promise<boolean> => {
      if (!isSupabaseConfigured || !supabase) return false;
      const orNull = (s: string) => (s.trim() === "" ? null : s.trim());
      const payload = {
        village_name: orNull(form.villageName),
        upazila_name: orNull(form.upazilaName),
        district_name: orNull(form.districtName),
        country_name: orNull(form.countryName),
        address: form.address.trim(),
      };
      const { error } = await supabase
        .from("site_settings")
        .update(payload)
        .eq("id", 1);
      if (error) return false;
      const back = await supabase
        .from("site_settings")
        .select(ADMIN_COLUMNS)
        .eq("id", 1)
        .single();
      if (back.error || !back.data) return false;
      const row = back.data as Record<string, unknown>;
      const matches =
        (row.village_name ?? null) === payload.village_name &&
        (row.upazila_name ?? null) === payload.upazila_name &&
        (row.district_name ?? null) === payload.district_name &&
        (row.country_name ?? null) === payload.country_name &&
        (typeof row.address === "string" ? row.address : "") === payload.address;
      if (matches) {
        setStored({
          villageName: payload.village_name ?? "",
          upazilaName: payload.upazila_name ?? "",
          districtName: payload.district_name ?? "",
          countryName: payload.country_name ?? "",
        });
        setValue({
          villageName: payload.village_name ?? VILLAGE_LOCATION_DEFAULTS.villageName,
          upazilaName: payload.upazila_name ?? VILLAGE_LOCATION_DEFAULTS.upazilaName,
          districtName: payload.district_name ?? VILLAGE_LOCATION_DEFAULTS.districtName,
          countryName: payload.country_name ?? VILLAGE_LOCATION_DEFAULTS.countryName,
          address: payload.address,
        });
      }
      return matches;
    },
    [],
  );

  return { value, stored, loading, loadError, migrationPending, reload: load, save };
}
