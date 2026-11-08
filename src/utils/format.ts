/** Bengali digit + formatting helpers (display only). */

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";

/** Season label: a stored season may be a legacy plain year
 * ("2026") or a full ISO date (the Team Settings season field
 * became a date picker on the owner's order, 2026-11-02). Full
 * dates render as a Bengali long date; anything else renders
 * as-is with Bengali digits. */
export function formatSeasonLabel(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const d = new Date(`${value.slice(0, 10)}T00:00:00`);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("bn-BD", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(d);
    }
  }
  return toBn(value);
}

export function toBn(value: number | string): string {
  return String(value).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
}

export function formatBdt(amount: number): string {
  return `৳ ${new Intl.NumberFormat("bn-BD").format(amount)}`;
}

/** Whole years between a date of birth (migration 0051) and
 * today, or null when the date is missing or invalid. */
export function ageInYears(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(`${dob.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age -= 1;
  return age >= 0 ? age : null;
}

export function formatDateBn(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("bn-BD", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
