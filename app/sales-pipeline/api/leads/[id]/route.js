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

export async function PATCH(request, { params }) {
  const cookieStore = await cookies();
  const token = cookieStore.get("sp_auth")?.value;
  const expected = process.env.SALES_PIPELINE_PASSWORD;

  if (!expected || token !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ error: "Missing lead id." }, { status: 400 });
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
      return Response.json({ error: "Invalid pipeline_stage." }, { status: 400 });
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
      .single();

    if (readErr) {
      return Response.json({ error: readErr.message }, { status: 404 });
    }

    updates.metadata = {
      ...(existing?.metadata || {}),
      outreach_draft: body.outreach_draft,
    };
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, lead: data });
}
