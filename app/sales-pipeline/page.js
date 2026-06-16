// ============================================================================
// app/sales-pipeline/page.js  (password-gated server component)
// ----------------------------------------------------------------------------
// Shown at the URL: /sales-pipeline
//
// Runs on the SERVER first and checks the login cookie:
//   - cookie missing/wrong -> show LoginForm (the dashboard data is NOT sent)
//   - cookie matches password -> show the real dashboard
//
// Uses only Next.js built-ins (next/headers). No new dependencies. Does not
// affect /monitor or any other route.
// ============================================================================

import { cookies } from "next/headers";
import SalesPipelineClient from "./SalesPipelineClient";
import LoginForm from "./LoginForm";

// Never cache this page. Every visit (including the browser Back button)
// re-runs the cookie check below, so a logged-out user can't see a cached
// dashboard. Scoped to this page only; does not affect other routes.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sales Pipeline Agent · Wryze.ai",
};

export default async function SalesPipelinePage() {
  // Read cookies on the server. (await works whether your Next.js version
  // returns this synchronously or as a promise, so it's safe either way.)
  const cookieStore = await cookies();
  const token = cookieStore.get("sp_auth")?.value;

  const expected = process.env.SALES_PIPELINE_PASSWORD;

  // Logged in ONLY if the env var is set AND the cookie matches it exactly.
  const isLoggedIn = Boolean(expected) && token === expected;

  if (!isLoggedIn) {
    return <LoginForm />;
  }

  return <SalesPipelineClient />;
}
