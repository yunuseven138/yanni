// Hourly job for the traffic counter: deletes daily salts and visitor hashes about 30 minutes
// after their day ends (so none lives longer than ~25 hours) and rolls finished months up into
// one document each. Runs on the published production deploy only.
import { getStore } from "@netlify/blobs";
import type { Config } from "@netlify/functions";
import { runMaintenance, STORE_NAMES } from "../lib/traffic.mts";

export default async () => {
  const now = Date.now();
  const results = await Promise.allSettled(
    Object.values(STORE_NAMES).map((name) => runMaintenance(getStore({ name, consistency: "strong" }), now)),
  );
  results.forEach((result, i) => {
    const name = Object.values(STORE_NAMES)[i];
    if (result.status === "fulfilled") console.log(`[traffic-cleanup] ${name}:`, JSON.stringify(result.value));
    else console.error(`[traffic-cleanup] ${name} failed:`, result.reason);
  });
  if (results.some((r) => r.status === "rejected")) throw new Error("Traffic maintenance failed");
};

export const config: Config = {
  schedule: "@hourly",
};
