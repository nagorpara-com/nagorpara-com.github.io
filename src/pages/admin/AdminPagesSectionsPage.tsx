import { useMemo, useState } from "react";
import { Link } from "react-router-dom";

/**
 * Pages & Sections — Directory (Phase 1, 2026-10-24).
 *
 * A read-only navigation and status overview for every public page
 * of the website, built from the evidence in
 * docs/PAGES_SECTIONS_AUDIT_2026-10-24.md. This page changes NO data:
 * each module keeps its own admin page, data model and business
 * logic, and the links below lead to those real pages.
 *
 * Status rules (from the audit):
 * - Statuses describe the FEATURE/CODE state only — never how much
 *   content happens to be in the database today.
 * - A module whose public or admin page is still a placeholder is
 *   "অসম্পূর্ণ" and gets NO management link (a placeholder is not a
 *   working feature, so linking to it would be misleading).
 * - "যাচাই বাকি" = implemented in code but its live operation is not
 *   yet verified.
 *
 * Entries refreshed 2026-11-02 against the current code and the
 * verified live state (news delete, deployed email functions and
 * the live audit log were re-checked; Teams and Audit Log entries
 * added).
 */

type Status = "complete" | "partial" | "incomplete" | "unverified";

interface DirectoryEntry {
  name: string;
  nameEn?: string;
  publicRoute: string | null;
  publicRouteNote?: string;
  description: string;
  status: Status;
  adminRoute: string | null;
  adminLabel?: string;
  adminRoute2?: string;
  adminLabel2?: string;
  note?: string;
}

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  complete: { label: "সম্পূর্ণ", cls: "bg-brand-light text-brand-dark" },
  partial: { label: "আংশিক", cls: "bg-amber-100 text-amber-800" },
  incomplete: { label: "অসম্পূর্ণ", cls: "bg-red-50 text-red-700" },
  unverified: { label: "যাচাই বাকি", cls: "bg-neutral-100 text-neutral-600" },
};

