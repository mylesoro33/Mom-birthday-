import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { GMAIL_SCOPE, exchangeCode, fetchEmail } from "@/lib/google";
import { setSession } from "@/lib/session";
import { getSettings, saveGoogle } from "@/lib/store";

export const dynamic = "force-dynamic";

function back(error?: string) {
  const url = new URL("/connect", env.appUrl);
  if (error) url.searchParams.set("error", error);
  const res = NextResponse.redirect(url);
  res.cookies.delete({ name: "da_oauth_state", path: "/api/auth" });
  return res;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  if (params.get("error")) return back("Google sign-in was cancelled.");

  const state = params.get("state") ?? "";
  const expected = req.cookies.get("da_oauth_state")?.value ?? "";
  if (!state || !expected || !safeEqual(state, expected)) return back("Sign-in expired. Please try again.");

  const code = params.get("code");
  if (!code) return back("Google did not return an authorization code.");

  try {
    const tokens = await exchangeCode(code);
    const { email, verified } = await fetchEmail(tokens.access_token);
    if (!verified) return back("That Google account's email is not verified.");

    // Single-owner app: only ALLOWED_EMAIL (or, if unset, the first account ever connected) may sign in.
    const allowed = env.allowedEmail;
    const existing = (await getSettings()).googleEmail;
    if (allowed ? email !== allowed : existing && existing !== email) {
      return back(`${email} is not allowed to use this Door Alarm.`);
    }

    const grantedGmail = (tokens.scope ?? "").split(" ").includes(GMAIL_SCOPE);
    if (!grantedGmail) return back("Please tick the Gmail read permission so Door Alarm can see DoorDash emails.");

    await saveGoogle(email, tokens.refresh_token ?? null);
    if (!tokens.refresh_token && !(await getSettings()).hasGoogle) {
      return back("Google did not return offline access. Remove Door Alarm at myaccount.google.com/permissions and sign in again.");
    }
    await setSession(email);
    return back();
  } catch (e) {
    console.error("OAuth callback failed:", (e as Error).message);
    return back("Could not finish Google sign-in. Check the OAuth settings and try again.");
  }
}
