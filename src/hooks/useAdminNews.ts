import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { NewsPost, NewsPostType } from "../types/database.types";
import { generateSlug, nextPublishPatch, type ValidatedNewsPost } from "../utils/newsPost";

/**
 * Admin News & Notice management data (Phase C / C3, spec §7 family).
 *
 * Everything reads and writes the existing `news_posts` table. The
 * database is the enforcement: the "editors write" policy lets only
 * Admin/Editor sessions (can_edit_content()) write or even read
 * drafts; a Viewer session simply receives the published rows, and
 * the page says so. Nothing here invents a status column — draft vs
 * published is `is_published`, exactly as the schema has it.
 */
export const ADMIN_NEWS_PAGE_SIZE = 10;

export type NewsStatusFilter = "all" | "published" | "draft";
export type NewsTypeFilter = "all" | NewsPostType;

function friendlyError(code: string | undefined, fallback: string): string {
  if (code === "23505") return "এই Slug ইতিমধ্যে অন্য একটি পোস্টে ব্যবহৃত হয়েছে — Slug বদলে আবার চেষ্টা করুন।";
  if (code === "42501" || code === "PGRST301") return "আপনার এই কাজের অনুমতি নেই (শুধু Admin/Editor পারবে)।";
  return fallback;
}

const NOT_SAVED =
  "সংরক্ষণ হয়নি — Database-এ কোনো পরিবর্তন হয়নি। রেকর্ডটি পাওয়া যায়নি অথবা আপনার এই কাজের অনুমতি নেই (শুধু Admin/Editor পারবে)। আবার চেষ্টা করুন।";
const NOT_VERIFIED = "লেখা হয়েছে, কিন্তু Database থেকে পুনরায় পড়ে যাচাই করা যায়নি — তালিকা আবার লোড করে অবস্থা দেখে নিন।";

/** Reads one post back by id (list-shaped), or null when it is gone. */
async function readPostById(id: string): Promise<NewsPost | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("news_posts").select("*").eq("id", id);
  if (error || !data || data.length === 0) return null;
  return data[0] as NewsPost;
}

