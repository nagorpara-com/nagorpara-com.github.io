/**
 * Shared domain types (Phase 2 foundation).
 *
 * These mirror the planned Supabase schema in
 * `supabase/migrations/0001_init_schema.sql`. When the real Supabase
 * project is connected, this file can be replaced by the generated types:
 *   npx supabase gen types typescript --project-id <id>
 *
 * No sample/placeholder organization data lives here — types only.
 */

export type Sport = "football" | "cricket";

export type UserRole =
  | "admin"
  | "finance_manager"
  | "editor"
  | "viewer";

export interface Profile {
  id: string; // = Supabase auth user id
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
  created_at: string;
}

export interface SiteSettings {
  id: number;
  org_name_bn: string;
  org_name_en: string | null;
  tagline: string | null;
  logo_url: string | null;
  established_year: number | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  facebook_url: string | null;
  youtube_url: string | null;
  updated_at: string;
}

/** A team listed in the Teams system (migration 0043) — the
 * opponents (and any other team) managed at Admin টিম-নিবন্ধন.
 * The organization's OWN teams keep living in site_settings. */
export interface Team {
  id: string;
  sport: Sport;
  name: string;
  logo_url: string | null;
  is_published: boolean;
  display_order: number;
  created_at: string;
  /** Added by migration 0047 (whose name the team is registered
   * under — the team's responsible person); optional so
   * pre-0047 rows still type-check. */
  registered_by_name?: string | null;
  /** Added by migration 0050 (Step B team extras); optional so
   * pre-0050 rows still type-check. */
  short_name?: string | null;
  established_date?: string | null;
  captain_name?: string | null;
  coach_name?: string | null;
  jersey_color?: string | null;
  jersey_color_hex?: string | null;
  phone?: string | null;
  /** Added by migration 0055 (per-sport group code) —
   * SUPERSEDED by the tournament Team ID of migration 0056;
   * the column stays dormant and is no longer read or written. */
  team_code?: string | null;
}

/** Publishing workflow (migration 0004): draft pending published. */
export type PlayerStatus = "draft" | "pending" | "published";

export interface Player {
  id: string;
  sport: Sport;
  name: string;
  photo_url: string | null;
  jersey_no: number | null;
  position: string;
  bio: string | null;
  /** Added by migration 0025 (the club the player plays for);
   * optional so pre-0025 rows still type-check. */
  club?: string | null;
  /** Added by migration 0046 (the registered team, public.teams,
   * this player belongs to — chosen in the player form's টিম
   * dropdown); optional so pre-0046 rows still type-check. */
  team_id?: string | null;
  /** Added by migration 0051 (Step B player extras); optional so
   * pre-0051 rows still type-check. phone and address are
   * ADMIN ONLY — public queries never select them. */
  date_of_birth?: string | null;
  phone?: string | null;
  address?: string | null;
  preferred_foot?: string | null;
  role?: string | null;
  /** Added by migration 0005 (cricket playing styles). */
  batting_style?: string | null;
  bowling_style?: string | null;
  is_active: boolean;
  display_order: number;
  /** Added by migration 0004; optional so pre-0004 rows still type-check. */
  status?: PlayerStatus;
  archived_at?: string | null;
  created_at: string;
}

/**
 * Dynamic profile sections — migration 0009 (draft, not yet applied).
 * One row per extra section on a player profile. Sections have no
 * publish state of their own: the database only exposes a section
 * publicly while it is visible AND its player is published, active
 * and unarchived. `items` holds the section's structured entries;
 * which fields are used depends on `section_type` (see the optional
 * members of PlayerSectionItem).
 */
export type PlayerSectionType =
  | "text"
  | "info_fields"
  | "achievements"
  | "career"
  | "media"
  | "links";

export interface PlayerSectionItem {
  /** info_fields, links */
  label?: string;
  /** info_fields */
  value?: string;
  /** achievements, career */
  title?: string;
  /** achievements */
  year?: string;
  /** career */
  period?: string;
  /** achievements, career */
  description?: string;
  /** media, links */
  url?: string;
  /** media */
  caption?: string;
}

export interface PlayerProfileSection {
  id: string;
  player_id: string;
  section_type: PlayerSectionType;
  title: string;
  /** Free text for section_type "text"; null otherwise. */
  body: string | null;
  items: PlayerSectionItem[];
  display_order: number;
  is_visible: boolean;
  created_at: string;
  updated_at: string;
}

