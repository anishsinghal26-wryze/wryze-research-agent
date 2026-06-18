// ============================================================================
// app/sales-pipeline/approvals/page.js   (URL: /sales-pipeline/approvals)
// ----------------------------------------------------------------------------
// Phase 6b: minimal Approvals review UI. Password-gated by the SAME sp_auth
// cookie as /sales-pipeline (the cookie is path-scoped to /sales-pipeline, so
// this page and the approve/reject routes live UNDER /sales-pipeline).
//
// Server component: gate -> load pending outreach approvals -> render client.
// NEVER sends anything; approve/reject only mark status.
// ============================================================================

import { cookies } from "next/headers";
import LoginForm from "../LoginForm";
import ApprovalsClient from "./ApprovalsClient";
import { listPendingOutreachApprovals } from "../../../lib/founderMemory";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Approvals · Wryze.ai",
};

export default async function ApprovalsPage() {
  // ---- Auth gate (same pattern + same cookie as /sales-pipeline) -----------
  const cookieStore = await cookies();
  const token = cookieStore.get("sp_auth")?.value;
  const expected = process.env.SALES_PIPELINE_PASSWORD;
  const isLoggedIn = Boolean(expected) && token === expected;

  if (!isLoggedIn) {
    return <LoginForm />;
  }

  // ---- Load pending approvals (null = load error) --------------------------
  const rows = await listPendingOutreachApprovals(25);
  const loadError = rows === null;

  return (
    <ApprovalsClient
      initialApprovals={loadError ? [] : rows}
      loadError={loadError}
    />
  );
}
