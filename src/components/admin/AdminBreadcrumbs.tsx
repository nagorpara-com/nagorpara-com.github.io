import { Link, useLocation } from "react-router-dom";
import { ADMIN_NAVIGATION } from "../../config/adminNavigation";
import Icon from "./icons";

/**
 * Breadcrumbs derived from the current route via the central
 * navigation configuration: ড্যাশবোর্ড / <group> / <page>, with a
 * sub-group level where the navigation nests one (ক্রীড়া
 * প্রতিযোগিতা / ফুটবল / টিম ও প্লেয়ার, 2026-10-26).
 * On /admin itself only "ড্যাশবোর্ড" is shown.
 */
export default function AdminBreadcrumbs() {
  const location = useLocation();

  let groupLabel: string | undefined;
  let subLabel: string | undefined;
  let pageLabel: string | undefined;

  if (location.pathname !== "/admin") {
    outer: for (const item of ADMIN_NAVIGATION) {
      for (const child of item.children ?? []) {
        if (child.children) {
          const match = child.children.find(
            (c) => c.route === location.pathname && (!c.search || c.search === location.search),
          );
          if (match) {
            groupLabel = item.label;
            subLabel = child.label;
            pageLabel = match.label;
            break outer;
          }
        } else if (
          child.route === location.pathname &&
          (!child.search || child.search === location.search)
        ) {
          groupLabel = item.label;
          pageLabel = child.label;
          break outer;
        }
      }
    }
  }

  return (
    <nav aria-label="Breadcrumb" className="border-b border-neutral-200 bg-white px-4 py-2 sm:px-6">
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        <li>
          {groupLabel ? (
            <Link to="/admin" className="font-medium text-brand hover:underline">
              ড্যাশবোর্ড
            </Link>
          ) : (
            <span aria-current="page" className="font-semibold text-neutral-800">
              ড্যাশবোর্ড
            </span>
          )}
        </li>
        {groupLabel && (
          <>
            <li aria-hidden="true">
              <Icon name="chevron" className="h-3.5 w-3.5 text-neutral-400" />
            </li>
            <li className="text-neutral-500">{groupLabel}</li>
            {subLabel && (
              <>
                <li aria-hidden="true">
                  <Icon name="chevron" className="h-3.5 w-3.5 text-neutral-400" />
                </li>
                <li className="text-neutral-500">{subLabel}</li>
              </>
            )}
            <li aria-hidden="true">
              <Icon name="chevron" className="h-3.5 w-3.5 text-neutral-400" />
            </li>
            <li aria-current="page" className="font-semibold text-neutral-800">
              {pageLabel}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
