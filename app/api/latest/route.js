// Read-only endpoint the homepage calls to show the latest brief, run status,
// and the list of monitored sources. No secrets are exposed here.

import { getBrief, getRunStatus } from "../../../lib/storage";
import { satSources } from "../../../lib/satSources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [brief, runStatus] = await Promise.all([getBrief(), getRunStatus()]);
    return Response.json({
      brief: brief || null,
      runStatus: runStatus || null,
      sources: satSources.map((s) => ({ name: s.name, url: s.url })),
    });
  } catch (err) {
    return Response.json(
      { brief: null, runStatus: null, sources: [], error: err.message },
      { status: 500 }
    );
  }
}
