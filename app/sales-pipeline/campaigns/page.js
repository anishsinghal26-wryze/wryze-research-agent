// ============================================================================
// app/sales-pipeline/campaigns/page.js   (URL: /sales-pipeline/campaigns)
// ----------------------------------------------------------------------------
// Phase 21: Campaign Builder / Batch Lead Discovery. Gated by the SAME sp_auth
// cookie as the rest of /sales-pipeline. Lists campaigns (read-only on load)
// and lets the founder create a campaign + click to run batch discovery.
// Discovery NEVER runs on page load — only via the founder-clicked button that
// calls the discover API route. Never sends, never drafts, never approves.
// ============================================================================

import { cookies } from "next/headers";
import LoginForm from "../LoginForm";
import CampaignsClient from "./CampaignsClient";
import { listSalesCampaigns } from "../../../lib/founderMemory";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Campaigns · Wryze.ai",
};

export default async function CampaignsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sp_auth")?.value;
  const expected = process.env.SALES_PIPELINE_PASSWORD;
  const isLoggedIn = Boolean(expected) && token === expected;
  if (!isLoggedIn) {
    return <LoginForm />;
  }

  const res = await listSalesCampaigns();
  const loadError = res === null;
  const campaigns = res ? res.campaigns : [];

  return <CampaignsClient campaigns={campaigns} loadError={loadError} />;
}
