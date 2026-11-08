/**
 * Shown while a lazily-loaded route chunk is downloading
 * (route code-splitting, 2026-11-02 audit fix #5). Used as the
 * Suspense fallback in App.tsx (whole-screen routes such as the
 * admin login) and inside both layouts (so the header, sidebar
 * and footer stay mounted while only the page content loads).
 */
export default function RouteFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4 py-16">
      <p className="text-sm text-neutral-500">লোড হচ্ছে…</p>
    </div>
  );
}
