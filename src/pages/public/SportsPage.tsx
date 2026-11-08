import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MatchVersusRow, PremiumStageBadge } from "../../components/MatchVersus";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { usePublicMatches } from "../../hooks/usePublicMatches";
import { useSportsBanners } from "../../hooks/useSportsBanners";
import type { Match, Sport, Team, Tournament } from "../../types/database.types";
import {
  formatMatchDate,
  MATCH_STATUS_LABELS_BN,
  SPORT_LABELS_BN,
  TOURNAMENT_STATUS_LABELS_BN,
} from "../../utils/matchDisplay";
import { toBn } from "../../utils/format";

/**
 * Public sports page (owner's order, 2026-11-03): the header's
 * ক্রীড়া প্রতিযোগিতা entry has NO dropdown any more — it lands
 * here. Layout, top to bottom, exactly as he specified: a
 * banner, the heading "ক্রীড়া প্রতিযোগিতা" under it, two
 * filter buttons — ফুটবল / ক্রিকেট (the "সব" button was
 * removed on the owner's order, 2026-11-03: only the tapped
 * sport shows; ফুটবল is selected when the page opens) — then a
 * search box, then the cards. Published data only, via
 * usePublicMatches; honest empty states — nothing is faked.
 *
 * Teams inline (owner's order, 2026-11-03, replacing the two
 * link cards placed an hour earlier): under the search box the
 * TEAMS of the selected sport show as cards — ফুটবল shows
 * football teams only, ক্রিকেট cricket teams only.
 * Four per row on desktop, two per row on mobile; at most 8
 * (desktop) / 4 (mobile) per sport show here, the rest stay
 * hidden — the search searches ALL teams, and "সব টিম দেখুন"
 * opens the full per-sport list. A team card opens its players.
 */
type Category = Sport;

const CATEGORIES: [Category, string][] = [
  ["football", "ফুটবল"],
  ["cricket", "ক্রিকেট"],
];

