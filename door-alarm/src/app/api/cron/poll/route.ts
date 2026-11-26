import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { env } from "@/lib/env";
import { poll } from "@/lib/poll";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Vercel Cron calls this with "Authorization: Bearer $CRON_SECRET".
// An external scheduler (e.g. cron-job.org) can send the same header.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization") ?? "";
  if (!safeEqual(auth, `Bearer ${env.cronSecret}`)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await poll());
  } catch (e) {
    console.error("poll failed:", (e as Error).message);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
