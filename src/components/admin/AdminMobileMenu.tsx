import { useEffect, useRef } from "react";
import { AdminBrand, AdminNavList } from "./AdminSidebar";
import Icon from "./icons";

/**
 * Mobile admin navigation: a slide-in drawer reusing the exact same
 * brand block and navigation list as the desktop sidebar.
 * - Selecting any item closes the drawer (via onNavigate).
 * - Escape closes it; the close button is focusable and labelled.
 */
export default function AdminMobileMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Admin মেনু">
      <button
        type="button"
        aria-label="মেনু বন্ধ করুন"
        onClick={onClose}
        className="absolute inset-0 h-full w-full cursor-default bg-black/45"
      />
      <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-brand-dark shadow-xl">
        <div className="flex items-start justify-between">
          <AdminBrand />
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="মেনু বন্ধ করুন"
            className="m-3 rounded-lg p-2 text-white/85 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <AdminNavList onNavigate={onClose} />
      </div>
    </div>
  );
}