const ENTRIES: DirectoryEntry[] = [
  {
    name: "হোমপেজ",
    nameEn: "Homepage",
    publicRoute: "/",
    description: "প্রধান পৃষ্ঠা — Section-এর ক্রম ও Hero পরিচালনা।",
    status: "complete",
    adminRoute: "/admin/content/home",
    adminLabel: "হোমপেজ পরিচালনা",
  },
  {
    name: "গ্রাম পরিচিতি",
    nameEn: "Village Profile",
    publicRoute: "/village-profile",
    description: "গ্রাম পেজের Section পরিচালনা।",
    status: "complete",
    adminRoute: "/admin/village",
    adminLabel: "গ্রামের পরিচিতি",
    note: "অবস্থান ও ঠিকানা, গুরুত্বপূর্ণ স্থান ও গ্রামের ছবি — প্রতিটি অংশের আলাদা Admin Page আছে (সাইডবারের 'গ্রামের পরিচিতি' মেনুতে)।",
  },
  {
    name: "ফুটবল",
    nameEn: "Football",
    publicRoute: "/football",
    publicRouteNote: "প্লেয়ারের আলাদা Profile Page সহ",
    description: "ফুটবল টিম ও প্লেয়ার পরিচালনা।",
    status: "complete",
    adminRoute: "/admin/players",
    adminLabel: "প্লেয়ার পরিচালনা",
  },
  {
    name: "ক্রিকেট",
    nameEn: "Cricket",
    publicRoute: "/cricket",
    publicRouteNote: "প্লেয়ারের আলাদা Profile Page সহ",
    description: "ক্রিকেট টিম ও প্লেয়ার পরিচালনা।",
    status: "complete",
    adminRoute: "/admin/players",
    adminLabel: "প্লেয়ার পরিচালনা",
    adminRoute2: "/admin/team-settings?sport=cricket",
    adminLabel2: "টিম সেটিংস",
    note: "টিমের নাম, লোগো ও মৌসুম টিম সেটিংস থেকে বদলানো যায়।",
  },
  {
    name: "ম্যাচ",
    nameEn: "Matches",
    publicRoute: "/matches",
    publicRouteNote: "প্রতিটি ম্যাচের বিস্তারিত Page সহ",
    description: "ম্যাচ, ফলাফল ও প্লেয়ারদের Performance।",
    status: "complete",
    adminRoute: "/admin/matches",
    adminLabel: "ম্যাচ পরিচালনা",
  },
  {
    name: "টুর্নামেন্ট",
    nameEn: "Tournaments",
    publicRoute: "/tournaments",
    description: "টুর্নামেন্টের তালিকা ও তথ্য।",
    status: "complete",
    adminRoute: "/admin/tournaments",
    adminLabel: "টুর্নামেন্ট পরিচালনা",
  },
  {
    name: "টিম-নিবন্ধন",
    nameEn: "Teams",
    publicRoute: null,
    publicRouteNote: "আলাদা Public Page নেই — ফুটবল, ক্রিকেট ও টুর্নামেন্ট Page-এ টিমের নাম ও লোগো দেখা যায়",
    description: "সব খেলার টিমের নাম ও লোগো পরিচালনা।",
    status: "complete",
    adminRoute: "/admin/teams",
    adminLabel: "টিম-নিবন্ধন",
    note: "টুর্নামেন্টে টিম নিবন্ধনের Database অংশ Migration 0044 Live হলে পুরোপুরি কার্যকর হবে।",
  },
  {
    name: "সংবাদ ও কার্যক্রম",
    nameEn: "News & Activities",
    publicRoute: "/news",
    publicRouteNote: "প্রতিটি সংবাদের আলাদা Page সহ",
    description: "সংবাদ ও নোটিশ পরিচালনা ও Email পাঠানো।",
    status: "complete",
    adminRoute: "/admin/news",
    adminLabel: "খবর ও বিজ্ঞপ্তি",
    note: "Post Delete করলে তা Website ও Database — দুই জায়গা থেকেই সরে যায়।",
  },
  {
    name: "নোটিশ ও ঘোষণা",
    nameEn: "Notifications",
    publicRoute: "/notifications",
    description: "প্রকাশিত নোটিশ — সংবাদ থেকেই পরিচালিত।",
    status: "complete",
    adminRoute: "/admin/news",
    adminLabel: "খবর ও বিজ্ঞপ্তি",
  },
  {
    name: "আর্থিক সারসংক্ষেপ",
    nameEn: "Finance Summary",
    publicRoute: "/finance",
    description: "Public হিসাবের সারসংক্ষেপ।",
    status: "complete",
    adminRoute: "/admin/finance",
    adminLabel: "অর্থ ও হিসাব",
  },
  {
    name: "সদস্য ও কমিটি",
    nameEn: "Members & Committee",
    publicRoute: "/members",
    publicRouteNote: "/committee লিখলেও এই Page-এই আসে",
    description: "সদস্য ও কমিটি পরিচালনা।",
    status: "complete",
    adminRoute: "/admin/members",
    adminLabel: "সদস্য পরিচালনা",
    adminRoute2: "/admin/committee",
    adminLabel2: "কমিটি পরিচালনা",
  },
  {
    name: "যোগাযোগ",
    nameEn: "Contact",
    publicRoute: "/contact",
    description: "যোগাযোগ Form ও পাঠানো বার্তা।",
    status: "complete",
    adminRoute: "/admin/messages",
    adminLabel: "বার্তা পরিচালনা",
  },
  {
    name: "ইমেইল যাচাই ও আনসাবস্ক্রাইব",
    nameEn: "Verify / Unsubscribe",
    publicRoute: "/verify-subscription",
    publicRouteNote: "/unsubscribe Page-টিও একই ব্যবস্থার অংশ",
    description: "Email যাচাই ও বাদ পড়ার Page।",
    status: "complete",
    adminRoute: "/admin/subscribers",
    adminLabel: "Subscriber পরিচালনা",
    note: "নতুন Subscribe সঙ্গে সঙ্গে Active হয় ও Welcome Email যায় — ব্যবস্থাটি Live। যাচাই Page-টি পুরনো (Pending) সদস্যদের জন্য প্রযোজ্য।",
  },
  {
    name: "Welcome ইমেইল সেটিংস",
    nameEn: "Welcome Email",
    publicRoute: null,
    publicRouteNote: "Public Page নয় — যাচাই সম্পন্ন হলেই Subscriber-এর Inbox-এ যায়",
    description: "Welcome ইমেইলের লেখা ও চালু/বন্ধ অবস্থা।",
    status: "complete",
    adminRoute: "/admin/welcome-email",
    adminLabel: "Welcome ইমেইল",
    note: "নতুন Subscribe-এ স্বয়ংক্রিয়ভাবে পাঠানো হয় — Live-এ যাচাই সম্পন্ন।",
  },
  {
    name: "হেডার ও ফুটার",
    nameEn: "Header & Footer",
    publicRoute: null,
    publicRouteNote: "সব Public Page-এর উপরে ও নিচে দেখা যায়",
    description: "সংগঠনের তথ্য — Header/Footer-এ দেখায়।",
    status: "complete",
    adminRoute: "/admin/content/header-footer",
    adminLabel: "হেডার ও ফুটার",
  },
  {
    name: "কার্যক্রমের ইতিহাস",
    nameEn: "Audit Log",
    publicRoute: null,
    publicRouteNote: "Public Page নয় — শুধু Admin Panel-এ দেখা যায়",
    description: "ভূমিকা/অবস্থা, সংবাদ ও Website Settings-এর পরিবর্তনের ইতিহাস।",
    status: "complete",
    adminRoute: "/admin/audit-log",
    adminLabel: "কার্যক্রমের ইতিহাস",
    note: "শুধু Admin দেখতে পারে; রেকর্ড বদলানো বা মোছা যায় না।",
  },
];

