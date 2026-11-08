/**
 * sendWelcomeOnce — the ONE welcome-email routine (extracted
 * 2026-10-27 from verify-subscription so the new instant
 * subscribe flow sends the welcome through the exact same path).
 *
 * Sends the welcome email ONCE for a subscriber who has just
 * become verified: content comes from the single
 * welcome_email_settings row — while its is_active is false,
 * NOTHING is sent. Every attempt is logged in notice_deliveries
 * (kind 'welcome') through an idempotent claim, so no path can
 * ever produce a second welcome for the same subscriber. The
 * send is a courtesy layered AFTER the state change: any
 * failure is logged and swallowed — this function never throws.
 */

import { attemptDelivery, logEmailEvent, maskEmail } from "./email.ts";
import { buildEmailFooter } from "./emailFooter.ts";
import { createDeliveryLog } from "./deliveryLog.ts";
import { publicSiteBase } from "./subscriberMailer.ts";
import { signUnsubscribe } from "./subscribers.ts";
import { sendWelcomeEmail } from "./welcomeEmail.ts";

export async function sendWelcomeOnce(
  env: Record<string, string | undefined>,
  row: { id: string; email: string },
): Promise<void> {
  try {
    const secret = env.UNSUBSCRIBE_SIGNING_SECRET;
    if (!secret) {
      logEmailEvent({ event: "welcome_email_skipped_unconfigured" });
      return;
    }
    const deliveryLog = createDeliveryLog(env);
    const settings = await deliveryLog.readWelcomeSettings();
    if (!settings) {
      logEmailEvent({ event: "welcome_settings_missing" });
      return;
    }
    if (!settings.isActive) {
      logEmailEvent({ event: "welcome_skipped_inactive" });
      return;
    }
    const claim = await deliveryLog.claimWelcome(row.id, row.email);
    if (claim.state === "already-sent") {
      logEmailEvent({
        event: "welcome_already_sent",
        to: maskEmail(row.email),
      });
      return;
    }
    const signature = await signUnsubscribe(row.id, secret);
    const base = publicSiteBase(env);
    const link = `${base}/#/unsubscribe?t=${row.id}.${signature}`;
    // Owner's retry rule (2026-10-27): up to 3 tries with
    // backoff inside this one claim; only the FINAL outcome is
    // recorded, with the total try count added to the log's
    // attempts.
    const result = await attemptDelivery(() =>
      sendWelcomeEmail(
        env,
        row.email,
        buildEmailFooter(base),
        link,
        settings,
      )
    );
    const totalAttempts = claim.attempts + result.tries - 1;
    if (result.ok) {
      await deliveryLog.recordWelcomeOutcome(claim.id, totalAttempts, {
        status: "sent",
        providerMessageId: result.messageId,
      });
      logEmailEvent({
        event: "welcome_email_sent",
        to: maskEmail(row.email),
      });
    } else {
      await deliveryLog
        .recordWelcomeOutcome(claim.id, totalAttempts, {
          status: "failed",
          error: "welcome send failed after 3 attempts",
        })
        .catch(() => {});
      logEmailEvent({ event: "welcome_email_failed" });
    }
  } catch {
    logEmailEvent({ event: "welcome_email_failed" });
  }
}
