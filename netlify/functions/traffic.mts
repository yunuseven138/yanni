// Anonymous traffic counter API: POST /api/hit, GET /api/stats, GET|POST /api/owner.
// The logic lives in ../lib/traffic.mts (shared with the hourly clean-up job).
import { getStore } from "@netlify/blobs";
import type { Config, Context } from "@netlify/functions";
import { handleTrafficRequest, STORE_NAMES } from "../lib/traffic.mts";

export default (request: Request, context: Context) => {
  // Site-wide stores are shared by every deploy. Keep deploy previews and branch deploys (whose
  // visitors are mostly the owner, on a host where the ys_owner cookie isn't set) out of the real
  // numbers by giving them the test store.
  const preview = context.deploy?.context === "deploy-preview" || context.deploy?.context === "branch-deploy";
  return handleTrafficRequest(request, context, {
    store: (ns) => getStore({ name: STORE_NAMES[preview ? "test" : ns], consistency: "strong" }),
  });
};

export const config: Config = {
  path: ["/api/hit", "/api/stats", "/api/owner"],
  // Never list HEAD here: Netlify rejects it in function method lists.
  method: ["GET", "POST"],
};
