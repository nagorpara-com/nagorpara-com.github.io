import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ORGANIZATION } from "../../config/organization";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient";

/**
 * Admin login (Phase 2 foundation).
 * - No hard-coded username/password exists anywhere in this project.
 * - When Supabase is connected, this form signs in with Supabase Auth for
 *   real. Until then it honestly reports that setup is pending — there is
 *   no fake/demo login.
 */
export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isSupabaseConfigured || !supabase) return;
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setSubmitting(false);
    if (signInError) {
      setError("লগইন হয়নি — ইমেইল বা পাসওয়ার্ড যাচাই করুন।");
      return;
    }
    navigate("/admin");
  };

  return (
    <section className="mx-auto w-full max-w-sm px-4 py-16">
      <div className="text-center">
        <img
          src={ORGANIZATION.logoPath}
          alt=""
          className="mx-auto h-14 w-14 rounded-full object-contain"
        />
        <h1 className="mt-3 text-xl font-bold text-brand">Admin Login</h1>
        <p className="text-sm text-neutral-500">{ORGANIZATION.nameBn}</p>
      </div>

      {!isSupabaseConfigured ? (
        <p className="mt-6 rounded border border-gold bg-gold/10 px-4 py-3 text-center text-sm">
          Supabase এখনো সংযুক্ত হয়নি — Account তৈরি ও Configuration শেষ হলে
          এই লগইন সক্রিয় হবে। কোনো ডেমো লগইন নেই।
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-3">
          <label className="text-sm">
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
              autoComplete="username"
            />
          </label>
          <label className="text-sm">
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2"
              autoComplete="current-password"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="rounded bg-brand px-4 py-2 font-medium text-white disabled:opacity-60"
          >
            {submitting ? "লগইন হচ্ছে…" : "Login"}
          </button>
        </form>
      )}
    </section>
  );
}
