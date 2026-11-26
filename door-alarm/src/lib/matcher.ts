export const DEFAULT_PHRASES = ["has arrived", "is outside", "delivered", "your dasher is here"];
export const DEFAULT_IGNORE = ["% off", "promo", "deal", "dashpass", "free delivery", "save $"];

/** Parse a textarea (one phrase per line, or comma-separated) into clean, lowercase phrases. */
export function parsePhrases(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/[\n,]/)) {
    const p = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (p && p.length <= 100) seen.add(p);
  }
  return [...seen].slice(0, 50);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
}

/**
 * Returns the first arrival phrase found in the text, or null.
 * Text matching any ignore phrase (marketing language) never matches.
 */
export function findArrivalPhrase(text: string, phrases: string[], ignore: string[]): string | null {
  const t = normalize(text);
  if (ignore.some((p) => p && t.includes(normalize(p)))) return null;
  return phrases.find((p) => p && t.includes(normalize(p))) ?? null;
}

/** True if the From header is an address at doordash.com or a subdomain of it. */
export function isDoorDashSender(fromHeader: string): boolean {
  const m = fromHeader.match(/<([^>]+)>/);
  const addr = (m ? m[1] : fromHeader).trim().toLowerCase();
  const domain = addr.split("@")[1] ?? "";
  return domain === "doordash.com" || domain.endsWith(".doordash.com");
}
