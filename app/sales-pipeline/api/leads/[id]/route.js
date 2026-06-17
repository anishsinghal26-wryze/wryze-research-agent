import { cookies } from "next/headers";
import { getSupabaseServer } from "../../../../../lib/supabaseServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_STAGES = [
  "New",
  "Qualified",
  "Contacted",
  "Follow-up",
  "Interested",
  "Closed",
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(request, { params }) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("sp_auth")?.value;
    const expected = process.env.SALES_PIPELINE_PASSWORD;

    if (!expected || token !== expected) {
      return Response.json(
        { error: "Unauthorized (no valid sales-pipeline session)." },
        { status: 401 }
      );
    }

    const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
    const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

    if (!hasUrl || !hasKey) {
      console.error("[leads PATCH] Missing Supabase env", { hasUrl, hasKey });
      return Response.json(
        {
          error:
            "Server is missing Supabase configuration. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to this environment and redeploy.",
          code: "missing_env",
        },
        { status: 503 }
      );
    }

    const { id } = await params;

    if (!id) {
      return Response.json({ error: "Missing lead id." }, { status: 400 });
    }

    if (!UUID_RE.test(id)) {
      console.error("[leads PATCH] Non-UUID lead id:", id);
      return Response.json(
        {
          error:
            `Lead id "${id}" is not a UUID. The dashboard is showing sample data because the Supabase leads read failed.`,
          code: "invalid_uuid",
        },
        { status: 400 }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const updates = {};

    if (typeof body.pipeline_stage === "string") {
      if (!ALLOWED_STAGES.includes(body.pipeline_stage)) {
        return Response.json(
          { error: `Invalid pipeline_stage "${body.pipeline_stage}".` },
          { status: 400 }
        );
      }
      updates.pipeline_stage = body.pipeline_stage;
    }

    if (typeof body.notes === "string") {
      updates.notes = body.notes;
    }

    const supabase = getSupabaseServer();

    if (typeof body.outreach_draft === "string") {
      const { data: existing, error: readErr } = await supabase
        .from("leads")
        .select("metadata")
        .eq("id", id)
        .maybeSingle();

      if (readErr) {
        console.error("[leads PATCH] metadata read error:", readErr.message, readErr.code);
        return Response.json(
          { error: `Read failed: ${readErr.message}`, code: readErr.code },
          { status: 500 }
        );
      }

      if (!existing) {
        return Response.json(
          { error: "Lead not found.", code: "not_found" },
          { status: 404 }
        );
      }

      updates.metadata = {
        ...(existing.metadata || {}),
        outreach_draft: body.outreach_draft,
      };
    }

    if (Object.keys(updates).length === 0) {
      return Response.json(
        { error: "No valid fields to update." },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("leads")
      .update(updates)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("[leads PATCH] update error:", error.message, error.code);
      return Response.json(
        { error: error.message, code: error.code },
        { status: 500 }
      );
    }

    if (!data) {
      return Response.json(
        { error: "Lead not found (no row updated).", code: "not_found" },
        { status: 404 }
      );
    }

    return Response.json({ ok: true, lead: data });
  } catch (err) {
    console.error("[leads PATCH] Unhandled error:", err?.message);
    return Response.json(
      { error: err?.message || "Unknown server error.", code: "unhandled" },
      { status: 500 }
    );
  }
}
