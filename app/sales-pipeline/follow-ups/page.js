// ============================================================================
// app/sales-pipeline/follow-ups/page.js   (URL: /sales-pipeline/follow-ups)
// ----------------------------------------------------------------------------
// Phase 16: READ-ONLY CRM / Follow-ups overview. Gated by the SAME sp_auth
// cookie + SALES_PIPELINE_PASSWORD as the rest of /sales-pipeline. Loads the
// manual-send + follow-up activity (via listFollowUpOverview) and renders a
// read-only dashboard. NEVER writes, NEVER sends, no editing here.
// ============================================================================

import { cookies } from "next/headers";
import LoginForm from "../LoginForm";
import FollowUpsClient from "./FollowUpsClient";
import { listFollowUpOverview } from "../../../lib/founderMemory";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Follow-ups · Wryze.ai",
};

export default async function FollowUpsPage() {
  // ---- Auth gate (same cookie + pattern as /sales-pipeline) ----------------
  const cookieStore = await cookies();
  const token = cookieStore.get("sp_auth")?.value;
  const expected = process.env.SALES_PIPELINE_PASSWORD;
  const isLoggedIn = Boolean(expected) && token === expected;
  if (!isLoggedIn) {
    return <LoginForm />;
  }

  const rows = await listFollowUpOverview();
  const loadError = rows === null;

  return <FollowUpsClient items={loadError ? [] : rows} loadError={loadError} />;
}
