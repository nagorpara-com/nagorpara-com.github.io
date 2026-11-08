/**
 * 404 — the visitor followed a wrong or outdated link.
 * v180 D4: plain Bengali not-found copy in the same centred layout
 * the old PhasePlaceholder shell used (it previously rendered the
 * internal placeholder text "এই পেজটি —এ তৈরি করা হবে…").
 */
export default function NotFoundPage() {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-brand">পেজটি পাওয়া যায়নি</h1>
      <p className="mt-3 text-sm text-neutral-500">
        আপনি যে পেজটি খুঁজছেন, তা পাওয়া যায়নি — ঠিকানাটি ভুল হতে পারে, অথবা পেজটি সরিয়ে
        নেওয়া হয়েছে। উপরের মেনু থেকে অন্য পেজে যেতে পারেন।
      </p>
    </section>
  );
}
