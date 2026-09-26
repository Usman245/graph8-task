import "server-only";
import { cookies } from "next/headers";
import { AppRequestError } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import type { Deal } from "@/lib/graph8/adapters/deals";
import { DEMO_TITLE_PREFIX } from "./manifest";
import type { Mode } from "./schemas";

export const MODE_COOKIE = "pg_mode";

/** The viewer's selected mode (a UI preference). Each review stores its own mode separately. */
export async function currentMode(): Promise<Mode> {
  const demoEnabled = env().PROMISEGUARD_DEMO_ENABLED;
  const value = (await cookies()).get(MODE_COOKIE)?.value;
  if (value === "live") return "live";
  if (value === "demo" && demoEnabled) return "demo";
  return demoEnabled ? "demo" : "live";
}

export function isDemoDeal(deal: Pick<Deal, "name">): boolean {
  return deal.name.startsWith(DEMO_TITLE_PREFIX);
}

/** Demo mode works only on "[PromiseGuard Demo]" deals; live mode never uses them. */
export function assertDealMatchesMode(deal: Deal, mode: Mode) {
  if (mode === "demo" && !env().PROMISEGUARD_DEMO_ENABLED) {
    throw new AppRequestError("demo_disabled", "Demo mode is disabled on this server.", 403);
  }
  if (mode === "demo" && !isDemoDeal(deal)) {
    throw new AppRequestError("mode_mismatch", "Demo mode only runs on [PromiseGuard Demo] deals. Switch to Live mode for real deals.", 409);
  }
  if (mode === "live" && isDemoDeal(deal)) {
    throw new AppRequestError("mode_mismatch", "This is a [PromiseGuard Demo] deal. Switch to Demo mode to review it.", 409);
  }
}
