/**
 * Members & Committee — input validation and payload shaping
 * (R-07, Admin-First). Pure functions; the admin hooks call
 * these before any database write, and the database (RLS +
 * column constraints) remains the enforcement layer.
 *
 * Rules mirror the schema (migration 0001):
 * - members.name is required; phone is optional but must be a
 *   valid Bangladeshi mobile when given (same pattern as the
 *   public contact form); the phone is public ONLY when the
 *   admin explicitly marks it (is_phone_public, default off).
 * - committee_members requires a name and a role title and
 *   belongs to a committee term (term_id NOT NULL).
 */

export const BD_PHONE_PATTERN = /^01[3-9]\d{8}$/;

export interface MemberInput {
  name: string;
  phone: string;
  facebook_url: string;
  is_phone_public: boolean;
  address: string;
  joined_date: string;
  photo_url: string;
  is_active: boolean;
  display_order: number;
}

export interface MemberPayload {
  name: string;
  phone: string | null;
  facebook_url: string | null;
  is_phone_public: boolean;
  address: string | null;
  joined_date: string | null;
  photo_url: string | null;
  is_active: boolean;
  display_order: number;
}

export type Validation<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Record<string, string> };

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateMemberInput(input: MemberInput): Validation<MemberPayload> {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  if (name.length < 2) errors.name = "নাম কমপক্ষে ২ অক্ষরের হতে হবে।";
  if (name.length > 120) errors.name = "নাম সর্বোচ্চ ১২০ অক্ষরের হতে পারবে।";

  const phone = input.phone.trim();
  if (phone && !BD_PHONE_PATTERN.test(phone)) {
    errors.phone = "সঠিক বাংলাদেশি মোবাইল নম্বর দিন (01 দিয়ে শুরু, ১১ ডিজিট)।";
  }

  const facebook = input.facebook_url.trim();
  if (facebook && !isFacebookUrl(facebook)) {
    errors.facebook_url = "সঠিক Facebook লিংক দিন (facebook.com/…)।";
  }

  const photo = input.photo_url.trim();
  if (photo && !isHttpUrl(photo)) {
    errors.photo_url = "ছবির ঠিকানা http:// বা https:// দিয়ে শুরু হতে হবে।";
  }

  const order = Number(input.display_order);
  if (!Number.isInteger(order) || order < 0) {
    errors.display_order = "ক্রম ০ বা তার বেশি পূর্ণ সংখ্যা হতে হবে।";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      phone: phone || null,
      facebook_url: facebook || null,
      // A phone can never become public silently: without a
      // phone there is nothing to publish.
      is_phone_public: phone ? input.is_phone_public : false,
      address: input.address.trim() || null,
      joined_date: input.joined_date || null,
      photo_url: photo || null,
      is_active: input.is_active,
      display_order: order,
    },
  };
}

export interface CommitteeInput {
  name: string;
  role_title: string;
  photo_url: string;
  phone: string;
  facebook_url: string;
  is_active: boolean;
  member_id: string;
  display_order: number;
}

export interface CommitteePayload {
  name: string;
  role_title: string;
  photo_url: string | null;
  phone: string | null;
  facebook_url: string | null;
  is_active: boolean;
  member_id: string | null;
  display_order: number;
}

/** A Facebook profile/page link: a real http(s) URL on a
 *  facebook.com host (fb.com short links also accepted). */
function isFacebookUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.com";
}

export function validateCommitteeInput(
  input: CommitteeInput,
): Validation<CommitteePayload> {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  if (name.length < 2) errors.name = "নাম কমপক্ষে ২ অক্ষরের হতে হবে।";
  if (name.length > 120) errors.name = "নাম সর্বোচ্চ ১২০ অক্ষরের হতে পারবে।";
  const role = input.role_title.trim();
  if (role.length < 2) errors.role_title = "পদবি আবশ্যক (কমপক্ষে ২ অক্ষর)।";
  if (role.length > 120) errors.role_title = "পদবি সর্বোচ্চ ১২০ অক্ষরের হতে পারবে।";
  const photo = input.photo_url.trim();
  if (photo && !isHttpUrl(photo)) {
    errors.photo_url = "ছবির ঠিকানা http:// বা https:// দিয়ে শুরু হতে হবে।";
  }
  const phone = input.phone.trim();
  if (phone && !BD_PHONE_PATTERN.test(phone)) {
    errors.phone = "সঠিক বাংলাদেশি মোবাইল নম্বর দিন (01 দিয়ে শুরু, 11 ডিজিট)।";
  }
  const facebook = input.facebook_url.trim();
  if (facebook && !isFacebookUrl(facebook)) {
    errors.facebook_url = "সঠিক Facebook লিংক দিন (facebook.com/…)।";
  }
  const order = Number(input.display_order);
  if (!Number.isInteger(order) || order < 0) {
    errors.display_order = "ক্রম ০ বা তার বেশি পূর্ণ সংখ্যা হতে হবে।";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name,
      role_title: role,
      photo_url: photo || null,
      phone: phone || null,
      facebook_url: facebook || null,
      is_active: input.is_active,
      member_id: input.member_id || null,
      display_order: order,
    },
  };
}

export function validateTermInput(input: {
  title: string;
  start_date: string;
  end_date: string;
}): Validation<{ title: string; start_date: string | null; end_date: string | null }> {
  const errors: Record<string, string> = {};
  const title = input.title.trim();
  if (title.length < 2) errors.title = "মেয়াদের নাম আবশ্যক (কমপক্ষে ২ অক্ষর)।";
  if (title.length > 120) errors.title = "নাম সর্বোচ্চ ১২০ অক্ষরের হতে পারবে।";
  if (input.start_date && input.end_date && input.end_date < input.start_date) {
    errors.end_date = "শেষের তারিখ শুরুর তারিখের আগে হতে পারবে না।";
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      title,
      start_date: input.start_date || null,
      end_date: input.end_date || null,
    },
  };
}

/** International form for tel:/sms: links: 01… +8801…. */
export function intlBdPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("880")) return "+" + digits;
  if (digits.startsWith("0")) return "+880" + digits.slice(1);
  return "+880" + digits;
}
