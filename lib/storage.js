// All reading/writing to Upstash Redis lives here, so the rest of the app
// never talks to the database directly. Upstash automatically converts objects
// to/from JSON, so we can store plain objects and strings.

import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

// --- Page snapshots (the raw text of each source) ---
export async function getSnapshot(id) {
  return await redis.get(`snapshot:latest:${id}`);
}

export async function saveSnapshot(id, text) {
  // Move the current "latest" into "previous" before overwriting it,
  // so we always keep the last two versions of each page.
  const old = await redis.get(`snapshot:latest:${id}`);
  if (old) {
    await redis.set(`snapshot:prev:${id}`, old);
  }
  await redis.set(`snapshot:latest:${id}`, text);
}

// --- Latest detected changes ---
export async function saveChanges(changes) {
  await redis.set("changes:latest", changes);
}

export async function getChanges() {
  return await redis.get("changes:latest");
}

// --- Latest founder brief ---
export async function saveBrief(brief) {
  await redis.set("brief:latest", brief);
}

export async function getBrief() {
  return await redis.get("brief:latest");
}

// --- Last run time / status ---
export async function saveRunStatus(status) {
  await redis.set("run:status", status);
}

export async function getRunStatus() {
  return await redis.get("run:status");
}
