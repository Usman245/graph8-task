import { ok } from "@/lib/api/result";
import { withSession } from "@/lib/auth/guard";
import { guardBoard } from "@/lib/promiseguard/guard";
import { currentMode } from "@/lib/promiseguard/mode";

// Quote Guard board: every recent quote in the current mode with its send-gate state and autopilot activity.
export const GET = withSession(async () => ok(await guardBoard(await currentMode())));
