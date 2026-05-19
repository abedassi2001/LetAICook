import { NextResponse } from "next/server";

/** Plain health check for Cloud Run / browser diagnostics (no Firebase). */
export function GET() {
  return NextResponse.json({ ok: true, service: "letaicook-web" });
}
