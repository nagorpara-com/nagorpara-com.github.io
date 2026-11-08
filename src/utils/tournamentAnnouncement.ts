import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { Sport } from "../types/database.types";
import { announcementAction, announcementErrorText } from "./announcement";
import { toBn } from "./format";
import { formatDateOnly, SPORT_LABELS_BN } from "./matchDisplay";
import { generateSlug, nextPublishPatch } from "./newsPost";

/**
 * Tournament announcement email (owner's tournament fixes,
 * 2026-11-03): when the Admin ticks "সাবস্ক্রাইবারদের ইমেইল
 * পাঠান" on the tournament form and saves the tournament as
 * published, the tournament is announced to every verified
 * subscriber through the EXISTING notice pipeline — nothing new
 * is invented here:
 *
 *   1. A news_posts row is created exactly the way the News
 *      admin creates one (same fields, slug from generateSlug,
 *      notice_category "info", both button fields set), as a
 *      draft, then published with the shared nextPublishPatch.
 *   2. Delivery goes through the send-announcement function via
 *      announcementAction("send", postId) — the server
 *      re-authorizes the Admin role, so a non-admin's attempt
 *      comes back as an error and is surfaced as-is.
 *
 * The button URL mirrors what the News form stores: an absolute
 * http(s) URL (the database CHECK and the email builder both
 * require that form). It points at this site's tournaments page,
 * built from the address the Admin is actually using.
 *
 * A failure here NEVER undoes or blocks the tournament save —
 * the caller appends the returned line to the save's own
 * success message.
 */

export interface TournamentAnnouncementInput {
  name: string;
  sport: Sport;
  season: string | null;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  venue: string | null;
  banner_url: string | null;
  createdBy: string | null;
}

export interface TournamentAnnouncementResult {
  ok: boolean;
  /** One Bengali line for the form's success/warning area. */
  text: string;
}

function announcementContent(input: TournamentAnnouncementInput): string {
  const description = input.description?.trim();
  if (description) return description;
  const bits: string[] = [`${SPORT_LABELS_BN[input.sport]} টুর্নামেন্ট`];
  if (input.season?.trim()) bits.push(`মৌসুম ${input.season.trim()}`);
  if (input.start_date && input.end_date) {
    bits.push(`${formatDateOnly(input.start_date)} – ${formatDateOnly(input.end_date)}`);
  } else if (input.start_date) {
    bits.push(`শুরু: ${formatDateOnly(input.start_date)}`);
  }
  if (input.venue?.trim()) bits.push(`মাঠ: ${input.venue.trim()}`);
  return `নতুন টুর্নামেন্ট ঘোষণা করা হয়েছে — ${bits.join(" · ")}। বিস্তারিত ও ম্যাচের সূচি ওয়েবসাইটের টুর্নামেন্ট পেজে দেখুন।`;
}

export async function sendTournamentAnnouncement(
  input: TournamentAnnouncementInput,
): Promise<TournamentAnnouncementResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { ok: false, text: "ইমেইল পাঠানো যায়নি — Supabase সংযুক্ত নয়।" };
  }
  const title = input.name.trim();
  const tournamentsUrl = `${window.location.origin}${window.location.pathname}#/tournaments`;
  const { data: inserted, error: insertError } = await supabase
    .from("news_posts")
    .insert({
      type: "notice",
      title,
      slug: generateSlug(title),
      content: announcementContent(input),
      cover_image_url: input.banner_url?.trim() || null,
      notice_category: "info",
      button_text: "টুর্নামেন্ট দেখুন",
      button_url: tournamentsUrl,
      is_published: false,
      published_at: null,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (insertError || !inserted) {
    return {
      ok: false,
      text: `ইমেইল পাঠানো যায়নি — নোটিশ তৈরি করা যায়নি (${insertError?.message ?? "অজানা ত্রুটি"})।`,
    };
  }
  const postId = (inserted as { id: string }).id;
  const patch = nextPublishPatch(
    { is_published: false, published_at: null },
    true,
    new Date().toISOString(),
  );
  const { data: updated, error: publishError } = await supabase
    .from("news_posts")
    .update(patch)
    .eq("id", postId)
    .select("id");
  if (publishError || !updated || updated.length === 0) {
    return {
      ok: false,
      text: "ইমেইল পাঠানো যায়নি — নোটিশটি প্রকাশ করা যায়নি।",
    };
  }
  const res = await announcementAction("send", postId);
  if (!res.ok) {
    return { ok: false, text: `ইমেইল পাঠানো যায়নি — ${announcementErrorText(res)}` };
  }
  return {
    ok: true,
    text: `সাবস্ক্রাইবারদের ইমেইল পাঠানো হয়েছে (${toBn(res.summary.sent)} জন)।`,
  };
}
