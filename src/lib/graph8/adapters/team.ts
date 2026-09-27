import "server-only";
import { z } from "zod";
import { graph8, parseResponse } from "../client";

export async function listDeliveryOwners(): Promise<
  Array<{ id: string; name: string }>
> {
  const operation = "list delivery owners";
  const json = await graph8.get("/team-members", { operation });
  const result = parseResponse(
    z.object({
      data: z.object({
        items: z.array(
          z.object({
            id: z.union([z.string(), z.number()]),
            name: z.string(),
            status: z.string().nullish(),
          }),
        ),
      }),
    }),
    json,
    operation,
  );
  return result.data.items
    .filter(
      (m) =>
        !["inactive", "disabled", "archived"].includes(
          (m.status ?? "").toLowerCase(),
        ),
    )
    .map((m) => ({ id: String(m.id), name: m.name }));
}