export default function SportsPage() {
  const { loading, error, matches, tournaments, teams } = usePublicMatches();
  const banners = useSportsBanners();
  const [category, setCategory] = useState<Category>("football");
  const [kind, setKind] = useState<"match" | "tournament">("tournament");
  const [query, setQuery] = useState("");

  const tournamentById = useMemo(
    () => new Map(tournaments.map((t) => [t.id, t])),
    [tournaments],
  );
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);

  const q = query.trim().toLowerCase();
  const matchHits = (m: Match) => {
    if (!q) return true;
    const a = m.team_a_id ? teamById.get(m.team_a_id)?.name ?? "" : "";
    const b = m.team_b_id ? teamById.get(m.team_b_id)?.name ?? "" : "";
    const tName = m.tournament_id ? tournamentById.get(m.tournament_id)?.name ?? "" : "";
    return [m.opponent, m.venue ?? "", a, b, tName].some((s) => s.toLowerCase().includes(q));
  };
  const tournamentHits = (t: Tournament) => {
    if (!q) return true;
    return [t.name, t.organizer ?? "", t.venue ?? ""].some((s) =>
      s.toLowerCase().includes(q),
    );
  };
  const teamHits = (t: Team) => {
    if (!q) return true;
    return [t.name, t.registered_by_name ?? ""].some((s) => s.toLowerCase().includes(q));
  };

  // Published-player counts per team (light id+team_id query).
  const [counts, setCounts] = useState<Map<string, number> | null>(null);
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("players")
        .select("id, team_id")
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
  }, []);

  // Season top performers (Step D): computed from the LIVE
  // season-stat views (football_season_stats / cricket_season_
  // stats, migrations 0004/0005) — rows are summed per player
  // across the view's seasons. Only lists with real rows show;
  // when nothing exists the whole section stays hidden.
  interface SeasonTopList {
    title: string;
    unit: string;
    rows: { name: string; value: number }[];
  }
  const [seasonTops, setSeasonTops] = useState<SeasonTopList[]>([]);
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    const client = supabase;
    let cancelled = false;
    (async () => {
      const view =
        category === "football" ? "football_season_stats" : "cricket_season_stats";
      const cols =
        category === "football" ? "player_id, goals" : "player_id, runs, wickets";
      const { data, error } = await client.from(view).select(cols);
      if (cancelled || error || !data) return;
      const rows = data as unknown as {
        player_id: string;
        goals?: number;
        runs?: number;
        wickets?: number;
      }[];
      const sum = (key: "goals" | "runs" | "wickets") => {
        const map = new Map<string, number>();
        for (const r of rows) {
          map.set(r.player_id, (map.get(r.player_id) ?? 0) + (r[key] ?? 0));
        }
        return [...map.entries()]
          .filter(([, v]) => v > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
      };
      const lists: { title: string; unit: string; entries: [string, number][] }[] =
        category === "football"
          ? [{ title: "সর্বোচ্চ গোলদাতা", unit: "গোল", entries: sum("goals") }]
          : [
              { title: "সর্বোচ্চ রান", unit: "রান", entries: sum("runs") },
              { title: "সর্বোচ্চ উইকেট", unit: "উইকেট", entries: sum("wickets") },
            ];
      const ids = [...new Set(lists.flatMap((l) => l.entries.map(([id]) => id)))];
      const names = new Map<string, string>();
      if (ids.length > 0) {
        const { data: ps } = await client
          .from("players")
          .select("id, name")
          .in("id", ids);
        for (const p of (ps ?? []) as { id: string; name: string }[]) {
          names.set(p.id, p.name);
        }
      }
      if (cancelled) return;
      setSeasonTops(
        lists
          .filter((l) => l.entries.length > 0)
          .map((l) => ({
            title: l.title,
            unit: l.unit,
            rows: l.entries.map(([id, value]) => ({
              name: names.get(id) ?? "প্লেয়ার",
              value,
            })),
          })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [category]);

  const teamsOf = (sport: Sport) =>
    teams.filter((t) => t.sport === sport && teamHits(t));

  const shownTournaments = useMemo(
    () =>
      tournaments.filter(
        (t) => (t.sport === category) && tournamentHits(t),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category, tournaments, q],
  );
  const shownMatches = useMemo(
    () =>
      matches.filter(
        (m) => (m.sport === category) && matchHits(m),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [category, matches, q],
  );

  const tournamentCard = (t: Tournament) => (
    <Link key={t.id} to="/tournaments" className="np-card np-card-hover block overflow-hidden">
      {t.banner_url ? (
        <img src={t.banner_url} alt="" className="h-36 w-full object-cover" loading="lazy" />
      ) : null}
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="np-chip">{SPORT_LABELS_BN[t.sport]}</span>
          {t.format ? (
            <span className="np-chip">{t.format === "league" ? "League" : "Knockout"}</span>
          ) : null}
          <span className="text-xs text-neutral-500">
            {t.season ? `মৌসুম ${t.season} · ` : ""}
            {TOURNAMENT_STATUS_LABELS_BN[t.status]}
          </span>
        </div>
        <p className="mt-2 font-semibold text-neutral-800">{t.name}</p>
        {(t.organizer || t.venue) && (
          <p className="mt-1 text-xs text-neutral-500">
            {t.organizer ? `আয়োজক: ${t.organizer}` : ""}
            {t.venue ? `${t.organizer ? " · " : ""}মাঠ: ${t.venue}` : ""}
          </p>
        )}
      </div>
    </Link>
  );

  const matchCard = (m: Match) => (
    <Link key={m.id} to={`/matches/${m.id}`} className="np-card np-card-hover block p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="np-chip">{SPORT_LABELS_BN[m.sport]}</span>
          <PremiumStageBadge round={m.round} />
        </span>
        <span className="shrink-0 text-xs text-neutral-500">{formatMatchDate(m.match_date)}</span>
      </div>
      <MatchVersusRow match={m} teamById={teamById} teams={teams} />
      {(m.status === "completed" || m.status === "live") && (m.our_score || m.opponent_score) && (
        <p className="mt-1 text-sm font-medium text-brand-dark">
          স্কোর: {m.our_score ?? "—"} : {m.opponent_score ?? "—"}
          {m.result ? <span className="text-neutral-600"> · {m.result}</span> : null}
        </p>
      )}
      <p className="mt-1 text-xs text-neutral-500">
        {m.tournament_id
          ? (tournamentById.get(m.tournament_id)?.name ?? "টুর্নামেন্ট")
          : "প্রীতি ম্যাচ"}
        {m.venue ? ` · ${m.venue}` : ""} · {MATCH_STATUS_LABELS_BN[m.status]}
      </p>
    </Link>
  );

  const teamCard = (t: Team, capped: boolean) => (
    <Link
      key={t.id}
      to={`/teams/${t.sport}/${t.id}`}
      className={`np-card np-card-hover flex items-center gap-3 p-4 ${capped ? "hidden lg:flex" : ""}`}
    >
      {t.logo_url ? (
        <img
          src={t.logo_url}
          alt=""
          className="h-14 w-14 shrink-0 rounded-full object-cover"
          loading="lazy"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-light text-xl font-bold text-brand-dark"
        >
          {t.name.charAt(0)}
        </span>
      )}
      <span className="min-w-0">
        <span className="block truncate font-bold text-brand-dark">{t.name}</span>
        {t.registered_by_name ? (
          // v180 D2: on mobile the half-width card left only ~71px, so
          // the name hid entirely behind the ellipsis — let the line
          // wrap on small screens; truncation returns from `sm` up.
          <span className="block text-xs text-neutral-500 sm:truncate">
            দায়িত্বশীল: {t.registered_by_name}
          </span>
        ) : null}
        {counts ? (
          <span className="mt-0.5 block text-xs font-medium text-neutral-600">
            {toBn(counts.get(t.id) ?? 0)} জন প্লেয়ার
          </span>
        ) : null}
      </span>
    </Link>
  );

  const teamSection = (sport: Sport) => {
    if (category !== sport) return null;
    const list = teamsOf(sport);
    if (list.length === 0) {
      if (category === sport && !q) {
        return (
          <p className="mt-8 rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
            এখনো কোনো {SPORT_LABELS_BN[sport]} টিম প্রকাশিত হয়নি।
          </p>
        );
      }
      return null;
    }
    const displayed = q ? list : list.slice(0, 8);
    return (
      <>
        <h2 className="mt-8 text-lg font-bold text-brand-dark">
          {SPORT_LABELS_BN[sport]} টিম
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {displayed.map((t, i) => teamCard(t, !q && i >= 4))}
        </div>
        {list.length > displayed.length && (
          <Link
            to={`/teams/${sport}`}
            className="mt-3 inline-block text-sm font-semibold text-brand hover:underline"
          >
            সব টিম দেখুন ›
          </Link>
        )}
      </>
    );
  };

  return (
    <div>
      {/* Banner — heading sits BELOW it (owner's layout). The
          photo and the text inside it come from the Admin
          "ক্রীড়া প্রতিযোগিতা ব্যানার" page (migration 0049);
          without a photo, the green gradient shows. */}
      <div
        aria-hidden="true"
        className="relative h-[210px] w-full overflow-hidden bg-gradient-to-r from-brand-dark via-brand to-brand-dark sm:h-[240px] lg:h-[300px]"
      >
        {banners.topUrl ? (
          <img src={banners.topUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
        {banners.topTitle ? (
          <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-xl font-bold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)] sm:text-2xl lg:text-3xl">
            {banners.topTitle}
          </span>
        ) : null}
      </div>
      <div
        className={`mx-auto max-w-6xl px-4 pt-8 sm:px-6${loading || error ? " pb-8" : ""}`}
      >
        <h1 className="text-2xl font-bold text-brand-dark">ক্রীড়া প্রতিযোগিতা</h1>

        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="বিভাগ বাছুন">
          {CATEGORIES.map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={category === value}
              onClick={() => setCategory(value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                category === value
                  ? "bg-brand text-white"
                  : "border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-4 max-w-md">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="নাম দিয়ে খুঁজুন…"
            aria-label="নাম দিয়ে খুঁজুন"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>

        {/* Team sections (owner's order, 2026-11-03): the teams
            themselves, filtered by the same buttons + search. */}
        {!loading && !error && teamSection("football")}
        {!loading && !error && teamSection("cricket")}

        {loading && <p className="mt-8 text-sm text-neutral-500">তথ্য লোড হচ্ছে…</p>}
        {error && (
          <div className="mt-8 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">
            {error}
          </div>
        )}

      </div>

      {/* Tournament section (owner's order, 2026-11-03): ONE
          section named "টুর্নামেন্ট" under the team sections,
          with two buttons inside it — ম্যাচ / টুর্নামেন্ট; only
          the tapped list shows. The section renders OUTSIDE the
          centred container so its banner can run full-bleed,
          exactly like the main banner at the top (owner's
          order, 2026-11-06: the lower banner must be the same
          size as the upper one — v177 matched only the height;
          its width must match too). */}
      {!loading && !error && (
        <section>
          {/* টুর্নামেন্ট ব্যানার (owner's order, 2026-11-03):
              the second banner, above this section's heading —
              shown only when a photo or a text is set in Admin.
              Full viewport width with square edges, at the same
              heights as the main banner (owner's order,
              2026-11-06). */}
          {banners.tournamentUrl || banners.tournamentTitle ? (
            <div
              aria-hidden="true"
              className="relative mt-10 h-[210px] w-full overflow-hidden bg-gradient-to-r from-brand-dark via-brand to-brand-dark sm:h-[240px] lg:h-[300px]"
            >
              {banners.tournamentUrl ? (
                <img src={banners.tournamentUrl} alt="" className="h-full w-full object-cover" />
              ) : null}
              {banners.tournamentTitle ? (
                <span className="absolute inset-0 flex items-center justify-center px-4 text-center text-lg font-bold text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)] sm:text-xl lg:text-2xl">
                  {banners.tournamentTitle}
                </span>
              ) : null}
            </div>
          ) : null}
          <div
            className={`mx-auto max-w-6xl px-4 sm:px-6${seasonTops.length > 0 ? "" : " pb-8"}`}
          >
            <h2
              className={`${banners.tournamentUrl || banners.tournamentTitle ? "mt-6" : "mt-10"} text-lg font-bold text-brand-dark`}
            >
              টুর্নামেন্ট
            </h2>
            <div className="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="ম্যাচ না টুর্নামেন্ট">
              {(
                [
                  ["match", "ম্যাচ"],
                  ["tournament", "টুর্নামেন্ট"],
                ] as ["match" | "tournament", string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={kind === value}
                  onClick={() => setKind(value)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium ${
                    kind === value
                      ? "bg-brand text-white"
                      : "border border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {kind === "tournament" &&
              (shownTournaments.length > 0 ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {shownTournaments.map(tournamentCard)}
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
                  {q
                    ? "এই নামে কোনো টুর্নামেন্ট পাওয়া যায়নি।"
                    : "এখনো কোনো টুর্নামেন্ট প্রকাশিত হয়নি।"}
                </p>
              ))}

            {kind === "match" &&
              (shownMatches.length > 0 ? (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {shownMatches.map(matchCard)}
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-neutral-300 bg-white p-4 text-sm text-neutral-500">
                  {q ? "এই নামে কোনো ম্যাচ পাওয়া যায়নি।" : "এখনো কোনো ম্যাচ প্রকাশিত হয়নি।"}
                </p>
              ))}
          </div>
        </section>
      )}

      {/* Season top performers (Step D): from the live
          season-stat views; the section renders only when at
          least one list has real rows. */}
      {!loading && !error && seasonTops.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6">
          <h2 className="mt-10 text-lg font-bold text-brand-dark">সেরা পারফরমার</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {seasonTops.map((list) => (
              <div key={list.title} className="np-card p-4">
                <h3 className="text-sm font-bold text-brand-dark">{list.title}</h3>
                <ol className="mt-2 space-y-1">
                  {list.rows.map((r) => (
                    <li
                      key={r.name}
                      className="flex items-baseline justify-between gap-2 text-sm"
                    >
                      <span className="min-w-0 truncate font-medium text-neutral-800">
                        {r.name}
                      </span>
                      <span className="shrink-0 font-semibold text-brand-dark">
                        {toBn(r.value)} {list.unit}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
