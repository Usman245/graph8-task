import { ok } from "@/lib/api/result";
import { withSession } from "@/lib/auth/guard";
import { dealPage } from "@/lib/promiseguard/context";
import { currentMode } from "@/lib/promiseguard/mode";

export const GET = withSession(async (req) => {
  const url = new URL(req.url);
  const page = Math.max(1, Math.min(1000, Number(url.searchParams.get("page")) || 1));
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 100);
  const mode = await currentMode();
  return ok({ mode, ...(await dealPage(mode, page, search)) });
});
