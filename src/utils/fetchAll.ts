import type { PostgrestError } from "@supabase/supabase-js";

/**
 * Fetch EVERY row of a list query, paging past PostgREST's
 * default 1000-row response cap.
 *
 * Without this, lists silently stop at 1,000 rows — the owner
 * requires NO limit on how many members / committee rows can
 * be added, so every list hook pages in chunks of 1,000 until
 * a short page comes back. The caller's query MUST have a
 * deterministic .order(...) so pages never overlap or skip.
 * Returned rows are untyped (unknown[]); callers cast to
 * their row type exactly as they did for single queries.
 */
const PAGE_SIZE = 1000;

type PageResult = { data: unknown; error: PostgrestError | null };

export async function fetchAllRows(
  build: (from: number, to: number) => PromiseLike<PageResult>,
): Promise<{ data: unknown[] | null; error: string | null }> {
  const all: unknown[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) return { data: null, error: error.message };
    const rows = (data ?? []) as unknown[];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return { data: all, error: null };
}
