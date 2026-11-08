import { Link, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

/**
 * F1: the Finance route additionally requires a finance role
 * (admin / finance_manager). Sits inside <RequireAdmin />, so the
 * visitor is already signed in with an active profile.
 *
 * - While the profile is still loading, a loading state is shown —
 *   never a denial flash (plan P6).
 * - Non-finance roles get an explanation and a way back; the real
 *   enforcement remains RLS + the 0018 policies in the database.
 */
export default function RequireFinanceRole() {
  const { loading, profile } = useAuth();

  if (loading || !profile) {
    return (
      <p className="py-16 text-center text-sm text-neutral-500">লোড হচ্ছে…</p>
    );
  }

  if (profile.role !== "admin" && profile.role !== "finance_manager") {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h2 className="text-lg font-bold text-neutral-800">
          Finance অংশে প্রবেশের অনুমতি নেই
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600">
          আর্থিক তথ্য শুধু Admin ও Finance Manager Role-এর জন্য। আপনার বর্তমান
          Role: <span className="font-semibold">{profile.role}</span>
        </p>
        <Link
          to="/admin"
          className="mt-5 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white"
        >
          Dashboard-এ ফিরে যান
        </Link>
      </div>
    );
  }

  return <Outlet />;
}
