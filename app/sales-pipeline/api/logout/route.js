// ============================================================================
// app/sales-pipeline/api/logout/route.js
// Tiny API route at /sales-pipeline/api/logout used only by the Logout button.
//
// It clears the "sp_auth" login cookie (the same cookie the password gate
// checks) by overwriting it with an empty value that expires immediately.
// After this runs, reloading /sales-pipeline shows the password screen again.
//
// Uses only Next.js built-ins (next/server) -> no new dependencies. Does not
// change the password logic and does not affect /monitor or other routes.
// ============================================================================

import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });

  // Clear the cookie: same name and same path it was set with, empty value,
  // and maxAge 0 so the browser deletes it right away.
  res.cookies.set("sp_auth", "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/sales-pipeline",
    maxAge: 0,
  });

  return res;
}
