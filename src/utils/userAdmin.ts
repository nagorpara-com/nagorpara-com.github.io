/**
 * Admin Users — pure validation + lockout-prevention logic
 * (Section 01, 2026-10-24). Unit-testable; the hook and page both
 * enforce these rules, and the database RLS ("profiles: only admin
 * writes", migration 0012) remains the real enforcement — nothing
 * here replaces it.
 *
 * Lockout rules (owner-approved, mandatory):
 *  1. Nobody can change their OWN role.
 *  2. Nobody can deactivate their OWN account.
 *  3. The LAST active admin can neither be demoted nor deactivated.
 * Only an active admin may change anyone at all.
 */

export const ASSIGNABLE_ROLES = [
  "admin",
  "finance_manager",
  "editor",
  "viewer",
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin (প্রশাসক)",
  finance_manager: "Finance Manager (অর্থ ব্যবস্থাপক)",
  editor: "Editor (সম্পাদক)",
  viewer: "Viewer (দর্শক)",
  super_admin: "Super Admin (পুরনো — অব্যবহৃত)",
};

export interface ManagedUser {
  id: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

export type UserChange =
  | { kind: "role"; role: AssignableRole }
  | { kind: "active"; isActive: boolean }
  | { kind: "profile"; fullName: string; phone: string };

/**
 * Returns a Bengali explanation when the change is forbidden,
 * or null when it may proceed (RLS still has the final say).
 */
export function guardUserChange(args: {
  actor: { id: string; role: string; is_active: boolean } | null;
  target: ManagedUser;
  allUsers: ManagedUser[];
  change: UserChange;
}): string | null {
  const { actor, target, allUsers, change } = args;
  if (!actor || actor.role !== "admin" || !actor.is_active) {
    return "শুধু সক্রিয় Admin-ই ব্যবহারকারীদের পরিচালনা করতে পারেন।";
  }
  const isSelf = actor.id === target.id;

  if (change.kind === "role") {
    if (!ASSIGNABLE_ROLES.includes(change.role)) return "Role-টি সঠিক নয়।";
    if (change.role === target.role) return null; // no-op, harmless
    if (isSelf) {
      return "নিজের Role নিজে পরিবর্তন করা যাবে না — এতে Admin Panel থেকে Lockout হয়ে যাওয়ার ঝুঁকি থাকে।";
    }
    if (target.role === "admin" && target.is_active) {
      const otherActiveAdmins = allUsers.filter(
        (u) => u.id !== target.id && u.role === "admin" && u.is_active,
      ).length;
      if (otherActiveAdmins === 0) {
        return "তিনি শেষ সক্রিয় Admin — আগে অন্য কাউকে Admin করুন, তারপর Role বদলানো যাবে।";
      }
    }
  }

  if (change.kind === "active") {
    if (change.isActive === target.is_active) return null; // no-op
    if (change.isActive === false) {
      if (isSelf) {
        return "নিজের Account নিজে নিষ্ক্রিয় করা যাবে না — এতে Admin Panel থেকে Lockout হয়ে যাবেন।";
      }
      if (target.role === "admin" && target.is_active) {
        const otherActiveAdmins = allUsers.filter(
          (u) => u.id !== target.id && u.role === "admin" && u.is_active,
        ).length;
        if (otherActiveAdmins === 0) {
          return "তিনি শেষ সক্রিয় Admin — তাঁকে নিষ্ক্রিয় করা যাবে না। আগে অন্য কাউকে Admin করুন।";
        }
      }
    }
  }

  if (change.kind === "profile") {
    const problem = validateProfileEdit(change.fullName, change.phone);
    if (problem) return problem;
  }

  return null;
}

export function validateProfileEdit(fullName: string, phone: string): string | null {
  const name = fullName.trim();
  if (name.length === 0) return "নাম খালি রাখা যাবে না।";
  if (name.length > 120) return "নাম ১২০ অক্ষরের মধ্যে রাখুন।";
  const p = phone.trim();
  if (p !== "" && !/^01[3-9]\d{8}$/.test(p)) {
    return "সঠিক বাংলাদেশি মোবাইল নম্বর দিন (01XXXXXXXXX), অথবা ফাঁকা রাখুন।";
  }
  return null;
}
