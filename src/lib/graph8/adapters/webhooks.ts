import "server-only";
import { z } from "zod";
import { graph8, parseResponse } from "../client";

// GET /webhooks -> { data: Webhook[] } (verified empty 2026-09-26). The secret is only returned on create and is never read here.

const WebhookDto = z.object({
  id: z.string(),
  name: z.string().nullish(),
  url: z.string(),
  events: z.array(z.string()).nullish(),
  is_active: z.boolean().nullish(),
});

export type Webhook = { id: string; name: string | null; url: string; events: string[]; active: boolean };

export async function listWebhooks(): Promise<Webhook[]> {
  const operation = "list webhooks";
  const json = await graph8.get("/webhooks", { operation });
  return parseResponse(z.object({ data: z.array(WebhookDto) }), json, operation).data.map((w) => ({
    id: w.id,
    name: w.name ?? null,
    url: w.url,
    events: w.events ?? [],
    active: w.is_active ?? true,
  }));
}
