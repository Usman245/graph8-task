import "server-only";
import { z } from "zod";
import { graph8, parseResponse, path } from "../client";

// Verified: GET /quotes?deal_id= -> { data: { items, total, page, limit } };
// GET /companies/{id}/quotes -> same list envelope (unobserved rows, parsed defensively);
// GET /quotes/{id} -> { data: QuoteDetail } with terms_content, public_notes, line_items[].description.

const LineItemDto = z.object({
  id: z.string(),
  product_name: z.string().nullish(),
  description: z.string().nullish(),
  quantity: z.number().nullish(),
  unit_amount: z.number().nullish(),
  line_total: z.number().nullish(),
  billing_frequency: z.string().nullish(),
  sort_order: z.number().nullish(),
});

const QuoteDto = z.object({
  id: z.string(),
  quote_number: z.string().nullish(),
  title: z.string().nullish(),
  status: z.string().nullish(),
  deal_id: z.string().nullish(),
  mashup_company_id: z.union([z.number(), z.string()]).nullish(),
  signer_email: z.string().nullish(),
  company_name: z.string().nullish(),
  currency: z.string().nullish(),
  total: z.number().nullish(),
  terms_content: z.string().nullish(),
  public_notes: z.string().nullish(),
  payment_terms: z.string().nullish(),
  contract_start_date: z.string().nullish(),
  contract_end_date: z.string().nullish(),
  contract_duration_value: z.number().nullish(),
  contract_duration_unit: z.string().nullish(),
  contract_months: z.number().nullish(),
  document_ids: z.array(z.unknown()).nullish(),
  attached_documents: z.array(z.unknown()).nullish(),
  template_id: z.string().nullish(),
  created_at: z.string().nullish(),
  updated_at: z.string().nullish(),
  sent_at: z.string().nullish(),
  line_items: z.array(LineItemDto).nullish(),
});

export type QuoteRecord = {
  id: string;
  number: string | null;
  title: string | null;
  status: string | null;
  dealId: string | null;
  companyId: string | null;
  companyName: string | null;
  signerEmail: string | null;
  currency: string | null;
  /** Minor units (cents), as returned by Graph8. */
  totalMinor: number | null;
  termsContent: string | null;
  publicNotes: string | null;
  paymentTerms: string | null;
  contractStartDate: string | null;
  contractEndDate: string | null;
  contractDuration: string | null;
  attachmentCount: number;
  createdAt: string | null;
  updatedAt: string | null;
  sentAt: string | null;
  lineItems: Array<{
    id: string;
    productName: string | null;
    description: string | null;
    quantity: number | null;
    unitAmountMinor: number | null;
    lineTotalMinor: number | null;
    billingFrequency: string | null;
  }>;
};

function toQuote(q: z.infer<typeof QuoteDto>): QuoteRecord {
  const duration =
    q.contract_duration_value != null
      ? `${q.contract_duration_value} ${q.contract_duration_unit ?? "months"}`
      : q.contract_months != null
        ? `${q.contract_months} months`
        : null;
  return {
    id: q.id,
    number: q.quote_number ?? null,
    title: q.title ?? null,
    status: q.status ?? null,
    dealId: q.deal_id ?? null,
    companyId: q.mashup_company_id != null ? String(q.mashup_company_id) : null,
    companyName: q.company_name ?? null,
    signerEmail: q.signer_email?.toLowerCase() ?? null,
    currency: q.currency ?? null,
    totalMinor: q.total ?? null,
    termsContent: q.terms_content ?? null,
    publicNotes: q.public_notes ?? null,
    paymentTerms: q.payment_terms ?? null,
    contractStartDate: q.contract_start_date ?? null,
    contractEndDate: q.contract_end_date ?? null,
    contractDuration: duration,
    attachmentCount: (q.document_ids?.length ?? 0) + (q.attached_documents?.length ?? 0),
    createdAt: q.created_at ?? null,
    updatedAt: q.updated_at ?? null,
    sentAt: q.sent_at ?? null,
    lineItems: [...(q.line_items ?? [])]
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((l) => ({
        id: l.id,
        productName: l.product_name ?? null,
        description: l.description ?? null,
        quantity: l.quantity ?? null,
        unitAmountMinor: l.unit_amount ?? null,
        lineTotalMinor: l.line_total ?? null,
        billingFrequency: l.billing_frequency ?? null,
      })),
  };
}

const ListEnvelope = z.object({
  data: z.object({ items: z.array(QuoteDto.partial({ line_items: true })), total: z.number().optional() }),
});

export async function listQuotesForDeal(dealId: string): Promise<QuoteRecord[]> {
  const operation = "list deal quotes";
  const json = await graph8.get("/quotes", { operation, query: { deal_id: dealId, page: 1, limit: 50 } });
  return parseResponse(ListEnvelope, json, operation).data.items.map(toQuote);
}

export async function listQuotesForCompany(companyId: string): Promise<QuoteRecord[]> {
  const operation = "list company quotes";
  const json = await graph8.get(path`/companies/${companyId}/quotes`, { operation });
  // Envelope not yet observed with rows; accept the verified list shape or a bare array.
  const parsed = z.union([ListEnvelope, z.object({ data: z.array(QuoteDto) })]).safeParse(json);
  if (!parsed.success) return parseResponse(ListEnvelope, json, operation).data.items.map(toQuote);
  const data = parsed.data.data;
  return (Array.isArray(data) ? data : data.items).map(toQuote);
}

export async function getQuote(quoteId: string): Promise<QuoteRecord> {
  const operation = "read quote";
  const json = await graph8.get(path`/quotes/${quoteId}`, { operation });
  return toQuote(parseResponse(z.object({ data: QuoteDto }), json, operation).data);
}
