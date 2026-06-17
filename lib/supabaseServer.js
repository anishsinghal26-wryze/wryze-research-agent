// ============================================================================
// lib/supabaseServer.js
// ----------------------------------------------------------------------------
// SERVER-ONLY Supabase client for Wryze Founder OS V1.
//
// This client is created with the SERVICE ROLE KEY, which bypasses Row Level
// Security. That is fine because it ONLY ever runs on the server (API routes,
// server components, cron jobs).
//
// HARD RULES:
//   - Never import this file into a file that begins with "use client".
//   - Never expose SUPABASE_SERVICE_ROLE_KEY to the browser.
//   - The only public value here is NEXT_PUBLIC_SUPABASE_URL (safe to expose).
//
// Phase 1 note: nothing in the existing app imports this yet. It is wiring that
// later phases (connecting the Sales Dashboard, research_reports, etc.) will use.
// ============================================================================

import { createClient } from "@supabase/supabase-js";

let cachedClient = null;

export function getSupabaseServer() {
  if (cachedClient) return cachedClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and " +
        "SUPABASE_SERVICE_ROLE_KEY in your environment (.env.local locally, " +
        "or Vercel Project Settings → Environment Variables)."
    );
  }

  cachedClient = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return cachedClient;
}

export default getSupabaseServer;