/** Matches & tournaments — migration 0001 (+ performance fields in 0004/0005,
 *  tournament management fields in 0044). */
export type MatchStatus =
  | "upcoming"
  | "live"
  | "completed"
  | "postponed"
  | "rescheduled"
  | "abandoned";
export type TournamentStatus = "upcoming" | "ongoing" | "completed";
export type TournamentFormat = "league" | "knockout" | "group_knockout";

export interface Tournament {
  id: string;
  name: string;
  sport: Sport;
  season: string | null;
  status: TournamentStatus;
  is_published: boolean;
  created_at: string;
  // Migration 0044 — optional in the type because reads made before
  // 0044 is applied live simply do not carry these keys.
  banner_url?: string | null;
  organizer?: string | null;
  director?: string | null;
  venue?: string | null;
  description?: string | null;
  format?: TournamentFormat | null;
  team_count?: number | null;
  points_win?: number;
  points_draw?: number;
  points_loss?: number;
  champion_team_id?: string | null;
  // Step C revision of 0044 (2026-11-03) — same optionality rule.
  start_date?: string | null;
  end_date?: string | null;
  director_phone?: string | null;
  squad_size?: number | null;
  match_minutes?: number | null;
  cricket_overs?: number | null;
  ball_type?: string | null;
  runner_up_team_id?: string | null;
}

/** One registered team of a tournament (migration 0044). */
export interface TournamentTeam {
  id: string;
  tournament_id: string;
  team_id: string;
  seed: number;
  created_at: string;
  /** Added by migration 0056 (the team's Team ID in THIS
   * tournament, e.g. A1); optional so pre-0056 rows still
   * type-check. Supersedes the per-sport model of 0055. */
  team_code?: string | null;
}

export interface Match {
  id: string;
  sport: Sport;
  tournament_id: string | null;
  opponent: string;
  match_date: string | null;
  venue: string | null;
  /** Scores are free text (e.g. "2", or cricket "245/8 (50 ov)"). */
  our_score: string | null;
  opponent_score: string | null;
  result: string | null;
  status: MatchStatus;
  is_published: boolean;
  created_at: string;
  // Migration 0044 — when team_a_id/team_b_id are set, our_score is
  // team A's score and opponent_score is team B's score; opponent
  // keeps holding team B's name for legacy displays. Optional in
  // the type for the same pre-0044 reason as Tournament above.
  team_a_id?: string | null;
  team_b_id?: string | null;
  match_no?: number | null;
  round?: string | null;
  winner_team_id?: string | null;
  is_draw?: boolean;
  tiebreaker_note?: string | null;
  /** Optional match banner image URL (0044, Phase A). */
  banner_url?: string | null;
  // Step C revision of 0044 (2026-11-03) — same optionality rule.
  referee_name?: string | null;
  toss_winner_team_id?: string | null;
  toss_decision?: "bat" | "field" | null;
  /** Balls faced by team A / team B (cricket; overs are converted
   *  to balls on save — see utils/tournament.ts). */
  team_a_balls?: number | null;
  team_b_balls?: number | null;
  team_a_wickets?: number | null;
  team_b_wickets?: number | null;
  shootout_a?: number | null;
  shootout_b?: number | null;
  player_of_match_id?: string | null;
}

/** One player's record in one match — unique (match_id, player_id). */
export interface MatchPerformance {
  id: string;
  match_id: string;
  player_id: string;
  // Football (0001 + cards in 0004)
  goals: number;
  assists: number;
  yellow_cards: number;
  red_cards: number;
  // Cricket (0001 + detailed fields in 0005)
  runs: number;
  wickets: number;
  catches: number;
  balls_faced: number;
  fours: number;
  sixes: number;
  not_out: boolean;
  balls_bowled: number;
  runs_conceded: number;
  maidens: number;
  stumpings: number;
  run_outs: number;
  note: string | null;
  // Step C revision of 0044 (2026-11-03) — optional because rows
  // read before 0044 is live do not carry these keys.
  appearance?: "starter" | "substitute" | "unused" | null;
  own_goals?: number;
  penalty_goals?: number;
  penalty_missed?: number;
  saves?: number;
  dismissal_type?:
    | "bowled"
    | "caught"
    | "lbw"
    | "run_out"
    | "stumped"
    | "hit_wicket"
    | "retired"
    | "not_out"
    | null;
  dismissed_by_id?: string | null;
  batting_order?: number | null;
  wides?: number;
  no_balls?: number;
}

