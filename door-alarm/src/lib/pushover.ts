export const SOUNDS = [
  ["persistent", "Persistent (long)"],
  ["siren", "Siren"],
  ["alien", "Alien alarm (long)"],
  ["spacealarm", "Space alarm"],
  ["echo", "Pushover echo (long)"],
  ["updown", "Up down (long)"],
  ["climb", "Climb (long)"],
  ["tugboat", "Tugboat"],
  ["bugle", "Bugle"],
  ["mechanical", "Mechanical"],
  ["pushover", "Pushover"],
] as const;

export const RETRY_SECONDS = 30;
export const EXPIRE_SECONDS = 300;

type PushoverResult = { status: number; request?: string; receipt?: string; errors?: string[] };

export async function sendEmergency(opts: {
  user: string;
  token: string;
  title: string;
  message: string;
  sound: string;
  url?: string;
}): Promise<{ receipt: string }> {
  const res = await fetch("https://api.pushover.net/1/messages.json", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token: opts.token,
      user: opts.user,
      title: opts.title,
      message: opts.message,
      priority: "2", // emergency: repeats until acknowledged; can bypass silent/DND as a critical alert
      retry: String(RETRY_SECONDS),
      expire: String(EXPIRE_SECONDS),
      sound: opts.sound,
      ...(opts.url ? { url: opts.url, url_title: "Open Door Alarm" } : {}),
    }),
    cache: "no-store",
  });
  const j = (await res.json().catch(() => ({ status: 0 }))) as PushoverResult;
  if (!res.ok || j.status !== 1 || !j.receipt) {
    throw new Error(`Pushover rejected the alert: ${j.errors?.join("; ") ?? `HTTP ${res.status}`}`);
  }
  return { receipt: j.receipt };
}

export type ReceiptStatus = {
  acknowledged: boolean;
  acknowledgedAt: Date | null;
  expired: boolean;
  lastDeliveredAt: Date | null;
};

export async function getReceipt(token: string, receipt: string): Promise<ReceiptStatus | null> {
  const res = await fetch(
    `https://api.pushover.net/1/receipts/${encodeURIComponent(receipt)}.json?token=${encodeURIComponent(token)}`,
    { cache: "no-store" },
  );
  if (!res.ok) return null;
  const j = (await res.json()) as {
    acknowledged: number;
    acknowledged_at: number;
    expired: number;
    last_delivered_at: number;
  };
  const ts = (n: number) => (n ? new Date(n * 1000) : null);
  return {
    acknowledged: j.acknowledged === 1,
    acknowledgedAt: ts(j.acknowledged_at),
    expired: j.expired === 1,
    lastDeliveredAt: ts(j.last_delivered_at),
  };
}

export async function cancelReceipt(token: string, receipt: string) {
  await fetch(`https://api.pushover.net/1/receipts/${encodeURIComponent(receipt)}/cancel.json`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
}

/** Pushover user/group keys and app tokens are 30 characters, [A-Za-z0-9]. */
export function looksLikePushoverKey(s: string) {
  return /^[A-Za-z0-9]{30}$/.test(s);
}
