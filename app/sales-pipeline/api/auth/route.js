// ============================================================================
// app/sales-pipeline/api/auth/route.js
// Tiny API route at /sales-pipeline/api/auth used only by the login form.
// Validates the password against SALES_PIPELINE_PASSWORD and sets a login
// cookie. Uses only Next.js built-ins -> no new dependencies.
// ============================================================================

import { NextResponse } from "next/server";

export async function POST(request) {
  // Read the password the user typed into the login form.
  let password = "";
  try {
    const body = await request.json();
    password = body.password || "";
  } catch (e) {
    password = "";
  }

  // The correct password is read from an environment variable on the server.
  const expected = process.env.SALES_PIPELINE_PASSWORD;

  // Safety: if the env var was never set, refuse rather than letting everyone in.
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "Server is not configured with a password yet." },
      { status: 500 }
    );
  }

  // Wrong password -> reject. The dashboard will NOT be shown.
  if (password !== expected) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Correct password -> set a login cookie and report success.
  const res = NextResponse.json({ ok: true });
  res.cookies.set("sp_auth", expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // off on localhost so testing works
    path: "/", // site-wide so it also covers /agent-command-center (Phase 8.5)
    maxAge: 60 * 60 * 8, // stays logged in 8 hours
  });
  return res;
}
