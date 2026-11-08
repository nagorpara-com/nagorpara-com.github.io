/**
 * Honest empty state for data-driven homepage sections.
 * Shown until real published content exists (via the Admin Panel) —
 * the site never displays invented players, results, news or amounts.
 */
export default function EmptyState({ message }: { message: string }) {
  return (
    <p className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-500">
      {message}
    </p>
  );
}
