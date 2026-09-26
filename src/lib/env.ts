import "server-only";
import { z } from "zod";

const intFromEnv = (fallback: number) =>
  z.coerce.number().int().positive().default(fallback);

const EnvSchema = z.object({
  GRAPH8_BASE_URL: z.url().default("https://be.graph8.com/api/v1"),
  GRAPH8_API_KEY: z.string().optional(),
  GRAPH8_WORKFLOW_ID: z.string().optional(),
  GRAPH8_SKILL_ID: z.string().optional(),
  GRAPH8_MODEL_ID: z.string().optional(),
  PROMISEGUARD_APP_PASSWORD: z.string().optional(),
  PROMISEGUARD_SESSION_SECRET: z.string().optional(),
  PROMISEGUARD_SELLER_DOMAINS: z.string().default(""),
  PROMISEGUARD_ASSIGNEES: z.string().default(""),
  // Enables Demo mode (labeled sample conversation). Graph8 AI and storage are live in both modes.
  PROMISEGUARD_DEMO_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),
  // Autopilot: public base URL Graph8 can reach (for the webhook) and the shared token in the webhook URL.
  PROMISEGUARD_PUBLIC_URL: z.url().optional(),
  PROMISEGUARD_WEBHOOK_TOKEN: z.string().min(24).optional(),
  // Quiet period after a quote.created / quote.updated event before the automatic review starts.
  PROMISEGUARD_AUTOPILOT_DELAY_SECONDS: z.coerce.number().int().min(0).max(600).default(15),
  PROMISEGUARD_MAX_SOURCES: intFromEnv(5),
  PROMISEGUARD_MAX_SOURCE_CHARS: intFromEnv(40000),
  PROMISEGUARD_MAX_QUOTE_CHARS: intFromEnv(12000),
  PROMISEGUARD_MAX_FINDINGS: intFromEnv(12),
  PROMISEGUARD_MAX_REPORT_BYTES: intFromEnv(24000),
});

export type AppEnv = z.infer<typeof EnvSchema> & {
  sellerDomains: string[];
  assignees: Array<{ id: string; name: string }>;
};

let cached: AppEnv | null = null;

/** Server-only configuration. Never import from a client component. */
export function env(): AppEnv {
  if (cached) return cached;
  const parsed = EnvSchema.parse(emptyToUndefined(process.env));
  const base = new URL(parsed.GRAPH8_BASE_URL);
  if (base.protocol !== "https:") {
    throw new Error("GRAPH8_BASE_URL must use https");
  }
  cached = {
    ...parsed,
    sellerDomains: splitList(parsed.PROMISEGUARD_SELLER_DOMAINS).map((d) =>
      d.toLowerCase(),
    ),
    // Format: "teamMemberId:Display Name,teamMemberId2:Other Name" (Graph8 team-member IDs are accepted as task assignees).
    assignees: splitList(parsed.PROMISEGUARD_ASSIGNEES).flatMap((entry) => {
      const idx = entry.indexOf(":");
      if (idx <= 0) return [];
      return [{ id: entry.slice(0, idx).trim(), name: entry.slice(idx + 1).trim() }];
    }),
  };
  return cached;
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function emptyToUndefined(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = value === "" ? undefined : value;
  }
  return out;
}
