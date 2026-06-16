// This route is called automatically by Vercel Cron (see vercel.json).
// It runs the SAT monitoring pipeline once.
//
// Security: if you set a CRON_SECRET env var, Vercel automatically sends it as
// "Authorization: Bearer <CRON_SECRET>". We verify it so random people can't
// trigger your job. If CRON_SECRET is not set, we allow the request (simplest).

import { runMonitor } from "../../../lib/runMonitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // allow up to 60s; we fetch several pages + call Claude

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
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
