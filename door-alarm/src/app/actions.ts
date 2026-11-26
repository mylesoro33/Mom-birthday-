"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { env } from "@/lib/env";
import { revoke } from "@/lib/google";
import { parsePhrases } from "@/lib/matcher";
import { poll } from "@/lib/poll";
import { SOUNDS, cancelReceipt, looksLikePushoverKey, sendEmergency } from "@/lib/pushover";
import { isValidTimeZone } from "@/lib/quiet-hours";
import { requireSession } from "@/lib/session";
import {
  disconnectGoogle,
  getSecrets,
  getSettings,
  logEvent,
  savePushover,
  saveSettings,
} from "@/lib/store";

const go = (path: string, params: Record<string, string>): never => redirect(`${path}?${new URLSearchParams(params)}`);

export async function savePushoverAction(form: FormData) {
  await requireSession();
  const current = await getSecrets();
  const user = String(form.get("user") ?? "").trim() || current.pushoverUser || "";
  const token = String(form.get("token") ?? "").trim() || current.pushoverToken || "";
  if (!looksLikePushoverKey(user)) go("/connect", { error: "That Pushover user key doesn't look right (30 letters and numbers)." });
  if (!looksLikePushoverKey(token)) go("/connect", { error: "That Pushover app token doesn't look right (30 letters and numbers)." });
  await savePushover(user, token);
  revalidatePath("/", "layout");
  go("/connect", { ok: "Pushover keys saved. Send a test alarm next." });
}

export async function disconnectGmailAction() {
  await requireSession();
  const { refreshToken } = await getSecrets();
  if (refreshToken) await revoke(refreshToken);
  await disconnectGoogle();
  revalidatePath("/", "layout");
  go("/connect", { ok: "Gmail disconnected and Google access revoked." });
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function saveSettingsAction(form: FormData) {
  await requireSession();
  const phrases = parsePhrases(String(form.get("phrases") ?? ""));
  const ignorePhrases = parsePhrases(String(form.get("ignore") ?? ""));
  const cooldown = Math.round(Number(form.get("cooldown")));
  const quietStart = String(form.get("quietStart") ?? "22:00");
  const quietEnd = String(form.get("quietEnd") ?? "07:00");
  const timezone = String(form.get("timezone") ?? "");
  const sound = String(form.get("sound") ?? "persistent");

  if (phrases.length === 0) go("/settings", { error: "Add at least one arrival phrase." });
  if (!Number.isFinite(cooldown) || cooldown < 0 || cooldown > 240) go("/settings", { error: "Cooldown must be 0–240 minutes." });
  if (!HHMM.test(quietStart) || !HHMM.test(quietEnd)) go("/settings", { error: "Quiet hours need times like 22:00." });
  if (!isValidTimeZone(timezone)) go("/settings", { error: "Unknown time zone." });
  if (!SOUNDS.some(([v]) => v === sound)) go("/settings", { error: "Unknown sound." });

  await saveSettings({
    enabled: form.get("enabled") === "on",
    phrases,
    ignorePhrases,
    cooldownMinutes: cooldown,
    quietEnabled: form.get("quietEnabled") === "on",
    quietStart,
    quietEnd,
    timezone,
    sound,
  });
  revalidatePath("/", "layout");
  go("/settings", { ok: "Settings saved." });
}

export async function sendTestAction() {
  await requireSession();
  const [s, secrets] = await Promise.all([getSettings(), getSecrets()]);
  if (!secrets.pushoverUser || !secrets.pushoverToken) go("/test", { error: "Add your Pushover keys on the Connect page first." });
  let receipt = "";
  try {
    ({ receipt } = await sendEmergency({
      user: secrets.pushoverUser!,
      token: secrets.pushoverToken!,
      title: "🚪 Door Alarm test",
      message: "This is a test. Tap to acknowledge and stop the alarm.",
      sound: s.sound,
      url: `${env.appUrl}/test`,
    }));
  } catch (e) {
    await logEvent({ kind: "error", detail: (e as Error).message });
    go("/test", { error: (e as Error).message });
  }
  await logEvent({ kind: "test", receipt, detail: "Test alarm sent" });
  go("/test", { receipt });
}

export async function cancelAlarmAction(form: FormData) {
  await requireSession();
  const receipt = String(form.get("receipt") ?? "");
  const back = String(form.get("back") ?? "/log") === "/test" ? "/test" : "/log";
  const { pushoverToken } = await getSecrets();
  if (pushoverToken && /^[A-Za-z0-9]{30}$/.test(receipt)) await cancelReceipt(pushoverToken, receipt);
  go(back, back === "/test" ? { receipt, ok: "Alarm cancelled." } : { ok: "Alarm cancelled." });
}

export async function checkNowAction() {
  await requireSession();
  const r = await poll();
  revalidatePath("/log");
  const label: Record<string, string> = {
    ok: `Checked ${r.checked} new DoorDash email${r.checked === 1 ? "" : "s"}${r.alerts ? `, sent ${r.alerts} alert` : ""}.`,
    disabled: "Door Alarm is switched off in Settings.",
    "gmail-not-connected": "Gmail isn't connected.",
    "token-error": "Couldn't refresh Google access. Try signing in again.",
    error: "Gmail check failed. See the status on the Connect page.",
  };
  go("/log", { ok: label[r.status] ?? r.status });
}
