import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sign, unsign } from "./crypto";
import { env } from "./env";

const COOKIE = "da_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function setSession(email: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  (await cookies()).set(COOKIE, sign(`${email}|${exp}`, env.sessionSecret), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function getSessionEmail(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const value = unsign(raw, env.sessionSecret);
  if (!value) return null;
  const [email, exp] = value.split("|");
  if (!email || Number(exp) < Date.now() / 1000) return null;
  return email;
}

/** For pages and server actions that need a signed-in owner. */
export async function requireSession(): Promise<string> {
  const email = await getSessionEmail();
  if (!email) redirect("/connect");
  return email;
}
