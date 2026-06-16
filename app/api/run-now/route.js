// A manual trigger so you can test without waiting for the daily cron.
// Open in your browser:  /api/run-now?secret=YOUR_CRON_SECRET
// (or send "Authorization: Bearer YOUR_CRON_SECRET").
//
// If CRON_SECRET is not set, it runs without a secret (fine for early testing).

import { runMonitor } from "../../../lib/runMonitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  const secret = process.env.CRON_SECRET;

  if (secret) {
    const url = new URL(request.url);
    const fromQuery = url.searchParams.get("secret");
    const fromHeader = (request.headers.get("authorization") || "").replace(
      "Bearer ",
      ""
    );
    if (fromQuery !== secret && fromHeader !== secret) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const status = await runMonitor();
    return Response.json({ ok: true, status });
  } catch (err) {
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
}
