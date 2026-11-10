import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";
import { useAuth } from "../../context/AuthContext";
import {
  CRICKET_ROLE_OPTIONS,
  FOOTBALL_POSITIONS,
  PREFERRED_FOOT_OPTIONS,
  cricketRoleFromPosition,
  cricketRolePositionText,
} from "../../config/positions";
import PhotoUploadField from "../../components/admin/PhotoUploadField";
import { compressImageForUpload } from "../../utils/compressImage";
import type {
  Player,
  PlayerProfileSection,
  PlayerSectionItem,
  PlayerSectionType,
  PlayerStatus,
  Sport,
  Team,
} from "../../types/database.types";

interface SeasonRow {
  season: string;
  matches: number;
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
}

interface PlayerForm {
  name: string;
  photo_url: string;
  jersey_no: string;
  position: string;
  club: string;
  /** Registered team id (migration 0046); "" = no team. */
  team_id: string;
  bio: string;
  batting_style: string;
  bowling_style: string;
  display_order: string;
  is_active: boolean;
  status: PlayerStatus;
  /** Migration 0051 extras; "" = not recorded. */
  date_of_birth: string;
  phone: string;
  address: string;
  preferred_foot: string;
  role: string;
}

const EMPTY_FORM: PlayerForm = {
  name: "",
  photo_url: "",
  jersey_no: "",
  position: "",
  club: "",
  team_id: "",
  bio: "",
  batting_style: "",
  bowling_style: "",
  display_order: "0",
  is_active: true,
  status: "draft",
  date_of_birth: "",
  phone: "",
  address: "",
  preferred_foot: "",
  role: "",
};

/** Stored cricket season row (migration 0005 field set). */
interface CkSeasonRow {
  season: string;
  matches: number;
  innings: number;
  runs: number;
  highest_score: number;
  not_outs: number;
  balls_faced: number;
  fours: number;
  sixes: number;
  fifties: number;
  hundreds: number;
  wickets: number;
  balls_bowled: number;
  runs_conceded: number;
  maidens: number;
  best_bowling: string;
  catches: number;
  stumpings: number;
  run_outs: number;
}

const STATUS_LABEL: Record<PlayerStatus, string> = {
  draft: "Draft (খসড়া)",
  pending: "Pending Approval (অনুমোদনের অপেক্ষায়)",
  published: "Published (প্রকাশিত)",
};

/** Dynamic profile sections (migration 0009, Phase 2 admin UI). */
const SECTION_TYPE_LABEL: Record<PlayerSectionType, string> = {
  text: "Text (মুক্ত লেখা)",
  info_fields: "Custom Fields (তথ্য)",
  achievements: "Achievements (অর্জন)",
  career: "Career (ক্যারিয়ার)",
  media: "Media (গ্যালারি ছবি)",
  links: "Links (লিংক)",
};

interface SectionForm {
  section_type: PlayerSectionType;
  title: string;
  body: string;
  items: PlayerSectionItem[];
  is_visible: boolean;
}

const EMPTY_SECTION_FORM: SectionForm = {
  section_type: "info_fields",
  title: "",
  body: "",
  items: [],
  is_visible: true,
};

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand";
const labelCls = "mb-1 block text-xs font-semibold text-neutral-600";

/**
 * Player Management (Phase 6 management rules).
 *
 * Everything writes to the EXISTING tables (`players`,
 * `football_player_stats`) through Supabase, so the database — RLS
 * policies plus the publish-approval trigger (migration 0004) — is
 * the real security boundary, not this UI. Only Published + Active +
 * unarchived players appear on the public website. A player with
 * linked match records cannot be permanently deleted here; archive
 * is offered instead, which preserves all history.
 *
 * Until Supabase is connected this page shows an honest notice —
 * there is no local/demo player data.
 */