const FILTERS: Array<{ key: Status | "all"; label: string }> = [
  { key: "all", label: "সব" },
  { key: "complete", label: "সম্পূর্ণ" },
  { key: "partial", label: "আংশিক" },
  { key: "incomplete", label: "অসম্পূর্ণ" },
  { key: "unverified", label: "যাচাই বাকি" },
];

export default function AdminPagesSectionsPage() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Status | "all">("all");

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ENTRIES.filter((entry) => {
      if (filter !== "all" && entry.status !== filter) return false;
      if (!q) return true;
      return (
        entry.name.toLowerCase().includes(q) ||
        (entry.nameEn ?? "").toLowerCase().includes(q) ||
        (entry.publicRoute ?? "").toLowerCase().includes(q)
      );
    });
  }, [query, filter]);

  return (
    <div className="max-w-4xl">
      <h1 className="text-xl font-bold text-brand-dark">পেজ ও সেকশন</h1>
      <p className="mt-1 text-sm text-neutral-500">
            সব Page-এর অবস্থা ও পরিচালনার জায়গা।
          </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Page খুঁজুন — নাম বা Route"
          aria-label="Page খুঁজুন"
          className="w-full max-w-xs rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label="অবস্থা অনুযায়ী ছাঁকুন">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className={
                filter === f.key
                  ? "rounded-full bg-brand px-3.5 py-1.5 text-sm font-semibold text-white"
                  : "rounded-full px-3.5 py-1.5 text-sm text-neutral-600 transition-colors hover:bg-brand-light hover:text-brand-dark"
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {visible.map((entry) => {
          const meta = STATUS_META[entry.status];
          return (
            <article
              key={entry.name}
              className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5"
              data-status={entry.status}
            >
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-bold text-brand-dark">
                    {entry.name}
                    {entry.nameEn && (
                      <span className="ml-2 text-sm font-medium text-neutral-400">{entry.nameEn}</span>
                    )}
                  </h2>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {entry.publicRoute ? (
                      <>
                        Public Route: <span className="font-medium text-neutral-700">{entry.publicRoute}</span>
                        {entry.publicRouteNote && <> · {entry.publicRouteNote}</>}
                      </>
                    ) : (
                      <>{entry.publicRouteNote}</>
                    )}
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">{entry.description}</p>
                  {entry.note && (
                    <p className="mt-1.5 text-xs leading-relaxed text-amber-700">{entry.note}</p>
                  )}
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${meta.cls}`}>
                  {meta.label}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {entry.adminRoute ? (
                  <>
                    <Link
                      to={entry.adminRoute}
                      className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
                    >
                      {entry.adminLabel ?? "Admin Page"}
                    </Link>
                    {entry.adminRoute2 && (
                      <Link
                        to={entry.adminRoute2}
                        className="rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
                      >
                        {entry.adminLabel2 ?? "Admin Page"}
                      </Link>
                    )}
                  </>
                ) : (
                  <span className="rounded-full bg-neutral-100 px-4 py-1.5 text-sm text-neutral-500">
                    Admin Page নেই
                  </span>
                )}
                {entry.publicRoute && (
                  <Link
                    to={entry.publicRoute}
                    className="rounded-full border border-neutral-300 px-4 py-1.5 text-sm font-medium text-neutral-700 transition hover:border-brand hover:text-brand-dark"
                  >
                    Public Page দেখুন
                  </Link>
                )}
              </div>
            </article>
          );
        })}
        {visible.length === 0 && (
          <p className="rounded-2xl border border-neutral-200 bg-white p-6 text-center text-sm text-neutral-500">
            এই শর্তে কোনো Page পাওয়া যায়নি।
          </p>
        )}
      </div>
    </div>
  );
}
