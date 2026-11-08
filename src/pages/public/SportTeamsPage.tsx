import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { usePublishedTeams } from "../../hooks/useTeams";
import type { Sport } from "../../types/database.types";
import { SPORT_LABELS_BN } from "../../utils/matchDisplay";
import { formatDateBn, toBn } from "../../utils/format";

/**
 * Public teams list for one sport (owner's flow, 2026-11-03:
 * first the teams, then a team's players). Shows every
 * PUBLISHED registered team of the sport with its logo, the
 * responsible person's name when recorded, and how many
 * published players belong to it. Clicking a team opens its
 * players page. Honest empty state — nothing is faked.
 */
export default function SportTeamsPage() {
  const { sport: sportParam } = useParams();
  const sport: Sport = sportParam === "cricket" ? "cricket" : "football";
  const allTeams = usePublishedTeams();
  const teams = useMemo(
    () => allTeams.filter((t) => t.sport === sport),
    [allTeams, sport],
  );

  const [counts, setCounts] = useState<Map<string, number> | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, team_id")
        .eq("sport", sport)
        .eq("is_active", true)
        .eq("status", "published")
        .is("archived_at", null);
      if (cancelled || error || !data) return;
      const map = new Map<string, number>();
      for (const row of data as { team_id: string | null }[]) {
        if (row.team_id) map.set(row.team_id, (map.get(row.team_id) ?? 0) + 1);
      }
      setCounts(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [sport]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <Link to="/sports" className="text-sm font-medium text-brand hover:underline">
        ‹ ক্রীড়া প্রতিযোগিতা
      </Link>
      <h1 className="mt-2 text-2xl font-bold text-brand-dark">
        {SPORT_LABELS_BN[sport]} — টিম
      </h1>
      {teams.length > 0 && (
        <p className="mt-1 text-sm text-neutral-500">মোট {toBn(teams.length)}টি টিম</p>
      )}

      {teams.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
          এখনো কোনো {SPORT_LABELS_BN[sport]} টিম প্রকাশিত হয়নি।
        </p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {teams.map((t) => (
            <Link
              key={t.id}
              to={`/teams/${sport}/${t.id}`}
              className="np-card np-card-hover flex items-center gap-3.5 p-4"
            >
              {t.logo_url ? (
                <img
                  src={t.logo_url}
                  alt=""
                  className="h-16 w-16 shrink-0 rounded-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-light text-2xl font-bold text-brand-dark"
                >
                  {t.name.charAt(0)}
                </span>
              )}
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  {t.jersey_color_hex ? (
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-neutral-300"
                      style={{ backgroundColor: t.jersey_color_hex }}
                    />
                  ) : null}
                  <span className="truncate font-bold text-brand-dark">{t.name}</span>
                </span>
                {t.registered_by_name ? (
                  // v180 D2: same mobile wrap fix as the /sports card —
                  // the name was fully hidden behind the ellipsis.
                  <span className="block text-xs text-neutral-500 sm:truncate">
                    দায়িত্বশীল: {t.registered_by_name}
                  </span>
                ) : null}
                {t.captain_name ? (
                  <span className="block text-xs text-neutral-500 sm:truncate">
                    অধিনায়ক: {t.captain_name}
                  </span>
                ) : null}
                {t.established_date ? (
                  <span className="mt-0.5 block text-xs text-neutral-500">
                    শুরুর তারিখ: {formatDateBn(t.established_date)}
                  </span>
                ) : null}
                {counts ? (
                  <span className="mt-0.5 block text-xs font-medium text-neutral-600">
                    {toBn(counts.get(t.id) ?? 0)} জন প্লেয়ার
                  </span>
                ) : null}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