/** One timeline event of a match (migration 0052, Step D). */
export type MatchEventType =
  | "goal"
  | "penalty_goal"
  | "own_goal"
  | "penalty_missed"
  | "yellow_card"
  | "red_card"
  | "substitution"
  | "wicket";

export interface MatchEvent {
  id: string;
  match_id: string;
  /** The team the event belongs to; null = unattributed. */
  team_id: string | null;
  player_id: string | null;
  /** Second player of an event (e.g. the substitute coming on). */
  related_player_id: string | null;
  event_type: MatchEventType;
  /** Football clock minute; cricket events carry over_text. */
  minute: number | null;
  over_text: string | null;
  detail: string | null;
  display_order: number;
  created_at: string;
}

/** Finance — see the verified balance rules in supabase/README.md. */
export type FinanceTransactionType =
  | "income"
  | "subscription"
  | "donation"
  | "expense"
  | "withdrawal"
  | "transfer";

export interface FinanceTransaction {
  id: string;
  type: FinanceTransactionType;
  category: string | null;
  amount: number; // BDT, positive; direction comes from `type`
  txn_date: string;
  member_id: string | null;
  donor_name: string | null;
  description: string | null;
  receipt_url: string | null; // private bucket — never public
  is_public: boolean;
  created_by: string;
  created_at: string;
}

/**
 * A public contact-form submission (table `contact_messages`).
 * Written by anonymous visitors (INSERT-only policy); readable,
 * updatable and deletable ONLY by the Admin (is_admin() policies).
 *
 * `subject` is a real column since migration 0013 (applied
 * 2026-10-23), limited to 120 characters by a CHECK constraint;
 * the form writes it directly. Display code resolves subject vs
 * legacy bridged messages via src/utils/contactMessage.ts.
 */
export interface ContactMessage {
  id: string;
  name: string;
  phone: string | null;
  subject: string | null;
  message: string;
  is_read: boolean;
  created_at: string;
}

/**
 * An email subscriber (table `email_subscribers`, migration
 * draft 0014 — table NOT yet live). Written ONLY by the
 * server-side subscribe function (no anon/authenticated INSERT
 * exists); readable/updatable in the panel ONLY by the Admin
 * (is_admin() policies). Statuses: pending (awaiting the
 * verification click), verified (may receive announcements),
 * unsubscribed (receives nothing; row kept as consent record).
 */
export interface EmailSubscriber {
  id: string;
  email: string;
  status: "pending" | "verified" | "unsubscribed";
  verification_token_hash: string | null;
  verification_expires_at: string | null;
  verification_sent_count: number;
  last_verification_sent_at: string | null;
  consent_at: string;
  verified_at: string | null;
  unsubscribed_at: string | null;
  source: "website" | "admin";
  created_at: string;
}

/**
 * One row of public.notice_deliveries (Migration 0015, Phase C /
 * C3 Step D). The per-recipient delivery log for a notice email:
 * written ONLY by the server-side send-announcement function;
 * the Admin Panel reads it (Admin role, SELECT only at the
 * database level). `status: "sent"` means Gmail accepted the
 * message — never that it reached the inbox. A "failed" row whose
 * error starts with "OUTCOME_UNKNOWN:" is UNCERTAIN: the previous
 * attempt was interrupted and the email may already have been
 * delivered; retrying it can duplicate (see the admin panel
 * warning). Keep the prefix in sync with
 * supabase/functions/_shared/announcement.ts.
 */
export interface NoticeDelivery {
  id: string;
  post_id: string;
  recipient_kind: "subscriber" | "member";
  recipient_email: string;
  status: "pending" | "sending" | "sent" | "failed";
  provider_message_id: string | null;
  error: string | null;
  attempts: number;
  last_attempt_at: string | null;
  sent_at: string | null;
  created_at: string;
}

/**
 * One row of public.news_posts (Phase C / C3). The same table carries
 * news, activities and notices — `type` separates them; there is no
 * separate notice table. Draft vs published is `is_published` only.
 */
export type NewsPostType = "news" | "activity" | "notice";

export interface NewsPost {
  id: string;
  type: NewsPostType;
  title: string;
  slug: string;
  content: string | null;
  cover_image_url: string | null;
  is_published: boolean;
  published_at: string | null;
  created_by: string | null;
  created_at: string;
  /** Notice kind (migration 0027): info | offer | update. */
  notice_category: NoticeCategory;
  /** Optional call-to-action (migration 0027): both or neither. */
  button_text: string | null;
  button_url: string | null;
}

