import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { authUrl } from "@/lib/google";

export const dynamic = "force-dynamic";

export async function GET() {
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl(state));
  res.cookies.set("da_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 600,
  });
  return res;
}
