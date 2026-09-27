import "server-only";
import { z } from "zod";
import { graph8, parseResponse, path } from "../client";

// Verified: GET /deals -> { data: Deal[], pagination }; GET /deals/{id} -> { data: Deal }.

const ContactBrief = z.object({
  id: z.union([z.number(), z.string()]),
  name: z.string().nullish(),
  email: z.string().nullish(),
  title: z.string().nullish(),
});

const DealDto = z.object({
  id: z.string(),
  name: z.string().nullish(),
  amount: z.number().nullish(),
  currency: z.string().nullish(),
  stage_name: z.string().nullish(),
  company_id: z.union([z.number(), z.string()]).nullish(),
  owner_name: z.string().nullish(),
  updated_at: z.string().nullish(),
  contacts: z.array(ContactBrief).nullish(),
  // The list endpoint returns contacts: null but fills primary_contact (verified 2026-09-26).
  primary_contact: ContactBrief.nullish(),
});

const Pagination = z.object({ page: z.number(), limit: z.number(), total: z.number(), has_next: z.boolean() });

export type DealContact = { id: string; name: string | null; email: string | null; title: string | null };

export type Deal = {
  id: string;
  name: string;
  amount: number | null;
  currency: string | null;
  stageName: string | null;
  companyId: string | null;
  ownerName: string | null;
  updatedAt: string | null;
  contacts: DealContact[];
};

function toDeal(d: z.infer<typeof DealDto>): Deal {
  return {
    id: d.id,
    name: d.name ?? "Untitled deal",
    amount: d.amount ?? null,
    currency: d.currency ?? null,
    stageName: d.stage_name ?? null,
    companyId: d.company_id != null ? String(d.company_id) : null,
    ownerName: d.owner_name ?? null,
    updatedAt: d.updated_at ?? null,
    contacts: (d.contacts ?? (d.primary_contact ? [d.primary_contact] : [])).map((c) => ({
      id: String(c.id),
      name: c.name ?? null,
      email: c.email?.trim().toLowerCase() ?? null,
      title: c.title ?? null,
    })),
  };
}

export async function listDeals(opts: { page: number; limit: number; search?: string }) {
  const operation = "list deals";
  const json = await graph8.get("/deals", {
    operation,
    query: { page: opts.page, limit: opts.limit, search: opts.search || undefined },
  });
  const res = parseResponse(z.object({ data: z.array(DealDto), pagination: Pagination }), json, operation);
  return {
    items: res.data.map(toDeal),
    page: res.pagination.page,
    total: res.pagination.total,
    hasNext: res.pagination.has_next,
  };
}

export async function getDeal(dealId: string): Promise<Deal> {
  const operation = "read deal";
  const json = await graph8.get(path`/deals/${dealId}`, { operation });
  return toDeal(parseResponse(z.object({ data: DealDto }), json, operation).data);
}