export default function AdminPlayersPage() {
  const { profile } = useAuth();
  // The admin sidebar links here with ?sport=football / ?sport=cricket
  // so each sport's menu opens this page for its own sport only
  // (owner, 2026-11-02: no in-page sport tabs — the football
  // section must not show a cricket switch, and vice versa).
  const [searchParams] = useSearchParams();
  const [sport, setSport] = useState<Sport>(
    searchParams.get("sport") === "cricket" ? "cricket" : "football",
  );
  const prevSportRef = useRef(sport);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [positionFilter, setPositionFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | PlayerStatus>("all");
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Player | null>(null);
  const [details, setDetails] = useState<Player | null>(null);
  const [editing, setEditing] = useState<Player | "new" | null>(null);
  // The form now sits ABOVE the list (owner's order, 2026-11-02):
  // when it opens from a list row's Edit button, bring it into
  // view so the admin actually sees it.
  const formRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editing !== null) formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editing]);
  // Sport arriving from the sidebar menu (?sport=) is applied
  // here, after every state it resets has been declared: when
  // the menu switches sport, the page starts clean — the same
  // reset the removed in-page tabs used to do.
  useEffect(() => {
    const linked = searchParams.get("sport");
    if (linked !== "cricket" && linked !== "football") return;
    if (prevSportRef.current === linked) return;
    prevSportRef.current = linked;
    setSport(linked);
    setQuery("");
    setPositionFilter("all");
    setStatusFilter("all");
    setShowArchived(false);
    setEditing(null);
    setDetails(null);
  }, [searchParams]);
  const [form, setForm] = useState<PlayerForm>(EMPTY_FORM);
  // Migration 0025 (players.club) support, probed once on mount:
  // until the migration is applied live the column does not exist,
  // so the form shows an honest note and saves omit the field
  // instead of failing.
  const [clubSupported, setClubSupported] = useState(true);
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { error } = await supabase!.from("players").select("club").limit(1);
      if (!cancelled && error && error.code === "42703") setClubSupported(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // Migration 0046 (players.team_id) support, probed the same
  // way: until the migration is applied live the column does not
  // exist, so the টিম dropdown shows an honest note and saves
  // omit the field instead of failing.
  const [teamSupported, setTeamSupported] = useState(true);
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { error } = await supabase!.from("players").select("team_id").limit(1);
      if (!cancelled && error && error.code === "42703") setTeamSupported(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // Migration 0051 (Step B extras: date_of_birth, phone, address,
  // preferred_foot, role) support, probed the same way as ONE
  // group: until the migration is applied live the columns do
  // not exist, so the new fields show an honest note, stay
  // disabled and saves omit the whole group. (সক্রিয় toggle is
  // NOT part of this group — is_active exists since 0001.)
  const [extrasSupported, setExtrasSupported] = useState(true);
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { error } = await supabase!.from("players").select("date_of_birth").limit(1);
      if (!cancelled && error && error.code === "42703") setExtrasSupported(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // Every team created for the CURRENT sport (migration 0043's
  // teams list, published or not — an admin assigns players to a
  // team before it is published too). No limit: however many
  // teams exist, the টিম dropdown lists them all.
  const [formTeams, setFormTeams] = useState<Pick<Team, "id" | "name" | "is_published">[]>([]);
  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase!
        .from("teams")
        .select("id, name, is_published")
        .eq("sport", sport)
        .order("display_order")
        .order("name");
      if (!cancelled) setFormTeams(error ? [] : ((data ?? []) as Pick<Team, "id" | "name" | "is_published">[]));
    })();
    return () => {
      cancelled = true;
    };
  }, [sport]);
  const [saving, setSaving] = useState(false);
  const [seasons, setSeasons] = useState<SeasonRow[]>([]);
  const [computedSeasons, setComputedSeasons] = useState<SeasonRow[]>([]);
  const [ckSeasons, setCkSeasons] = useState<CkSeasonRow[]>([]);
  const [ckComputed, setCkComputed] = useState<{ season: string; matches: number; runs: number; wickets: number }[]>([]);
  const [perfCount, setPerfCount] = useState(0);
  const [sections, setSections] = useState<PlayerProfileSection[]>([]);
  const [secEditing, setSecEditing] = useState<PlayerProfileSection | "new" | null>(null);
  const [secForm, setSecForm] = useState<SectionForm>(EMPTY_SECTION_FORM);
  const [secSaving, setSecSaving] = useState(false);
  const [secUploading, setSecUploading] = useState(false);
  const [secConfirmDelete, setSecConfirmDelete] = useState<PlayerProfileSection | null>(null);
  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return;
    setLoading(true);
    const { data, error: err } = await supabase
      .from("players")
      .select("*")
      .eq("sport", sport)
      .order("display_order");
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setPlayers((data ?? []) as Player[]);
  }, [sport]);

  useEffect(() => {
    void load();
  }, [load]);

  // Football & cricket TEAM settings (names, seasons, card stats) are
  // managed centrally on the Website Settings page (Batch 1) — this
  // page links there instead of keeping a second editor.

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return players.filter((p) => {
      if (showArchived ? !p.archived_at : p.archived_at) return false;
      if (positionFilter !== "all" && p.position !== positionFilter) return false;
      if (statusFilter !== "all" && (p.status ?? "draft") !== statusFilter) return false;
      if (
        q &&
        !p.name.toLowerCase().includes(q) &&
        !(p.jersey_no !== null && String(p.jersey_no).includes(q))
      )
        return false;
      return true;
    });
  }, [players, query, positionFilter, statusFilter, showArchived]);

  // Summary for the CURRENT sport, computed from the loaded rows so a
  // player is never counted twice: the first three cards share the
  // non-archived base; archived players are counted separately.
  const summary = useMemo(() => {
    const base = players.filter((p) => !p.archived_at);
    return {
      total: base.length,
      active: base.filter((p) => p.is_active).length,
      published: base.filter((p) => (p.status ?? "draft") === "published").length,
      archived: players.length - base.length,
    };
  }, [players]);

  function resetFilters() {
    setQuery("");
    setPositionFilter("all");
    setStatusFilter("all");
    setShowArchived(false);
  }

  const positions = useMemo(
    () => [...new Set(players.map((p) => p.position))].sort(),
    [players],
  );

  async function openEditor(player: Player | "new") {
    setError(null);
    setNotice(null);
    setSections([]);
    setSecEditing(null);
    setSecConfirmDelete(null);
    setSeasons([]);
    setComputedSeasons([]);
    setCkSeasons([]);
    setCkComputed([]);
    setPerfCount(0);
    if (player === "new") {
      setForm(EMPTY_FORM);
      setEditing("new");
      return;
    }
    setForm({
      name: player.name,
      photo_url: player.photo_url ?? "",
      jersey_no: player.jersey_no !== null ? String(player.jersey_no) : "",
      position: player.position,
      club: player.club ?? "",
      team_id: player.team_id ?? "",
      bio: player.bio ?? "",
      batting_style: player.batting_style ?? "",
      bowling_style: player.bowling_style ?? "",
      display_order: String(player.display_order),
      is_active: player.is_active,
      status: player.status ?? "draft",
      date_of_birth: player.date_of_birth ?? "",
      phone: player.phone ?? "",
      address: player.address ?? "",
      preferred_foot: player.preferred_foot ?? "",
      // Older cricket rows carry only a free-text position; the
      // ভূমিকা select opens with the role that position implies.
      role: player.role ?? (player.sport === "cricket" ? cricketRoleFromPosition(player.position) : ""),
    });
    setEditing(player);
    if (supabase && sport === "cricket") {
      const [stored, computed, perf] = await Promise.all([
        supabase.from("cricket_player_stats").select("*").eq("player_id", player.id),
        supabase.from("cricket_season_stats").select("season, matches, runs, wickets").eq("player_id", player.id),
        supabase.from("match_performances").select("id", { count: "exact", head: true }).eq("player_id", player.id),
      ]);
      setCkSeasons(
        ((stored.data ?? []) as (CkSeasonRow & { best_bowling: string | null })[]).map((r) => ({
          ...r,
          best_bowling: r.best_bowling ?? "",
        })),
      );
      setCkComputed((computed.data ?? []) as { season: string; matches: number; runs: number; wickets: number }[]);
      setPerfCount(perf.count ?? 0);
    }
    if (supabase && sport === "football") {
      const [stored, computed, perf] = await Promise.all([
        supabase.from("football_player_stats").select("*").eq("player_id", player.id),
        supabase.from("football_season_stats").select("*").eq("player_id", player.id),
        supabase.from("match_performances").select("id", { count: "exact", head: true }).eq("player_id", player.id),
      ]);
      setSeasons(((stored.data ?? []) as SeasonRow[]).map(({ season, matches, goals, assists, yellow_cards, red_cards }) => ({ season, matches, goals, assists, yellow_cards, red_cards })));
      setComputedSeasons(((computed.data ?? []) as SeasonRow[]).map(({ season, matches, goals, assists, yellow_cards, red_cards }) => ({ season, matches, goals, assists, yellow_cards, red_cards })));
      setPerfCount(perf.count ?? 0);
    }
    // Dynamic profile sections (migration 0009) — sport-independent,
    // loaded for every existing player alongside the stats.
    if (supabase) {
      const { data } = await supabase
        .from("player_profile_sections")
        .select("*")
        .eq("player_id", player.id)
        .order("display_order")
        .order("created_at");
      setSections((data ?? []) as PlayerProfileSection[]);
    }
  }

  async function loadSections(playerId: string) {
    if (!supabase) return;
    const { data } = await supabase
      .from("player_profile_sections")
      .select("*")
      .eq("player_id", playerId)
      .order("display_order")
      .order("created_at");
    setSections((data ?? []) as PlayerProfileSection[]);
  }

  function openSectionEditor(section: PlayerProfileSection | "new") {
    setError(null);
    setNotice(null);
    if (section === "new") {
      setSecForm(EMPTY_SECTION_FORM);
      setSecEditing("new");
      return;
    }
    setSecForm({
      section_type: section.section_type,
      title: section.title,
      body: section.body ?? "",
      items: (section.items ?? []).map((it) => ({ ...it })),
      is_visible: section.is_visible,
    });
    setSecEditing(section);
  }

  // Keep only rows where at least one field of the section's shape
  // carries content; trim every value. Shapes follow migration 0009.
  function cleanItems(type: PlayerSectionType, items: PlayerSectionItem[]): PlayerSectionItem[] {
    const t = (v?: string) => (v ?? "").trim();
    switch (type) {
      case "info_fields":
        return items
          .map((it) => ({ label: t(it.label), value: t(it.value) }))
          .filter((it) => it.label || it.value);
      case "achievements":
        return items
          .map((it) => ({ year: t(it.year), title: t(it.title), description: t(it.description) }))
          .filter((it) => it.year || it.title || it.description);
      case "career":
        return items
          .map((it) => ({ period: t(it.period), title: t(it.title), description: t(it.description) }))
          .filter((it) => it.period || it.title || it.description);
      case "media":
        return items
          .map((it) => ({ url: t(it.url), caption: t(it.caption) }))
          .filter((it) => it.url);
      case "links":
        return items
          .map((it) => ({ label: t(it.label), url: t(it.url) }))
          .filter((it) => it.label || it.url);
      default:
        return [];
    }
  }

  async function saveSection() {
    if (!supabase || secEditing === null || !editingPlayer) return;
    if (!secForm.title.trim()) {
      setError("বিভাগের শিরোনাম আবশ্যক।");
      return;
    }
    setSecSaving(true);
    setError(null);
    const payload = {
      player_id: editingPlayer.id,
      section_type: secForm.section_type,
      title: secForm.title.trim(),
      body: secForm.section_type === "text" ? secForm.body.trim() || null : null,
      items: cleanItems(secForm.section_type, secForm.items),
      is_visible: secForm.is_visible,
      updated_at: new Date().toISOString(),
    };
    const res =
      secEditing === "new"
        ? await supabase
            .from("player_profile_sections")
            .insert({ ...payload, display_order: sections.length })
        : await supabase
            .from("player_profile_sections")
            .update(payload)
            .eq("id", secEditing.id);
    setSecSaving(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    setNotice(secEditing === "new" ? "নতুন বিভাগ যোগ হয়েছে।" : "বিভাগ সংরক্ষিত হয়েছে।");
    setSecEditing(null);
    await loadSections(editingPlayer.id);
  }

  async function confirmDeleteSection() {
    if (!supabase || !secConfirmDelete || !editingPlayer) return;
    const target = secConfirmDelete;
    setSecConfirmDelete(null);
    const { error: err } = await supabase
      .from("player_profile_sections")
      .delete()
      .eq("id", target.id);
    if (err) setError(err.message);
    else {
      setNotice("বিভাগ মুছে ফেলা হয়েছে।");
      await loadSections(editingPlayer.id);
    }
  }

  async function toggleSectionVisible(section: PlayerProfileSection) {
    if (!supabase || !editingPlayer) return;
    const { error: err } = await supabase
      .from("player_profile_sections")
      .update({ is_visible: !section.is_visible, updated_at: new Date().toISOString() })
      .eq("id", section.id);
    if (err) setError(err.message);
    else await loadSections(editingPlayer.id);
  }

  // Reorder: swap with the neighbour, then re-sequence display_order
  // for the whole list so orders stay unique and gapless.
  async function moveSection(section: PlayerProfileSection, dir: -1 | 1) {
    if (!supabase || !editingPlayer) return;
    const idx = sections.findIndex((s) => s.id === section.id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= sections.length) return;
    const reordered = [...sections];
    const [moved] = reordered.splice(idx, 1);
    reordered.splice(target, 0, moved);
    setSections(reordered);
    for (let i = 0; i < reordered.length; i++) {
      if (reordered[i].display_order !== i) {
        await supabase
          .from("player_profile_sections")
          .update({ display_order: i })
          .eq("id", reordered[i].id);
      }
    }
    await loadSections(editingPlayer.id);
  }

  // Media upload for a media section: same bucket, rules and path
  // discipline as the profile photo (image only, max 2 MB).
  async function uploadSectionMedia(file: File) {
    if (!supabase || !editingPlayer) return;
    if (!file.type.startsWith("image/")) {
      setError("শুধু ছবির ফাইল আপলোড করা যাবে (অন্য ধরনের ফাইল গ্রহণযোগ্য নয়)।");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("ছবির আকার সর্বোচ্চ 2 MB হতে হবে — ছোট বা সংকুচিত ছবি বেছে নিন।");
      return;
    }
    setSecUploading(true);
    setError(null);
    // v191: same browser-side compression as every other
    // Admin photo upload before the file is stored.
    const uploadFile = await compressImageForUpload(file);
    const path = `media/${editingPlayer.id}/${Date.now()}-${uploadFile.name.replace(/[^\w.-]+/g, "_")}`;
    const { error: upErr } = await supabase.storage.from("player-photos").upload(path, uploadFile);
    if (upErr) {
      setSecUploading(false);
      setError(`ছবি আপলোড ব্যর্থ: ${upErr.message}`);
      return;
    }
    const { data } = supabase.storage.from("player-photos").getPublicUrl(path);
    setSecForm((f) => ({ ...f, items: [...f.items, { url: data.publicUrl, caption: "" }] }));
    setSecUploading(false);
    setNotice("ছবি আপলোড হয়েছে এবং তালিকায় যোগ হয়েছে — বিভাগটি Save করুন।");
  }

  async function savePlayer() {
    if (!supabase || editing === null) return;
    if (!form.name.trim()) {
      setError("নাম আবশ্যক।");
      return;
    }
    // Cricket (Step B): the ভূমিকা select replaces the পজিশন
    // field while migration 0051 is live — a role must be picked,
    // and its English label is what the legacy position column
    // stores. Pre-0051 the position field stays visible and is
    // required exactly as before.
    if (sport === "cricket" && extrasSupported && !form.role) {
      setError("ক্রিকেটের জন্য ভূমিকা বাছুন।");
      return;
    }
    if ((sport === "football" || !extrasSupported) && !form.position.trim()) {
      setError("নাম ও পজিশন আবশ্যক।");
      return;
    }
    setSaving(true);
    setError(null);
    const payload = {
      sport,
      name: form.name.trim(),
      photo_url: form.photo_url.trim() || null,
      jersey_no: form.jersey_no === "" ? null : Number(form.jersey_no),
      position:
        sport === "cricket" && extrasSupported
          ? (cricketRolePositionText(form.role) ?? form.position.trim())
          : form.position.trim(),
      ...(clubSupported ? { club: form.club.trim() || null } : {}),
      ...(teamSupported ? { team_id: form.team_id || null } : {}),
      ...(extrasSupported
        ? {
            date_of_birth: form.date_of_birth || null,
            phone: form.phone.trim() || null,
            address: form.address.trim() || null,
            preferred_foot: sport === "football" ? form.preferred_foot || null : undefined,
            role: sport === "cricket" ? form.role || null : undefined,
          }
        : {}),
      bio: form.bio.trim() || null,
      batting_style: sport === "cricket" ? form.batting_style.trim() || null : undefined,
      bowling_style: sport === "cricket" ? form.bowling_style.trim() || null : undefined,
      display_order: Number(form.display_order) || 0,
      is_active: form.is_active,
      status: form.status,
    };
    const res =
      editing === "new"
        ? await supabase.from("players").insert(payload).select("*").single()
        : await supabase.from("players").update(payload).eq("id", editing.id).select("*").single();
    setSaving(false);
    if (res.error) {
      setError(
        res.error.message.includes("approval")
          ? "প্রকাশ (Published) করতে Admin-এর অনুমোদন লাগবে — আপনার ভূমিকায় প্রকাশের অনুমতি নেই। Status 'Pending Approval' রেখে Save করুন।"
          : res.error.message,
      );
      return;
    }
    const saved = res.data as Player;
    setNotice(editing === "new" ? "প্লেয়ার যোগ হয়েছে।" : "প্লেয়ারের তথ্য সংরক্ষিত হয়েছে।");
    setEditing(editing === "new" ? saved : editing);
    await load();
  }

  async function toggleActive(player: Player) {
    if (!supabase) return;
    const { error: err } = await supabase.from("players").update({ is_active: !player.is_active }).eq("id", player.id);
    if (err) setError(err.message);
    else await load();
  }

  async function archiveToggle(player: Player) {
    if (!supabase) return;
    const { error: err } = await supabase
      .from("players")
      .update({ archived_at: player.archived_at ? null : new Date().toISOString() })
      .eq("id", player.id);
    if (err) setError(err.message);
    else {
      setNotice(player.archived_at ? "প্লেয়ার আর্কাইভ থেকে ফিরিয়ে আনা হয়েছে।" : "প্লেয়ার আর্কাইভ করা হয়েছে — সব রেকর্ড সংরক্ষিত আছে।");
      await load();
    }
  }

  // Delete flow (spec §K): the performance guard runs first (a player
  // with linked match performances can never be deleted — archive is
  // offered instead); only then does the in-page confirmation dialog
  // open. The actual delete happens in confirmDeletePlayer, after an
  // explicit confirmation click. Admin-only: the button is not
  // rendered for other roles, and the players DELETE policy
  // (is_admin) is the real boundary in the database.
  async function deletePlayer(player: Player) {
    if (!supabase) return;
    const { count } = await supabase
      .from("match_performances")
      .select("id", { count: "exact", head: true })
      .eq("player_id", player.id);
    if ((count ?? 0) > 0) {
      setError(
        `এই প্লেয়ারের সঙ্গে ${count}টি ম্যাচ পারফরম্যান্স রেকর্ড যুক্ত আছে — স্থায়ীভাবে Delete করা যাবে না। ইতিহাস রক্ষা করতে Archive ব্যবহার করুন।`,
      );
      return;
    }
    setConfirmDelete(player);
  }

  async function confirmDeletePlayer() {
    if (!supabase || !confirmDelete) return;
    const player = confirmDelete;
    setConfirmDelete(null);
    const { error: err } = await supabase.from("players").delete().eq("id", player.id);
    if (err) setError(err.message);
    else {
      setNotice("প্লেয়ার মুছে ফেলা হয়েছে।");
      await load();
    }
  }

  // Read-only details panel (spec §G): reuses the same stored/computed
  // season queries as the editor — no new fields or calculations.
  async function openDetails(player: Player) {
    setError(null);
    setNotice(null);
    setEditing(null);
    setSeasons([]);
    setComputedSeasons([]);
    setCkSeasons([]);
    setCkComputed([]);
    setPerfCount(0);
    setDetails(player);
    if (!supabase) return;
    if (sport === "cricket") {
      const [stored, computed, perf] = await Promise.all([
        supabase.from("cricket_player_stats").select("*").eq("player_id", player.id),
        supabase.from("cricket_season_stats").select("season, matches, runs, wickets").eq("player_id", player.id),
        supabase.from("match_performances").select("id", { count: "exact", head: true }).eq("player_id", player.id),
      ]);
      setCkSeasons(
        ((stored.data ?? []) as (CkSeasonRow & { best_bowling: string | null })[]).map((r) => ({
          ...r,
          best_bowling: r.best_bowling ?? "",
        })),
      );
      setCkComputed((computed.data ?? []) as { season: string; matches: number; runs: number; wickets: number }[]);
      setPerfCount(perf.count ?? 0);
    }
    if (sport === "football") {
      const [stored, computed, perf] = await Promise.all([
        supabase.from("football_player_stats").select("*").eq("player_id", player.id),
        supabase.from("football_season_stats").select("*").eq("player_id", player.id),
        supabase.from("match_performances").select("id", { count: "exact", head: true }).eq("player_id", player.id),
      ]);
      setSeasons(((stored.data ?? []) as SeasonRow[]).map(({ season, matches, goals, assists, yellow_cards, red_cards }) => ({ season, matches, goals, assists, yellow_cards, red_cards })));
      setComputedSeasons(((computed.data ?? []) as SeasonRow[]).map(({ season, matches, goals, assists, yellow_cards, red_cards }) => ({ season, matches, goals, assists, yellow_cards, red_cards })));
      setPerfCount(perf.count ?? 0);
    }
  }

  if (!isSupabaseConfigured) {
    return (
      <div>
        <h1 className="text-xl font-bold text-brand-dark">প্লেয়ার ব্যবস্থাপনা</h1>
        <div className="mt-4 rounded-xl border border-gold/50 bg-gold/10 p-4 text-sm leading-relaxed text-neutral-700">
          Supabase এখনো সংযুক্ত হয়নি, তাই প্লেয়ার পরিচালনার আসল ডেটা এখানে দেখানো যাচ্ছে না — কোনো
          Demo প্লেয়ার দেখানো হয়নি। Supabase Project তৈরি করে Migration 0001–0007 চালালেই এই পেজ
          থেকে প্লেয়ার যোগ, সম্পাদনা, Draft/Pending/Published অনুমোদন, Active/Inactive, মৌসুমভিত্তিক
          পরিসংখ্যান, ছবি আপলোড (Storage: player-photos) ও Archive পরিচালনা করা যাবে। প্রকাশের
          অনুমোদন Database-এর Trigger দিয়ে যাচাই হয় (শুধু Admin প্রকাশ করতে পারবেন)।
        </div>
      </div>
    );
  }

  const isAdminRole = profile?.role === "admin";
  // Content roles (admin / editor) may write; finance
  // managers and viewers are read-only here. The UI follows the same
  // matrix as the RLS policies — the database remains the boundary.
  const canEdit =
    profile?.role === "admin" ||
    profile?.role === "editor";
  const editingPlayer: Player | null = editing !== null && editing !== "new" ? editing : null;

  const formatCreated = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? "—"
      : new Intl.DateTimeFormat("bn-BD", { day: "numeric", month: "short", year: "numeric" }).format(d);
  };

  const statusBadge = (p: Player) => (
    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${p.status === "published" ? "bg-brand text-white" : p.status === "pending" ? "bg-gold/30 text-brand-dark" : "bg-neutral-200 text-neutral-600"}`}>
      {STATUS_LABEL[p.status ?? "draft"]}
    </span>
  );

  const stateBadge = (p: Player) =>
    p.archived_at ? (
      <span className="inline-block rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Archived</span>
    ) : (
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => void toggleActive(p)}
        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${p.is_active ? "bg-brand-light text-brand-dark" : "bg-red-100 text-red-700"} ${canEdit ? "" : "cursor-default"}`}
        title={canEdit ? "Active/Inactive বদলাতে চাপুন" : undefined}
      >
        {p.is_active ? "Active" : "Inactive"}
      </button>
    );

  const rowActions = (p: Player) => (
    <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
      <button type="button" onClick={() => void openDetails(p)} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-brand-dark hover:border-brand">বিস্তারিত</button>
      <Link to={`/${sport}/player/${p.id}`} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-brand-dark hover:border-brand">Public</Link>
      {canEdit && (
        <button type="button" onClick={() => { setDetails(null); void openEditor(p); }} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-brand-dark hover:border-brand">সম্পাদনা</button>
      )}
      {canEdit && (
        <button type="button" onClick={() => void archiveToggle(p)} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-brand-dark hover:border-brand">
          {p.archived_at ? "Restore" : "Archive"}
        </button>
      )}
      {isAdminRole && (
        <button type="button" onClick={() => void deletePlayer(p)} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-red-600 hover:border-red-400">Delete</button>
      )}
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-brand-dark">প্লেয়ার ব্যবস্থাপনা</h1>
          <p className="mt-1 text-sm text-neutral-500">
            {sport === "football" ? "ফুটবল" : "ক্রিকেট"} টিমের প্লেয়ারদের তথ্য পরিচালনা করুন।
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => void openEditor("new")}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
          >
            + নতুন প্লেয়ার যোগ করুন
          </button>
        )}
      </div>
      {!isAdminRole && canEdit && (
        <p className="mt-2 text-xs font-medium text-amber-700">
          আপনার ভূমিকা: {profile?.role ?? "—"}। প্লেয়ার Published করতে Admin অনুমোদন লাগবে (Database Trigger দিয়ে যাচাই হয়)।
        </p>
      )}
      {!canEdit && (
        <p className="mt-2 text-xs font-medium text-amber-700">
          আপনার ভূমিকা ({profile?.role ?? "—"}) দিয়ে প্লেয়ার যোগ বা পরিবর্তন করা যায় না — আপনি শুধু তথ্য দেখতে পারবেন। (Database RLS দিয়েও একই নিয়ম কার্যকর।)
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-200 bg-white px-4 py-3">
        <p className="text-sm text-neutral-600">
          টিমের নাম ও লোগো <strong>টিম নিবন্ধন</strong> থেকে আসে; নিজের টিম ও মৌসুম <strong>Team Settings</strong>-এ।
        </p>
        <Link to={`/admin/team-settings?sport=${sport}`} className="rounded-lg border border-brand px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand hover:text-white">
          Team Settings খুলুন
        </Link>
      </div>

      {/* Player form (the entry table) — ABOVE the records list, on the owner's order (2026-11-02): the form on top, the existing players (history) below. */}
      {editing !== null && (
        <div ref={formRef} className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="font-bold text-brand-dark">{editing === "new" ? "নতুন প্লেয়ার" : "প্লেয়ার সম্পাদনা"}</h2>
          {/* Read-only sport line (owner's Step A order, 2026-11-03): the form's sport is fixed by the sidebar menu it was opened from — shown so a cricket player can never be given a football position by mistake. Deliberately NOT a switcher (the v126 no-in-page-sport-tabs rule stands). */}
          <p className="mt-3">
            <span className="inline-block rounded-full bg-brand-light px-3 py-1 text-xs font-semibold text-brand-dark">
              খেলা: {sport === "football" ? "ফুটবল" : "ক্রিকেট"}
            </span>
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="pf-name">নাম *</label>
              <input id="pf-name" className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            {/* Cricket (Step B): while migration 0051 is live the
                ভূমিকা select below replaces this field (role is
                the structured value; its English label is stored
                in position). Pre-0051 the field stays, so the form
                keeps working exactly as before. */}
            {(sport === "football" || !extrasSupported) && (
              <div>
                <label className={labelCls} htmlFor="pf-position">পজিশন *</label>
                <input id="pf-position" className={inputCls} list="position-options" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
                <datalist id="position-options">
                  {FOOTBALL_POSITIONS.map((g) => (
                    <option key={g.key} value={g.match[0][0].toUpperCase() + g.match[0].slice(1)} />
                  ))}
                  <option value="Batsman" />
                  <option value="Bowler" />
                  <option value="All-Rounder" />
                  <option value="Wicket Keeper" />
                </datalist>
              </div>
            )}
            <div>
              <label className={labelCls} htmlFor="pf-jersey">জার্সি নম্বর</label>
              <input id="pf-jersey" type="number" min="0" className={inputCls} value={form.jersey_no} onChange={(e) => setForm({ ...form, jersey_no: e.target.value })} />
            </div>
            <div>
              <label className={labelCls} htmlFor="pf-club">আগের ক্লাব (আগে কোন ক্লাবে খেলত)</label>
              <input id="pf-club" className={inputCls} placeholder="যেমন: তাড়াশ স্পোর্টিং ক্লাব" value={form.club} onChange={(e) => setForm({ ...form, club: e.target.value })} disabled={!clubSupported} />
              {!clubSupported && (
                <p className="mt-1 text-xs text-amber-700">
                  আগের ক্লাব ঘরটি চালু করতে Migration 0025 Live Apply করতে হবে — সেটি মালিকের আলাদা অনুমতিতে হবে।
                </p>
              )}
            </div>
            <div>
              <label className={labelCls} htmlFor="pf-team">টিম (আমাদের নিবন্ধিত টিম)</label>
              <select
                id="pf-team"
                className={inputCls}
                value={form.team_id}
                onChange={(e) => setForm({ ...form, team_id: e.target.value })}
                disabled={!teamSupported}
              >
                <option value="">— কোনো টিম নয় —</option>
                {formTeams.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}{tm.is_published ? "" : " (অপ্রকাশিত)"}
                  </option>
                ))}
              </select>
              {!teamSupported && (
                <p className="mt-1 text-xs text-amber-700">
                  টিম ঘরটি চালু করতে Migration 0046 Live Apply করতে হবে — সেটি মালিকের আলাদা অনুমতিতে হবে।
                </p>
              )}
              {teamSupported && formTeams.length === 0 && (
                <p className="mt-1 text-xs text-neutral-500">
                  এই খেলায় এখনো কোনো টিম তৈরি হয়নি — আগে "টিম-নিবন্ধন" পেজে টিম তৈরি করুন।
                </p>
              )}
            </div>
            {/* Migration 0051 extras (Step B): date of birth, phone
                and address for every player; পছন্দের পা for
                football, ভূমিকা for cricket. One fail-soft group —
                pre-0051 the fields stay disabled under one honest
                note and saves omit them. ফোন ও ঠিকানা শুধু
                Admin-এর জন্য — Public সাইটে কখনো দেখায় না। */}
            <div>
              <label className={labelCls} htmlFor="pf-dob">জন্মতারিখ</label>
              <input id="pf-dob" type="date" className={inputCls} value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} disabled={!extrasSupported} />
            </div>
            <div>
              <label className={labelCls} htmlFor="pf-phone">ফোন (শুধু Admin দেখবে)</label>
              <input id="pf-phone" className={inputCls} value={form.phone} maxLength={20} onChange={(e) => setForm({ ...form, phone: e.target.value })} disabled={!extrasSupported} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="pf-address">ঠিকানা (শুধু Admin দেখবে)</label>
              <input id="pf-address" className={inputCls} value={form.address} maxLength={300} onChange={(e) => setForm({ ...form, address: e.target.value })} disabled={!extrasSupported} />
            </div>
            {sport === "football" && (
              <div>
                <label className={labelCls} htmlFor="pf-foot">পছন্দের পা</label>
                <select id="pf-foot" className={inputCls} value={form.preferred_foot} onChange={(e) => setForm({ ...form, preferred_foot: e.target.value })} disabled={!extrasSupported}>
                  <option value="">—</option>
                  {PREFERRED_FOOT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.labelBn}</option>
                  ))}
                </select>
              </div>
            )}
            {sport === "cricket" && (
              <div>
                <label className={labelCls} htmlFor="pf-role">ভূমিকা *</label>
                <select id="pf-role" className={inputCls} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={!extrasSupported}>
                  <option value="">— বাছুন —</option>
                  {CRICKET_ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.labelBn}</option>
                  ))}
                </select>
              </div>
            )}
            {!extrasSupported && (
              <p className="text-xs text-amber-700 sm:col-span-2">
                জন্মতারিখ, ফোন, ঠিকানা, পছন্দের পা ও ভূমিকা ঘরগুলো চালু করতে Migration 0051 Live Apply করতে হবে — সেটি মালিকের আলাদা অনুমতিতে হবে।
              </p>
            )}
            {sport === "cricket" && (
              <>
                <div>
                  <label className={labelCls} htmlFor="pf-batting">ব্যাটিং ধরন</label>
                  <input id="pf-batting" className={inputCls} placeholder="যেমন: Right-hand bat" value={form.batting_style} onChange={(e) => setForm({ ...form, batting_style: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="pf-bowling">বোলিং ধরন</label>
                  <input id="pf-bowling" className={inputCls} placeholder="যেমন: Right-arm medium" value={form.bowling_style} onChange={(e) => setForm({ ...form, bowling_style: e.target.value })} />
                </div>
              </>
            )}
            <div>
              <label className={labelCls} htmlFor="pf-order">প্রদর্শনের ক্রম (Custom Order)</label>
              <input id="pf-order" type="number" className={inputCls} value={form.display_order} onChange={(e) => setForm({ ...form, display_order: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <PhotoUploadField
                label="ছবি"
                pathPrefix={sport}
                bucket="player-photos"
                sizeHint="800 × 1000 পিক্সেল (অনুপাত 4:5)"
                value={form.photo_url}
                onChange={(url) => setForm({ ...form, photo_url: url })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls} htmlFor="pf-bio">সংক্ষিপ্ত পরিচিতি ও প্রোফাইল বিবরণ</label>
              <textarea id="pf-bio" rows={4} className={inputCls} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} />
            </div>
            <div>
              <span className={labelCls}>প্রকাশের অবস্থা</span>
              <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600 ring-1 ring-neutral-200">
                {STATUS_LABEL[form.status]} — প্রকাশ/অপ্রকাশ এখন{" "}
                <Link to={`/admin/player-stats?sport=${sport}`} className="font-semibold text-brand hover:underline">
                  পরিসংখ্যান ও প্রকাশ
                </Link>{" "}
                পেজে পরিচালিত হয়।
              </p>
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm font-medium text-neutral-700" htmlFor="pf-active">
              <input id="pf-active" type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
              Active (সক্রিয় প্লেয়ার)
            </label>
          </div>

          {editingPlayer && (
            <div className="mt-6 rounded-xl border border-brand/25 bg-brand-light/60 p-4 text-sm leading-relaxed text-brand-dark">
              মৌসুমভিত্তিক পরিসংখ্যান এই ফর্মে আর সম্পাদনা করা যায় না — পরিসংখ্যান ও প্রকাশ এখন আলাদা
              পেজে:{" "}
              <Link to={`/admin/player-stats?sport=${sport}`} className="font-semibold text-brand hover:underline">
                ক্রীড়া প্রতিযোগিতা {sport === "football" ? "ফুটবল" : "ক্রিকেট"} পরিসংখ্যান ও প্রকাশ
              </Link>
              । উপরের বিস্তারিত অংশে সংরক্ষিত পরিসংখ্যান আগের মতোই দেখা যাবে।
            </div>
          )}

          {/* Dynamic profile sections (migration 0009 — Phase 2).
              Sections save independently of the player form: each
              section is its own row, written through the same RLS
              rules (content roles write, admins delete). */}
          {editingPlayer && (
            <div className="mt-6 border-t border-neutral-100 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-brand-dark">প্রোফাইল বিভাগ (Dynamic Sections)</h3>
                {canEdit && secEditing === null && (
                  <button type="button" onClick={() => openSectionEditor("new")} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark">
                    + নতুন বিভাগ যোগ করুন
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-neutral-500">প্রতিটি বিভাগ আলাদাভাবে Save হয়; বিভাগ দেখাবে প্লেয়ার Published থাকলে।</p>

              {sections.length === 0 && secEditing === null && (
                <p className="mt-3 rounded-lg border border-dashed border-neutral-300 px-3 py-4 text-center text-xs text-neutral-500">
                  এখনো কোনো বিভাগ যোগ করা হয়নি।
                </p>
              )}

              {sections.length > 0 && (
                <ul className="mt-3 divide-y divide-neutral-100 rounded-xl border border-neutral-100">
                  {sections.map((s, i) => (
                    <li key={s.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                      <span className="flex gap-1">
                        <button type="button" disabled={i === 0} onClick={() => void moveSection(s, -1)} className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs disabled:opacity-40" aria-label="উপরে নিন">↑</button>
                        <button type="button" disabled={i === sections.length - 1} onClick={() => void moveSection(s, 1)} className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs disabled:opacity-40" aria-label="নিচে নিন">↓</button>
                      </span>
                      <span className="min-w-32 flex-1">
                        <span className="block text-sm font-semibold text-brand-dark">{s.title}</span>
                        <span className="block text-[11px] text-neutral-400">{SECTION_TYPE_LABEL[s.section_type]} · আইটেম {(s.items ?? []).length}টি</span>
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.is_visible ? "bg-brand-light text-brand-dark" : "bg-red-100 text-red-700"}`}>
                        {s.is_visible ? "দৃশ্যমান" : "লুকানো"}
                      </span>
                      {canEdit && (
                        <span className="flex gap-1.5 text-xs font-semibold">
                          <button type="button" onClick={() => openSectionEditor(s)} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-brand-dark hover:border-brand">সম্পাদনা</button>
                          <button type="button" onClick={() => void toggleSectionVisible(s)} className="rounded-lg border border-neutral-300 px-2.5 py-1.5 text-brand-dark hover:border-brand">
                            {s.is_visible ? "লুকান" : "দেখান"}
                          </button>
                          {isAdminRole && (
                            <button type="button" onClick={() => setSecConfirmDelete(s)} className="rounded-lg border border-red-200 px-2.5 py-1.5 text-red-600 hover:border-red-400">Delete</button>
                          )}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {secEditing !== null && (
                <div className="mt-4 rounded-xl border border-brand/30 bg-brand-light/40 p-4">
                  <h4 className="text-sm font-bold text-brand-dark">{secEditing === "new" ? "নতুন বিভাগ" : "বিভাগ সম্পাদনা"}</h4>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelCls} htmlFor="sf-type">বিভাগের ধরন</label>
                      <select
                        id="sf-type"
                        className={inputCls}
                        disabled={secEditing !== "new"}
                        value={secForm.section_type}
                        onChange={(e) => setSecForm({ ...secForm, section_type: e.target.value as PlayerSectionType, items: [] })}
                      >
                        {(Object.keys(SECTION_TYPE_LABEL) as PlayerSectionType[]).map((t) => (
                          <option key={t} value={t}>{SECTION_TYPE_LABEL[t]}</option>
                        ))}
                      </select>
                      {secEditing !== "new" && <p className="mt-1 text-[11px] text-neutral-500">ধরন পরে বদলানো যায় না।</p>}
                    </div>
                    <div>
                      <label className={labelCls} htmlFor="sf-title">শিরোনাম *</label>
                      <input id="sf-title" className={inputCls} value={secForm.title} onChange={(e) => setSecForm({ ...secForm, title: e.target.value })} placeholder="যেমন: ব্যক্তিগত তথ্য" />
                    </div>
                    <label className="flex items-end gap-2 pb-1 text-sm font-medium text-neutral-700">
                      <input type="checkbox" checked={secForm.is_visible} onChange={(e) => setSecForm({ ...secForm, is_visible: e.target.checked })} />
                      Public পেজে দৃশ্যমান
                    </label>
                  </div>

                  {secForm.section_type === "text" && (
                    <div className="mt-3">
                      <label className={labelCls} htmlFor="sf-body">লেখা</label>
                      <textarea id="sf-body" rows={5} className={inputCls} value={secForm.body} onChange={(e) => setSecForm({ ...secForm, body: e.target.value })} />
                    </div>
                  )}

                  {secForm.section_type !== "text" && (
                    <div className="mt-3 space-y-2">
                      {secForm.section_type === "media" && (
                        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-200 bg-white px-3 py-2">
                          <input
                            type="file"
                            accept="image/*"
                            disabled={secUploading}
                            aria-label="গ্যালারির ছবি আপলোড"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) void uploadSectionMedia(file);
                              e.target.value = "";
                            }}
                            className="text-sm"
                          />
                          {secUploading && <span className="text-xs text-neutral-500">আপলোড হচ্ছে...</span>}
                          <span className="text-[11px] text-neutral-500">ছবি আপলোড করলে নিচের তালিকায় যোগ হবে (শুধু Image, সর্বোচ্চ 2 MB)। অথবা প্রতিটি আইটেমে Gallery থেকে ছবি বেছে নিন।</span>
                        </div>
                      )}
                      {secForm.items.map((item, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2">
                          {secForm.section_type === "media" && item.url && (
                            <img loading="lazy" src={item.url} alt="" className="h-10 w-10 rounded object-cover" />
                          )}
                          {secForm.section_type === "media" && (
                            <div className="min-w-52 flex-1">
                            </div>
                          )}
                          {(
                            secForm.section_type === "info_fields"
                              ? ([["label", "Label", "যেমন: উচ্চতা"], ["value", "মান", "মান লিখুন"]] as const)
                              : secForm.section_type === "achievements"
                                ? ([["year", "বছর", "2025"], ["title", "শিরোনাম", "অর্জনের নাম"], ["description", "বর্ণনা", "সংক্ষিপ্ত বর্ণনা"]] as const)
                                : secForm.section_type === "career"
                                  ? ([["period", "সময়কাল", "2023 — বর্তমান"], ["title", "টিম / ভূমিকা", "টিমের নাম"], ["description", "বর্ণনা", "সংক্ষিপ্ত বর্ণনা"]] as const)
                                  : secForm.section_type === "media"
                                    ? ([["caption", "ক্যাপশন", "ছবির বর্ণনা"]] as const)
                                    : ([["label", "Label", "যেমন: Facebook"], ["url", "URL", "https://..."]] as const)
                          ).map(([key, label, ph]) => (
                            <label key={key} className="min-w-28 flex-1 text-[11px] font-medium text-neutral-500">
                              {label}
                              <input
                                className="mt-0.5 w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                                placeholder={ph}
                                value={(item[key as keyof PlayerSectionItem] as string | undefined) ?? ""}
                                onChange={(e) =>
                                  setSecForm((f) => ({
                                    ...f,
                                    items: f.items.map((it, j) => (j === i ? { ...it, [key]: e.target.value } : it)),
                                  }))
                                }
                              />
                            </label>
                          ))}
                          <button
                            type="button"
                            onClick={() => setSecForm((f) => ({ ...f, items: f.items.filter((_, j) => j !== i) }))}
                            className="mt-3 text-xs font-semibold text-red-600"
                          >
                            সরান
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setSecForm((f) => ({ ...f, items: [...f.items, {}] }))}
                        className="text-xs font-semibold text-brand"
                      >
                        + আইটেম যোগ করুন
                      </button>
                    </div>
                  )}

                  <div className="mt-4 flex gap-2">
                    <button type="button" disabled={secSaving} onClick={() => void saveSection()} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
                      {secSaving ? "সংরক্ষণ হচ্ছে..." : "বিভাগ Save করুন"}
                    </button>
                    <button type="button" onClick={() => setSecEditing(null)} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-600">
                      বাতিল
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          {editing === "new" && (
            <p className="mt-4 text-xs text-neutral-500">প্লেয়ার Save করার পর বিভাগ যোগ করা যাবে।</p>
          )}

          <div className="mt-5 flex gap-2">
            <button type="button" disabled={saving} onClick={() => void savePlayer()} className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">
              {saving ? "সংরক্ষণ হচ্ছে..." : "Save"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-neutral-300 px-5 py-2 text-sm font-semibold text-neutral-600">
              বন্ধ করুন
            </button>
          </div>
        </div>
      )}

      {/* Summary cards — computed from the loaded rows of this sport */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { n: summary.total, t: "মোট প্লেয়ার (এই টিম)" },
          { n: summary.active, t: "সক্রিয় প্লেয়ার" },
          { n: summary.published, t: "প্রকাশিত প্রোফাইল" },
          { n: summary.archived, t: "আর্কাইভ করা" },
        ].map((c) => (
          <div key={c.t} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-brand-dark">{c.n.toLocaleString("bn-BD")}</p>
            <p className="mt-0.5 text-xs text-neutral-500">{c.t}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="নাম বা জার্সি নম্বর দিয়ে খুঁজুন..."
          className="min-w-52 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <select value={positionFilter} onChange={(e) => setPositionFilter(e.target.value)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" aria-label="পজিশন ফিল্টার">
          <option value="all">সব পজিশন</option>
          {positions.map((pos) => (
            <option key={pos} value={pos}>{pos}</option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as "all" | PlayerStatus)} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm" aria-label="প্রকাশনা অবস্থা ফিল্টার">
          <option value="all">সব অবস্থা</option>
          <option value="draft">Draft (খসড়া)</option>
          <option value="pending">Pending (অপেক্ষমাণ)</option>
          <option value="published">Published (প্রকাশিত)</option>
        </select>
        <label className="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-sm">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          আর্কাইভ করা প্লেয়ার
        </label>
        <button type="button" onClick={resetFilters} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-600 hover:border-brand hover:text-brand-dark">
          রিসেট
        </button>
      </div>

      {error && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
      {notice && <p className="mt-3 rounded-lg bg-brand-light px-3 py-2 text-sm font-medium text-brand-dark">{notice}</p>}
      {loading && <p className="mt-4 text-sm text-neutral-500">লোড হচ্ছে...</p>}

      {!loading && visible.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-neutral-300 px-4 py-8 text-center text-sm text-neutral-500">
          {showArchived ? "কোনো আর্কাইভ করা প্লেয়ার নেই।" : "কোনো প্লেয়ার পাওয়া যায়নি।"}
        </p>
      )}

      {/* Desktop table */}
      <div className="mt-4 hidden overflow-x-auto rounded-2xl border border-neutral-200 bg-white shadow-sm md:block">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-left text-xs text-neutral-500">
              <th className="px-4 py-3 font-semibold">প্লেয়ার</th>
              <th className="px-3 py-3 font-semibold">জার্সি</th>
              <th className="px-3 py-3 font-semibold">পজিশন</th>
              <th className="px-3 py-3 font-semibold">প্রকাশনা</th>
              <th className="px-3 py-3 font-semibold">অবস্থা</th>
              <th className="px-3 py-3 font-semibold">তৈরি</th>
              <th className="px-3 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {visible.map((p) => (
              <tr key={p.id} className="align-middle">
                <td className="px-4 py-3">
                  <span className="flex items-center gap-3">
                    {p.photo_url ? (
                      <img loading="lazy" src={p.photo_url} alt="" className="h-10 w-10 rounded-lg object-cover" />
                    ) : (
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-light font-bold text-brand">{p.name.charAt(0)}</span>
                    )}
                    <span>
                      <span className="block font-semibold text-brand-dark">{p.name}</span>
                      <span className="block text-xs text-neutral-400">ক্রম {p.display_order}</span>
                    </span>
                  </span>
                </td>
                <td className="px-3 py-3">{p.jersey_no !== null ? `#${p.jersey_no}` : "—"}</td>
                <td className="px-3 py-3">{p.position}</td>
                <td className="px-3 py-3">{statusBadge(p)}</td>
                <td className="px-3 py-3">{stateBadge(p)}</td>
                <td className="px-3 py-3 text-xs text-neutral-500">{formatCreated(p.created_at)}</td>
                <td className="px-3 py-3">{rowActions(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <ul className="mt-4 space-y-3 md:hidden">
        {visible.map((p) => (
          <li key={p.id} className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              {p.photo_url ? (
                <img loading="lazy" src={p.photo_url} alt="" className="h-11 w-11 rounded-lg object-cover" />
              ) : (
                <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand-light font-bold text-brand">{p.name.charAt(0)}</span>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-brand-dark">{p.name}</p>
                <p className="text-xs text-neutral-500">
                  {p.position}
                  {p.jersey_no !== null && ` · #${p.jersey_no}`}
                  {p.club && ` · আগের ক্লাব: ${p.club}`} · তৈরি: {formatCreated(p.created_at)}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {statusBadge(p)}
              {stateBadge(p)}
            </div>
            <div className="mt-3">{rowActions(p)}</div>
          </li>
        ))}
      </ul>

      {/* Read-only details panel (spec §G) — existing data only */}
      {details && (
        <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {details.photo_url ? (
                <img loading="lazy" src={details.photo_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-brand-light text-lg font-bold text-brand">{details.name.charAt(0)}</span>
              )}
              <div>
                <h2 className="font-bold text-brand-dark">{details.name}</h2>
                <p className="text-xs text-neutral-500">
                  {sport === "football" ? "ফুটবল" : "ক্রিকেট"} · {details.position}
                  {details.jersey_no !== null && ` · জার্সি #${details.jersey_no}`}
                  {details.club && ` · আগের ক্লাব: ${details.club}`}
                </p>
              </div>
            </div>
            <button type="button" onClick={() => setDetails(null)} className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-neutral-600">
              বন্ধ করুন
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {statusBadge(details)}
            {details.archived_at ? (
              <span className="inline-block rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">Archived</span>
            ) : (
              <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold ${details.is_active ? "bg-brand-light text-brand-dark" : "bg-red-100 text-red-700"}`}>
                {details.is_active ? "Active" : "Inactive"}
              </span>
            )}
          </div>
          {details.bio && <p className="mt-3 text-sm leading-relaxed text-neutral-600">{details.bio}</p>}
          {sport === "cricket" && (details.batting_style || details.bowling_style) && (
            <p className="mt-2 text-sm text-neutral-600">
              {details.batting_style && <>ব্যাটিং: {details.batting_style} </>}
              {details.bowling_style && <>· বোলিং: {details.bowling_style}</>}
            </p>
          )}
          <div className="mt-4 text-sm text-neutral-600">
            {sport === "football" && (
              computedSeasons.length > 0 || seasons.length > 0 ? (
                <ul className="space-y-1">
                  {[...computedSeasons, ...seasons.filter((s) => !computedSeasons.some((c) => c.season === s.season))].map((s) => (
                    <li key={s.season}>
                      মৌসুম {s.season}: {s.matches} ম্যাচ · {s.goals} গোল · {s.assists} অ্যাসিস্ট · হলুদ {s.yellow_cards} · লাল {s.red_cards}
                      {computedSeasons.some((c) => c.season === s.season) && " (পারফরম্যান্স থেকে গণনা করা)"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-neutral-500">কোনো মৌসুমের পরিসংখ্যান এখনো নেই।</p>
              )
            )}
            {sport === "cricket" && (
              ckComputed.length > 0 || ckSeasons.length > 0 ? (
                <ul className="space-y-1">
                  {[...ckComputed, ...ckSeasons.filter((s) => !ckComputed.some((c) => c.season === s.season)).map((s) => ({ season: s.season, matches: s.matches, runs: s.runs, wickets: s.wickets }))].map((s) => (
                    <li key={s.season}>
                      মৌসুম {s.season}: {s.matches} ম্যাচ · {s.runs} রান · {s.wickets} উইকেট
                      {ckComputed.some((c) => c.season === s.season) && " (পারফরম্যান্স থেকে গণনা করা)"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-neutral-500">কোনো মৌসুমের পরিসংখ্যান এখনো নেই।</p>
              )
            )}
            <p className="mt-2 text-xs text-neutral-500">
              সংযুক্ত ম্যাচ পারফরম্যান্স রেকর্ড: {perfCount}টি · তৈরি: {formatCreated(details.created_at)} ·{" "}
              <Link to={`/${sport}/player/${details.id}`} className="font-semibold text-brand">Public Profile দেখুন</Link>
            </p>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog (spec §K) */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Delete নিশ্চিতকরণ">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="font-bold text-red-700">স্থায়ীভাবে মুছে ফেলবেন?</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              "{confirmDelete.name}" স্থায়ীভাবে মুছে যাবে। এই প্লেয়ারের সঙ্গে কোনো ম্যাচ পারফরম্যান্স
              রেকর্ড যুক্ত নেই (যুক্ত থাকলে Delete আটকানো হয়)। ইতিহাস রক্ষা করতে চাইলে Delete-এর বদলে
              Archive ব্যবহার করুন।
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => void confirmDeletePlayer()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
                হ্যাঁ, মুছে ফেলুন
              </button>
              <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-600">
                না, থাক
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Section delete confirmation (Phase 2, admin-only action) */}
      {secConfirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="বিভাগ Delete নিশ্চিতকরণ">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <h2 className="font-bold text-red-700">বিভাগটি মুছে ফেলবেন?</h2>
            <p className="mt-2 text-sm leading-relaxed text-neutral-600">
              "{secConfirmDelete.title}" ({SECTION_TYPE_LABEL[secConfirmDelete.section_type]}) বিভাগটি ও এর সব
              আইটেম স্থায়ীভাবে মুছে যাবে। প্লেয়ারের মৌলিক তথ্য ও পরিসংখ্যান অপরিবর্তিত থাকবে।
            </p>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => void confirmDeleteSection()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700">
                হ্যাঁ, মুছে ফেলুন
              </button>
              <button type="button" onClick={() => setSecConfirmDelete(null)} className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-600">
                না, থাক
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
