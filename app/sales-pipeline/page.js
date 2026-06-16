// ============================================================================
// page.js
// ----------------------------------------------------------------------------
// This is the actual page Next.js shows at the URL:  /sales-pipeline
//
// In the App Router, a folder named "sales-pipeline" with a "page.js" inside
// automatically becomes a route. Because this is a brand-new folder, it cannot
// collide with or break any of your existing pages or API routes.
//
// This file is intentionally tiny: it just renders the dashboard component.
// Keeping the page itself small is a common, clean Next.js pattern.
// ============================================================================

import SalesPipelineClient from "./SalesPipelineClient";

// Optional: this sets the browser tab title for this page.
export const metadata = {
  title: "Sales Pipeline Agent · Wryze.ai",
};

export default function SalesPipelinePage() {
  return <SalesPipelineClient />;
}
