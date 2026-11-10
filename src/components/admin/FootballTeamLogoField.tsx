import { useEffect, useState } from "react";
import PhotoUploadField from "./PhotoUploadField";
import { useFootballTeamLogo } from "../../hooks/useFootballTeamLogo";

/**
 * Football team logo editor (Football Team View work, 2026-10-26).
 * Lives inside the Football Team Settings section, next to the
 * team name: the logo shows on the public team card in a square
 * 1:1 frame (96px mobile / 128px desktop — the international
 * crest standard). Media comes ONLY from an upload or the
 * Website Gallery (the owner's No-URL Admin rule). Until
 * migration 0025 is applied live, the field honestly shows that
 * the column is not active yet instead of controls that would
 * fail. With no team logo set, the public site falls back to the
 * organization logo.
 */
export default function FootballTeamLogoField() {
  const { state, logoUrl, busy, error, savedNote, save } = useFootballTeamLogo();
  const [draft, setDraft] = useState<string>("");

  useEffect(() => {
    if (state === "ready") setDraft(logoUrl ?? "");
  }, [state, logoUrl]);

  if (state === "loading") {
    return <p className="mt-3 text-sm text-neutral-500">টিমের লোগো লোড হচ্ছে…</p>;
  }

  if (state === "unsupported") {
    return (
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-sm font-semibold text-amber-800">টিমের লোগো</p>
        <p className="mt-1 text-sm text-amber-700">
          এই সুবিধাটি চালু করতে Migration 0025 Live Apply করতে হবে — সেটি মালিকের আলাদা অনুমতিতে হবে।
          ততদিন ওয়েবসাইটে সংগঠনের লোগোই টিমের লোগো হিসেবে দেখাবে।
        </p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
        <p className="text-sm font-semibold text-red-700">টিমের লোগো লোড করা যায়নি</p>
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  const dirty = draft !== (logoUrl ?? "");

  return (
    <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
      <p className="text-sm font-semibold text-brand-dark">টিমের লোগো</p>
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">বর্গাকার (1:1) ফ্রেমে দেখাবে। Transparent PNG ভালো দেখায়; না দিলে সংগঠনের লোগো দেখাবে।</p>
      <div className="mt-3 flex flex-wrap items-start gap-4">
        <span className="flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-neutral-200 bg-white p-2">
          {draft ? (
            <img loading="lazy" src={draft} alt="টিমের লোগোর প্রিভিউ" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-center text-xs text-neutral-400">
              লোগো
              <br />
              নেই
            </span>
          )}
        </span>
        <div className="min-w-64 flex-1">
          <PhotoUploadField value={draft} onChange={setDraft} pathPrefix="team-logo" label="টিমের লোগো" sizeHint="512 × 512 পিক্সেল (অনুপাত 1:1)" />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !dirty}
          onClick={() => void save(draft || null)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "সংরক্ষণ হচ্ছে…" : "লোগো সংরক্ষণ করুন"}
        </button>
        {logoUrl && (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setDraft("");
              void save(null);
            }}
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 disabled:opacity-50"
          >
            লোগো সরান
          </button>
        )}
        {savedNote && <span className="text-sm font-medium text-brand">{savedNote}</span>}
        {error && <span className="text-sm font-medium text-red-600">{error}</span>}
      </div>
    </div>
  );
}
