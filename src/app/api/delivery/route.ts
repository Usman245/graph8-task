import { ok } from "@/lib/api/result";
import { withSession } from "@/lib/auth/guard";
import { deliveryBoard } from "@/lib/promiseguard/delivery";
import { currentMode } from "@/lib/promiseguard/mode";
export const GET = withSession(async () => ok(await deliveryBoard(await currentMode())));
