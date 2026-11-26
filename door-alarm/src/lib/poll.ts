import { env } from "./env";
import { getMessageMeta, listDoorDashIds } from "./gmail";
import { refreshAccessToken } from "./google";
import { findArrivalPhrase, isDoorDashSender } from "./matcher";
import { sendEmergency } from "./pushover";
import { inQuietHours } from "./quiet-hours";
import {
  claimMessage,
  getSecrets,
  getSettings,
  logEvent,
  markNeedsReconnect,
  pruneProcessed,
  recordAlertSent,
  recordPoll,
} from "./store";

/** Ignore matching mail older than this (e.g. after downtime) so you don't get a stale alarm. */
const MAX_AGE_MINUTES = 30;
/** How far back each poll searches. Overlap is harmless: processed ids are de-duplicated. */
const LOOKBACK_MINUTES = 120;

export type PollResult = { status: string; checked: number; alerts: number };

export async function poll(): Promise<PollResult> {
  const s = await getSettings();
  if (!s.enabled) return { status: "disabled", checked: 0, alerts: 0 };
  if (!s.hasGoogle || s.needsReconnect) return { status: "gmail-not-connected", checked: 0, alerts: 0 };

  const secrets = await getSecrets();
  if (!secrets.refreshToken) {
    await markNeedsReconnect();
    await recordPoll("Stored Google token could not be read. Sign in again.");
    return { status: "gmail-not-connected", checked: 0, alerts: 0 };
  }
  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(secrets.refreshToken);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "invalid_grant") {
      await markNeedsReconnect();
      await logEvent({ kind: "error", detail: "Google access expired or was revoked. Sign in again on the Connect page." });
    }
    await recordPoll(`Token refresh failed${code ? ` (${code})` : ""}`);
    return { status: "token-error", checked: 0, alerts: 0 };
  }

  const now = new Date();
  const since = new Date(Math.max(s.watchSince.getTime(), now.getTime() - LOOKBACK_MINUTES * 60_000));
  let checked = 0;
  let alerts = 0;
  // One alarm per poll is plenty, even if several arrival emails land together.
  let alertedThisRun = false;
  let lastAlertAt = s.lastAlertAt;

  try {
    const ids = await listDoorDashIds(accessToken, since);
    // Oldest first, so the log reads in order.
    for (const id of ids.reverse()) {
      const msg = await getMessageMeta(accessToken, id);
      if (!(await claimMessage(id))) continue; // already handled by an earlier/overlapping run
      checked++;

      if (!isDoorDashSender(msg.from)) continue; // belt-and-braces on top of the Gmail query

      const phrase = findArrivalPhrase(`${msg.subject}\n${msg.snippet}`, s.phrases, s.ignorePhrases);
      if (!phrase) continue;

      await logEvent({ kind: "detection", messageId: id, subject: msg.subject, phrase });

      const ageMin = (now.getTime() - msg.receivedAt.getTime()) / 60_000;
      if (ageMin > MAX_AGE_MINUTES) {
        await logEvent({ kind: "suppressed", messageId: id, subject: msg.subject, detail: `Email is ${Math.round(ageMin)} min old` });
        continue;
      }
      if (alertedThisRun) {
        await logEvent({ kind: "suppressed", messageId: id, subject: msg.subject, detail: "Already alerted this minute" });
        continue;
      }
      if (lastAlertAt && now.getTime() - lastAlertAt.getTime() < s.cooldownMinutes * 60_000) {
        const mins = Math.round((now.getTime() - lastAlertAt.getTime()) / 60_000);
        await logEvent({
          kind: "suppressed",
          messageId: id,
          subject: msg.subject,
          detail: `Cooldown: last alert ${mins} min ago (cooldown ${s.cooldownMinutes} min)`,
        });
        continue;
      }
      if (s.quietEnabled && inQuietHours(now, s.quietStart, s.quietEnd, s.timezone)) {
        await logEvent({
          kind: "suppressed",
          messageId: id,
          subject: msg.subject,
          detail: `Quiet hours (${s.quietStart}–${s.quietEnd})`,
        });
        continue;
      }
      if (!secrets.pushoverUser || !secrets.pushoverToken) {
        await logEvent({ kind: "error", messageId: id, detail: "Pushover keys are not set on the Connect page" });
        continue;
      }

      try {
        const { receipt } = await sendEmergency({
          user: secrets.pushoverUser,
          token: secrets.pushoverToken,
          title: "🚪 DoorDash is here",
          message: msg.subject || "Your DoorDash order has arrived.",
          sound: s.sound,
          url: `${env.appUrl}/log`,
        });
        await recordAlertSent();
        await logEvent({ kind: "alert", messageId: id, subject: msg.subject, phrase, receipt });
        alertedThisRun = true;
        lastAlertAt = new Date();
        alerts++;
      } catch (e) {
        await logEvent({ kind: "error", messageId: id, detail: (e as Error).message });
      }
    }
    await recordPoll(null);
  } catch (e) {
    // Only the error message (e.g. "Gmail API 429") is stored — never message content.
    await recordPoll((e as Error).message);
    return { status: "error", checked, alerts };
  }

  if (Math.random() < 0.02) await pruneProcessed();
  return { status: "ok", checked, alerts };
}
