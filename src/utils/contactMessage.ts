/**
 * Contact-message subject handling (Phase C / C1, patched after
 * migration 0013).
 *
 * History: the form originally had no `subject` column to write
 * to, so the subject was bridged into the first line of `message`
 * ("বিষয়: <subject>" + a blank line). Migration 0013 (applied
 * 2026-10-23) added the real column and backfilled the bridged
 * rows, so WRITES no longer use the bridge at all — the form
 * stores the subject in its own column and the message verbatim.
 *
 * What remains here is the READ side, one resolver for the Admin
 * Panel:
 * - If the row's `subject` column is set, it wins and the message
 *   is shown verbatim (no parsing, no double prefix — ever).
 * - Only when the column is empty does `splitSubject` parse the
 *   legacy bridge prefix out of the message, so any row written
 *   before 0013 (or outside the form) still displays correctly.
 */

const SUBJECT_PREFIX = "বিষয়: ";

export interface SplitMessage {
  subject: string | null;
  body: string;
}

/** Parse the legacy bridge format out of a message body. */
export function splitSubject(message: string): SplitMessage {
  if (message.startsWith(SUBJECT_PREFIX)) {
    const nl = message.indexOf("\n");
    if (nl > SUBJECT_PREFIX.length) {
      const subject = message.slice(SUBJECT_PREFIX.length, nl).trim();
      const body = message.slice(nl + 1).replace(/^\n+/, "");
      if (subject) return { subject, body };
    }
  }
  return { subject: null, body: message };
}

/** The one display rule for a contact message (Admin Panel). */
export function resolveMessageDisplay(row: {
  subject: string | null;
  message: string;
}): SplitMessage {
  if (row.subject) return { subject: row.subject, body: row.message };
  return splitSubject(row.message);
}
