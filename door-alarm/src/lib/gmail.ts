const API = "https://gmail.googleapis.com/gmail/v1/users/me";

export type DoorDashMessage = {
  id: string;
  from: string;
  subject: string;
  /** Gmail's short preview of the body. Used in memory for matching only — never stored or logged. */
  snippet: string;
  receivedAt: Date;
};

async function gget<T>(accessToken: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gmail API ${res.status} on ${path.split("?")[0]}`);
  return (await res.json()) as T;
}

/**
 * List DoorDash message ids received after `since`.
 * The search query restricts results to DoorDash senders server-side, so other mail is never fetched.
 */
export async function listDoorDashIds(accessToken: string, since: Date): Promise<string[]> {
  const q = `from:doordash.com -category:promotions after:${Math.floor(since.getTime() / 1000)}`;
  const j = await gget<{ messages?: { id: string }[] }>(
    accessToken,
    `/messages?maxResults=20&q=${encodeURIComponent(q)}`,
  );
  return (j.messages ?? []).map((m) => m.id);
}

/** Fetch headers + snippet only (format=metadata). The full body is never downloaded. */
export async function getMessageMeta(accessToken: string, id: string): Promise<DoorDashMessage> {
  const j = await gget<{
    id: string;
    snippet?: string;
    internalDate?: string;
    payload?: { headers?: { name: string; value: string }[] };
  }>(accessToken, `/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`);
  const header = (n: string) => j.payload?.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
  return {
    id: j.id,
    from: header("from"),
    subject: header("subject"),
    snippet: j.snippet ?? "",
    receivedAt: new Date(Number(j.internalDate ?? Date.now())),
  };
}
