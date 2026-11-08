interface PhasePlaceholderProps {
  title: string;
  /** Which phase will build this page for real, following its Reference Image. */
  phase: string;
}

/**
 * Neutral placeholder used by every route in Phase 2.
 * It deliberately shows NO sample content — each page is designed in its
 * own phase, from the Reference Image the organization provides.
 */
export default function PhasePlaceholder({ title, phase }: PhasePlaceholderProps) {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-brand">{title}</h1>
      <p className="mt-3 text-sm text-neutral-500">
        এই পেজটি {phase}-এ তৈরি করা হবে — সংগঠনের দেওয়া Reference Image
        অনুযায়ী।
      </p>
    </section>
  );
}
