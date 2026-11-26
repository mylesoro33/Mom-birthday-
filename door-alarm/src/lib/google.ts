import { env } from "./env";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const SCOPES = ["openid", "email", GMAIL_SCOPE];

export function redirectUri() {
  return `${env.appUrl}/api/auth/callback`;
}

export function authUrl(state: string) {
  const p = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // always return a refresh token
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      ...body,
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok) {
    const err = new Error(`Google token error: ${json.error ?? res.status}`) as Error & { code?: string };
    err.code = json.error;
    throw err;
  }
  return json;
}

export function exchangeCode(code: string) {
  return tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri() });
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const t = await tokenRequest({ refresh_token: refreshToken, grant_type: "refresh_token" });
  return t.access_token;
}

export async function fetchEmail(accessToken: string): Promise<{ email: string; verified: boolean }> {
  const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`userinfo failed: ${res.status}`);
  const j = (await res.json()) as { email?: string; email_verified?: boolean };
  if (!j.email) throw new Error("Google did not return an email address");
  return { email: j.email.toLowerCase(), verified: !!j.email_verified };
}

export async function revoke(token: string) {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => {});
}