/** Notice category (migration 0027). */
export type NoticeCategory = "info" | "offer" | "update";

/**
 * One row of public.members (migration 0001) — the organization's
 * member registry. The phone is private by default: it reaches
 * the public site only through the `members_public` view and
 * only when `is_phone_public` is true. Writes are admin-only
 * (policy "members: admin writes", is_admin()).
 */
export interface Member {
  id: string;
  name: string;
  photo_url: string | null;
  phone: string | null;
  /** Admin-entered Facebook profile link (migration 0030);
   *  absent on rows read before that migration applies. */
  facebook_url?: string | null;
  is_phone_public: boolean;
  address: string | null;
  joined_date: string | null;
  is_active: boolean;
  display_order: number;
  created_at: string;
}

/** One row of public.members_page_banners (migration 0032): a
 *  banner photo for the Members & Committee page. The Admin Panel
 *  keeps at most three rows; the public page rotates the published
 *  ones as a slider. The table exists only after migration 0032 is
 *  applied — until then every read treats it as empty. */
export interface MembersPageBanner {
  id: string;
  image_url: string;
  display_order: number;
  is_published: boolean;
  created_at: string;
}

/** One row of public.village_page_banners (migration 0057): a
 *  banner photo for the Village Profile page. The Admin Panel
 *  keeps at most three rows; the public page rotates the
 *  published ones as a slider, falling back to the single
 *  Settings banner photo when none are published. The table
 *  exists only after migration 0057 is applied — until then
 *  every read treats it as empty. */
export interface VillagePageBanner {
  id: string;
  image_url: string;
  display_order: number;
  is_published: boolean;
  created_at: string;
  /* Per-banner text (migration 0058 — heading / description /
   * CTA / visibility, shown over the banner's slide on the
   * public Village Profile page). Optional here because reads
   * step down to the 0057 column set until 0058 is live, so a
   * row may legitimately arrive without them. */
  heading?: string | null;
  description?: string | null;
  cta_text?: string | null;
  cta_link?: string | null;
  show_text?: boolean;
}

/** One row of public.home_page_banners (migration 0033): a
 *  banner photo for the homepage hero. The Admin Panel keeps at
 *  most three rows; the homepage rotates the published ones as
 *  a slider behind the hero headline. The table exists only
 *  after migration 0033 is applied — until then every read
 *  treats it as empty and the hero uses its fallback photo. */
export interface HomePageBanner {
  id: string;
  image_url: string;
  display_order: number;
  is_published: boolean;
  created_at: string;
}

/** Which block renders a village category on the public
 *  Village Profile page (migration 0054): text = village_sections
 *  articles, location = the অবস্থান tiles, places = গুরুত্বপূর্ণ
 *  স্থান articles, photos = the গ্রামের ছবি album block. Only
 *  'text' categories can be created or deleted from Admin. */
export type VillageCategoryKind = "text" | "location" | "places" | "photos";

/** One row of public.village_categories (migration 0054): a
 *  category of the Village Profile page — chip label, section
 *  heading, block kind, page order and published flag, managed
 *  from Admin ক্যাটাগরি পরিচালনা. The table exists only after
 *  migration 0054 is applied; until then the page and the Admin
 *  forms fall back to the built-in category list. */
export interface VillageCategory {
  id: string;
  key: string;
  label: string;
  title: string;
  kind: VillageCategoryKind;
  display_order: number;
  is_published: boolean;
  created_at: string;
}

/** One row of the public-safe `members_public` view (0010/0011):
 *  active members only; phone present only when the member's
 *  number is marked public; address is never exposed. */
export interface PublicMember {
  id: string;
  name: string;
  photo_url: string | null;
  phone: string | null;
  joined_date: string | null;
  display_order: number;
  /** Admin-entered message link (migration 0030); null until
   *  that migration applies — the public hook falls back to the
   *  pre-0030 view shape. */
  facebook_url: string | null;
}

/** One row of public.committee_terms (migration 0001). */
export interface CommitteeTerm {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  created_at: string;
}

/** One row of public.committee_members (migration 0001). */
export interface CommitteeMember {
  id: string;
  term_id: string;
  member_id: string | null;
  name: string;
  role_title: string;
  photo_url: string | null;
  phone: string | null;
  facebook_url: string | null;
  is_active: boolean;
  display_order: number;
}