export function useAdminNews() {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<NewsTypeFilter>("all");
  const [statusFilter, setStatusFilter] = useState<NewsStatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    let query = supabase
      .from("news_posts")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (typeFilter !== "all") query = query.eq("type", typeFilter);
    if (statusFilter === "published") query = query.eq("is_published", true);
    if (statusFilter === "draft") query = query.eq("is_published", false);
    const term = search.trim();
    if (term) query = query.ilike("title", `%${term}%`);
    const fromIdx = (page - 1) * ADMIN_NEWS_PAGE_SIZE;
    query = query.range(fromIdx, fromIdx + ADMIN_NEWS_PAGE_SIZE - 1);
    const { data, error: err, count } = await query;
    if (err) {
      setError("পোস্টগুলো লোড করা যায়নি — আবার চেষ্টা করুন।");
      setLoading(false);
      return;
    }
    setPosts((data ?? []) as NewsPost[]);
    setTotal(count ?? 0);
    setLoading(false);
  }, [typeFilter, statusFilter, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Changing a filter always returns to the first page. */
  const applyFilters = useCallback(
    (patch: { type?: NewsTypeFilter; status?: NewsStatusFilter; search?: string }) => {
      if (patch.type !== undefined) setTypeFilter(patch.type);
      if (patch.status !== undefined) setStatusFilter(patch.status);
      if (patch.search !== undefined) setSearch(patch.search);
      setPage(1);
    },
    [],
  );

  const create = useCallback(
    async (
      value: ValidatedNewsPost,
      createdBy: string | null,
    ): Promise<{ ok: boolean; error?: string; post?: NewsPost }> => {
      if (!supabase) return { ok: false, error: "Supabase সংযোগ নেই।" };
      const slug = value.slug || generateSlug(value.title);
      const { data: inserted, error: err } = await supabase
        .from("news_posts")
        .insert({
          type: value.type,
          title: value.title,
          slug,
          content: value.content,
          cover_image_url: value.cover_image_url,
          notice_category: value.notice_category,
          button_text: value.button_text,
          button_url: value.button_url,
          is_published: false,
          published_at: null,
          created_by: createdBy,
        })
        .select("id")
        .single();
      if (err) return { ok: false, error: friendlyError(err.code, "পোস্ট তৈরি করা যায়নি — আবার চেষ্টা করুন।") };
      // Read-back verification: the row must exist with exactly the
      // submitted fields (and as a draft) before success is claimed.
      const back = inserted?.id ? await readPostById(inserted.id as string) : null;
      if (
        !back ||
        back.type !== value.type ||
        back.title !== value.title ||
        back.slug !== slug ||
        (back.content ?? null) !== (value.content ?? null) ||
        (back.cover_image_url ?? null) !== (value.cover_image_url ?? null) ||
        (back.notice_category ?? "info") !== value.notice_category ||
        (back.button_text ?? null) !== (value.button_text ?? null) ||
        (back.button_url ?? null) !== (value.button_url ?? null) ||
        back.is_published !== false
      ) {
        await load();
        return { ok: false, error: NOT_VERIFIED };
      }
      await load();
      return { ok: true, post: back };
    },
    [load],
  );

  const update = useCallback(
    async (id: string, value: ValidatedNewsPost): Promise<{ ok: boolean; error?: string }> => {
      if (!supabase) return { ok: false, error: "Supabase সংযোগ নেই।" };
      const { data: updated, error: err } = await supabase
        .from("news_posts")
        .update({
          type: value.type,
          title: value.title,
          slug: value.slug,
          content: value.content,
          cover_image_url: value.cover_image_url,
          notice_category: value.notice_category,
          button_text: value.button_text,
          button_url: value.button_url,
        })
        .eq("id", id)
        .select("id");
      if (err) return { ok: false, error: friendlyError(err.code, "পরিবর্তন সংরক্ষণ করা যায়নি — আবার চেষ্টা করুন।") };
      // Zero affected rows (missing record or RLS) is NOT a success.
      if (!updated || updated.length === 0) return { ok: false, error: NOT_SAVED };
      const back = await readPostById(id);
      if (
        !back ||
        back.type !== value.type ||
        back.title !== value.title ||
        back.slug !== value.slug ||
        (back.content ?? null) !== (value.content ?? null) ||
        (back.cover_image_url ?? null) !== (value.cover_image_url ?? null) ||
        (back.notice_category ?? "info") !== value.notice_category ||
        (back.button_text ?? null) !== (value.button_text ?? null) ||
        (back.button_url ?? null) !== (value.button_url ?? null)
      ) {
        await load();
        return { ok: false, error: NOT_VERIFIED };
      }
      await load();
      return { ok: true };
    },
    [load],
  );

  const setPublished = useCallback(
    async (post: NewsPost, publish: boolean): Promise<{ ok: boolean; error?: string }> => {
      if (!supabase) return { ok: false, error: "Supabase সংযোগ নেই।" };
      const patch = nextPublishPatch(post, publish, new Date().toISOString());
      const { data: updated, error: err } = await supabase.from("news_posts").update(patch).eq("id", post.id).select("id");
      if (err) {
        return {
          ok: false,
          error: friendlyError(err.code, publish ? "প্রকাশ করা যায়নি — আবার চেষ্টা করুন।" : "অপ্রকাশ করা যায়নি — আবার চেষ্টা করুন।"),
        };
      }
      if (!updated || updated.length === 0) return { ok: false, error: NOT_SAVED };
      // Verified against the database row, not local optimism: the
      // published flag must match, and published_at must be set
      // exactly when the patch set it (its first-publish value is
      // preserved by nextPublishPatch on unpublish).
      const back = await readPostById(post.id);
      if (
        !back ||
        back.is_published !== patch.is_published ||
        (patch.published_at === null ? back.published_at !== null : back.published_at === null)
      ) {
        return { ok: false, error: NOT_VERIFIED };
      }
      setPosts((prev) => prev.map((p) => (p.id === post.id ? back : p)));
      return { ok: true };
    },
    [],
  );

  /**
   * Counts the email-delivery history rows of a post. The delete
   * confirmation shows this number (deleting a notice cascades its
   * deliveries away — migration 0015); when the count cannot be
   * read, the caller must STOP before delete (never guess a number).
   */
  const countDeliveries = useCallback(
    async (postId: string): Promise<{ ok: boolean; count?: number; error?: string }> => {
      if (!supabase) return { ok: false, error: "Supabase সংযোগ নেই।" };
      const { count, error: err } = await supabase
        .from("notice_deliveries")
        .select("id", { count: "exact", head: false })
        .eq("post_id", postId);
      if (err || count === null) {
        return { ok: false, error: "এই পোস্টের Email Delivery ইতিহাস পড়া যায়নি — নিরাপত্তার জন্য Delete এখন বন্ধ রাখা হলো। আবার চেষ্টা করুন।" };
      }
      return { ok: true, count };
    },
    [],
  );

  /**
   * Permanent delete, verified: the DELETE must affect the row, and
   * a read-back must find the record gone, before success is
   * claimed. Delivery rows of a notice cascade-delete with it (the
   * page discloses the counted number before confirming).
   */
  const deletePost = useCallback(
    async (post: NewsPost): Promise<{ ok: boolean; error?: string }> => {
      if (!supabase) return { ok: false, error: "Supabase সংযোগ নেই।" };
      const { data: deleted, error: err } = await supabase.from("news_posts").delete().eq("id", post.id).select("id");
      if (err) return { ok: false, error: friendlyError(err.code, "পোস্টটি মোছা যায়নি — আবার চেষ্টা করুন।") };
      if (!deleted || deleted.length === 0) {
        return { ok: false, error: "মোছা যায়নি — Database-এ কোনো পরিবর্তন হয়নি। রেকর্ডটি পাওয়া যায়নি অথবা আপনার এই কাজের অনুমতি নেই (শুধু Admin/Editor পারবে)।" };
      }
      const back = await readPostById(post.id);
      if (back) return { ok: false, error: NOT_VERIFIED };
      await load();
      return { ok: true };
    },
    [load],
  );

  return {
    posts,
    total,
    page,
    pageSize: ADMIN_NEWS_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / ADMIN_NEWS_PAGE_SIZE)),
    loading,
    error,
    typeFilter,
    statusFilter,
    search,
    applyFilters,
    setPage,
    reload: load,
    create,
    update,
    setPublished,
    countDeliveries,
    deletePost,
    isConfigured: isSupabaseConfigured,
  };
}
