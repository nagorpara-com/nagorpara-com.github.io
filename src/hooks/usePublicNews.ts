import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { NewsPost, NewsPostType } from "../types/database.types";

/**
 * Public News & Notice reads (Phase C / C3). Only published posts are
 * ever requested — and the database policy ("public reads published")
 * enforces the same rule server-side, so a draft cannot leak even if
 * its slug is guessed: the detail query asks for the slug AND
 * is_published = true, and RLS would refuse the row either way.
 */
const PUBLIC_COLUMNS = "id, type, title, slug, content, cover_image_url, is_published, published_at, created_by, created_at, notice_category, button_text, button_url";

export function usePublicNews(typeFilter: "all" | NewsPostType) {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!isSupabaseConfigured || !supabase) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      let query = supabase
        .from("news_posts")
        .select(PUBLIC_COLUMNS)
        .eq("is_published", true)
        .order("published_at", { ascending: false });
      if (typeFilter !== "all") query = query.eq("type", typeFilter);
      const { data, error: err } = await query;
      if (cancelled) return;
      if (err) {
        setError("তালিকা লোড করা যায়নি — কিছুক্ষণ পর আবার চেষ্টা করুন।");
        setLoading(false);
        return;
      }
      setPosts((data ?? []) as NewsPost[]);
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [typeFilter]);

  return { posts, loading, error, isConfigured: isSupabaseConfigured };
}

export function usePublicNewsPost(slug: string | undefined) {  const [post, setPost] = useState<NewsPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!slug || !isSupabaseConfigured || !supabase) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      const { data, error: err } = await supabase
        .from("news_posts")
        .select(PUBLIC_COLUMNS)
        .eq("slug", slug)
        .eq("is_published", true)
        .maybeSingle();
      if (cancelled) return;
      if (err) {
        setError("পোস্টটি লোড করা যায়নি — কিছুক্ষণ পর আবার চেষ্টা করুন।");
        setLoading(false);
        return;
      }
      setPost((data as NewsPost | null) ?? null);
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { post, loading, error, isConfigured: isSupabaseConfigured };
}

/**
 * The single latest published notice, for the Announcement Bar
 * (Phase C / C3 Step 2). Same double protection as every public
 * read: the query asks for type='notice' AND is_published=true,
 * and the database policy would refuse anything else anyway.
 * Errors resolve to "no notice" — a failed bar must never break
 * the page it sits on.
 */
/**
 * Plain (non-hook) fetch of the latest published notice — the
 * single query definition shared by the hook below and the
 * Popup Coordinator's central feed/poller (Phase 5C), so the
 * bar, the bell and the popup can never disagree about which
 * notice is "the latest published" and no second polling loop
 * ever appears. Errors resolve to null, exactly as the hook
 * always behaved.
 */
export async function fetchLatestPublishedNotice(): Promise<NewsPost | null> {
  if (!isSupabaseConfigured || !supabase) return null;
  const { data, error: err } = await supabase
    .from("news_posts")
    .select(PUBLIC_COLUMNS)
    .eq("type", "notice")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (err || !data || typeof data !== "object" || Array.isArray(data)) return null;
  const row = data as NewsPost;
  return typeof row.id === "string" && typeof row.slug === "string" ? row : null;
}

/**
 * Plain fetch of every published notice (full public rows, newest
 * first, capped) — the Header bell panel's list. Same published-only
 * discipline and column set as every public read; fetched lazily
 * when the panel opens so no extra polling loop ever appears.
 */
export async function fetchPublishedNotices(limit = 20): Promise<NewsPost[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error: err } = await supabase
    .from("news_posts")
    .select(PUBLIC_COLUMNS)
    .eq("type", "notice")
    .eq("is_published", true)
    .order("published_at", { ascending: false })
    .limit(limit);
  if (err || !Array.isArray(data)) return [];
  return (data as NewsPost[]).filter(
    (row) => typeof row?.id === "string" && typeof row?.slug === "string",
  );
}

/** Plain fetch of every published notice id (see the hook below). */
export async function fetchPublishedNoticeIds(): Promise<string[]> {
  if (!isSupabaseConfigured || !supabase) return [];
  const { data, error: err } = await supabase
    .from("news_posts")
    .select("id")
    .eq("type", "notice")
    .eq("is_published", true);
  if (err || !Array.isArray(data)) return [];
  return (data as { id: string }[])
    .map((r) => r.id)
    .filter((id): id is string => typeof id === "string");
}

export function useLatestPublishedNotice() {
  const [notice, setNotice] = useState<NewsPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const result = await fetchLatestPublishedNotice();
      if (cancelled) return;
      setNotice(result);
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { notice, loading };
}

/**
 * Ids of every published notice (lightweight — no content), for
 * the Header bell's unread count and the Notifications page's
 * "mark all read" (Phase C / C3 Step A). Same published-only
 * discipline as every public read.
 */
export function usePublishedNoticeIds() {
  const [ids, setIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const result = await fetchPublishedNoticeIds();
      if (cancelled) return;
      setIds(result);
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return { ids, loading };
}
