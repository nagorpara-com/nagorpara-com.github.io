import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import SeasonStatsEditor from "../../components/admin/SeasonStatsEditor";
import type { Player, PlayerStatus, Sport } from "../../types/database.types";

/**
 * Admin — পরিসংখ্যান ও প্রকাশ (Statistics & Publishing), one page
 * per sport via ?sport=.
 *
 * Split out of AdminPlayersPage on 2026-10-26: the owner found
 * that টিম ও প্লেয়ার and পরিসংখ্যান ও প্রকাশ were the SAME page
 * (both sidebar items opened the squad page, and both lit up at
 * once) and asked for them to be genuinely separate. This page
 * now owns exactly two things:
 *   1. মৌসুমভিত্তিক পরিসংখ্যান সম্পাদনা (SeasonStatsEditor)
 *   2. প্রকাশ / অপ্রকাশ (publish state of each player profile)
 * Biodata (name, photo, club, position…) is managed ONLY on the
 * টিম ও প্লেয়ার page. Same tables, same RLS — no data moved.
 */
export default function AdminPlayerStatsPage() {
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const sport: Sport = searchParams.get("sport") === "cricket" ? "cricket" : "football";

  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Player | null>(null);

  const canEdit = profile?.role === "admin" || profile?.role === "editor";
  const isAdminRole = profile?.role === "admin";

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error: err } = await supabase
      .from("players")
      .select("*")
      .eq("sport", sport)
      .order("display_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (err) setError(err.message);
    else setPlayers((data ?? []) as Player[]);
    setLoading(false);
  }, [sport]);

  useEffect(() => {
    setSelected(null);
    setNotice(null);
    setError(null);
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      if (!showArchived && p.archived_at) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        (p.jersey_no !== null && String(p.jersey_no).includes(q))
      );
    });
  }, [players, query, showArchived]);

  // Publish / unpublish — the same status toggle the squad list
  // used to carry, now verified by reading the row back.
  async function toggleStatus(player: Player) {
    if (!supabase) return;
    const next: PlayerStatus = (player.status ?? "draft") === "published" ? "draft" : "published";
    setError(null);
    setNotice(null);
    const { error: err } = await supabase.from("players").update({ status: next }).eq("id", player.id);
    if (err) {
      setError(
        err.message.includes("approval")
          ? "প্রকাশ করতে Admin-এর অনুমোদন লাগবে — Database Trigger অনুযায়ী আপনার ভূমিকায় প্রকাশের অনুমতি নেই।"
          : err.message,
      );
      return;
    }
    const { data: back } = await supabase
      .from("players")
      .select("status")
      .eq("id", player.id)
      .maybeSingle();
    if (!back || back.status !== next) {
      setError("অবস্থা বদলানোর পর যাচাই মেলেনি — আবার চেষ্টা করুন।");
      return;
    }
    setNotice(
      next === "published"
        ? `"${player.name}" প্রকাশিত হয়েছে — যাচাই করা হয়েছে।`
        : `"${player.name}" অপ্রকাশিত (Draft) করা হয়েছে — যাচাই করা হয়েছে।`,
    );
    await load();
  }

  if (!isSupabaseConfigured) {
    return (
      <div>
        <h1 className="text-xl font-bold text-brand-dark">পরিসংখ্যান ও প্রকাশ</h1>
        <div className="mt-4 rounded-xl border border-gold/50 bg-gold/10 p-4 text-sm leading-relaxed text-neutral-700">
          Supabase এখনো সংযুক্ত হয়নি, তাই পরিসংখ্যান ও প্রকাশের আসল ডেটা এখানে দেখানো যাচ্ছে না।
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand-dark">পরিসংখ্যান ও প্রকাশ</h1>
          <p className="mt-1 text-sm text-neutral-500">
            প্লেয়ারদের পরিসংখ্যান ও প্রকাশ পরিচালনা।
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-xl border border-brand/30 bg-brand-light p-3 text-sm text-brand-dark" role="status">
          {notice}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="নাম বা জার্সি নম্বর দিয়ে খুঁজুন…"
          className="w-64 rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          আর্কাইভ করা প্লেয়ার দেখুন
        </label>
      </div>

      <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-200 bg-white">
        {loading ? (
          <p className="p-4 text-sm text-neutral-500">লোড হচ্ছে…</p>
        ) : visible.length === 0 ? (
          <p className="p-4 text-sm text-neutral-500">কোনো প্লেয়ার পাওয়া যায়নি।</p>
        ) : (
          <table className="w-full min-w-[560px] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-100 text-xs uppercase tracking-wide text-neutral-400">
                <th className="px-4 py-3 font-semibold">প্লেয়ার</th>
                <th className="px-4 py-3 font-semibold">জার্সি</th>
                <th className="px-4 py-3 font-semibold">প্রকাশনা</th>
                <th className="px-4 py-3 font-semibold">অবস্থা</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((p) => (
                <tr key={p.id} className="border-b border-neutral-50 align-middle">
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-light font-bold text-brand-dark">
                        {p.name.charAt(0)}
                      </span>
                      <span>
                        <span className="block font-semibold text-neutral-800">{p.name}</span>
                        <span className="block text-xs text-neutral-400">
                          {p.position}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3">{p.jersey_no !== null ? `#${p.jersey_no}` : "—"}</td>
                  <td className="px-4 py-3">
                    {(p.status ?? "draft") === "published" ? (
                      <span className="rounded-full bg-brand px-2.5 py-1 text-xs font-semibold text-white">Published (প্রকাশিত)</span>
                    ) : (p.status ?? "draft") === "pending" ? (
                      <span className="rounded-full bg-gold px-2.5 py-1 text-xs font-semibold text-brand-dark">Pending</span>
                    ) : (
                      <span className="rounded-full bg-neutral-200 px-2.5 py-1 text-xs font-semibold text-neutral-600">Draft (খসড়া)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.archived_at ? (
                      <span className="text-xs font-medium text-neutral-400">Archived</span>
                    ) : p.is_active ? (
                      <span className="rounded-full bg-brand-light px-2.5 py-1 text-xs font-semibold text-brand-dark">Active</span>
                    ) : (
                      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-semibold text-neutral-500">Inactive</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelected(selected?.id === p.id ? null : p)}
                        className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-brand-dark hover:border-brand"
                      >
                        পরিসংখ্যান
                      </button>
                      <Link to={`/${sport}/player/${p.id}`} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-brand-dark hover:border-brand">
                        Public
                      </Link>
                      {isAdminRole && !p.archived_at && (
                        <button
                          type="button"
                          onClick={() => void toggleStatus(p)}
                          className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-brand-dark hover:border-brand"
                        >
                          {(p.status ?? "draft") === "published" ? "অপ্রকাশ করুন" : "প্রকাশ করুন"}
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <section className="mt-4 rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-neutral-800">{selected.name}</h2>
              <p className="text-xs text-neutral-400">
                {sport === "football" ? "ফুটবল" : "ক্রিকেট"}
                {selected.jersey_no !== null ? ` · জার্সি #${selected.jersey_no}` : ""}
                {selected.position ? ` · ${selected.position}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm text-brand-dark hover:border-brand"
            >
              বন্ধ করুন
            </button>
          </div>
          <div className="mt-4">
            <SeasonStatsEditor key={selected.id} sport={sport} playerId={selected.id} canEdit={canEdit} />
          </div>
        </section>
      )}
    </div>
  );
}
