import { useCallback, useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabaseClient";
import type { AuditLogRow } from "../utils/auditLog";

/**
 * General Audit Log data (Section 03) — READ-ONLY by design: this
 * hook has no write function at all, mirroring the database, where
 * only the audit trigger may write and admins may only read (RLS).
 *
 * When migration 0020 has not been applied yet, PostgREST answers
 * 404 / PGRST205 for the missing table; that is surfaced as the
 * distinct `missingTable` state so the page can say honestly that
 * the log is not active — never fake rows.
 */
export const AUDIT_PAGE_SIZE = 15;

export type AuditEntityFilter = "all" | "profiles" | "news_posts" | "site_settings";
export type AuditActionFilter = "all" | "insert" | "update" | "delete";

function isMissingTable(code: string | undefined, message: string | undefined): boolean {
  if (code === "PGRST205" || code === "42P01") return true;
  return !!message && message.includes("audit_logs") && message.includes("schema cache");
}

export function useAdminAuditLog() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingTable, setMissingTable] = useState(false);
  const [entityFilter, setEntityFilter] = useState<AuditEntityFilter>("all");
  const [actionFilter, setActionFilter] = useState<AuditActionFilter>("all");
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
      .from("audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false });
    if (entityFilter !== "all") query = query.eq("entity_type", entityFilter);
    if (actionFilter !== "all") query = query.eq("action", actionFilter);
    const term = search.trim().replace(/[%_,()]/g, " ");
    if (term) {
      query = query.or(`entity_label.ilike.%${term}%,actor_name.ilike.%${term}%,entity_id.ilike.%${term}%`);
    }
    const fromIdx = (page - 1) * AUDIT_PAGE_SIZE;
    query = query.range(fromIdx, fromIdx + AUDIT_PAGE_SIZE - 1);
    const { data, error: err, count } = await query;
    if (err) {
      if (isMissingTable(err.code, err.message)) {
        setMissingTable(true);
        setRows([]);
        setTotal(0);
      } else {
        setError("ইতিহাস লোড করা যায়নি — আবার চেষ্টা করুন।");
      }
      setLoading(false);
      return;
    }
    setMissingTable(false);
    setRows((data ?? []) as AuditLogRow[]);
    setTotal(count ?? 0);
    setLoading(false);
  }, [entityFilter, actionFilter, search, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFilters = useCallback(
    (patch: { entity?: AuditEntityFilter; action?: AuditActionFilter; search?: string }) => {
      if (patch.entity !== undefined) setEntityFilter(patch.entity);
      if (patch.action !== undefined) setActionFilter(patch.action);
      if (patch.search !== undefined) setSearch(patch.search);
      setPage(1);
    },
    [],
  );

  return {
    rows,
    total,
    page,
    pageSize: AUDIT_PAGE_SIZE,
    totalPages: Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE)),
    loading,
    error,
    missingTable,
    entityFilter,
    actionFilter,
    search,
    applyFilters,
    setPage,
    reload: load,
    isConfigured: isSupabaseConfigured,
  };
}
