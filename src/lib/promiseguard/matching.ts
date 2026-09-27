import "server-only";
import { AppRequestError } from "@/lib/auth/guard";
import type { Deal } from "@/lib/graph8/adapters/deals";
import { Graph8Error } from "@/lib/graph8/errors";
import {
  listQuotesForCompany,
  listQuotesForDeal,
  type QuoteRecord,
} from "@/lib/graph8/adapters/quotes";

export type QuoteLinkage = "deal" | "customer_only";

type QuoteCandidate = {
  quote: QuoteRecord;
  linkage: QuoteLinkage;
};

/** Deal-linked quotes plus same-customer quotes with no deal link (these need confirmation); other deals' quotes are excluded. */
export async function findQuoteCandidates(
  deal: Deal,
): Promise<{ candidates: QuoteCandidate[]; warnings: string[] }> {
  const warnings: string[] = [];
  const byId = new Map<string, QuoteCandidate>();

  for (const q of await listQuotesForDeal(deal.id))
    byId.set(q.id, { quote: q, linkage: "deal" });

  if (deal.companyId) {
    try {
      for (const q of await listQuotesForCompany(deal.companyId)) {
        if (byId.has(q.id)) continue;
        if (q.dealId && q.dealId !== deal.id) continue;
        if (q.companyId && q.companyId !== deal.companyId) continue;
        byId.set(q.id, {
          quote: q,
          linkage: q.dealId === deal.id ? "deal" : "customer_only",
        });
      }
    } catch (err) {
      if (!(err instanceof Graph8Error)) throw err;
      warnings.push(
        `Customer-level quotes could not be checked: ${err.message}`,
      );
    }
  }
  return { candidates: [...byId.values()], warnings };
}

export function assertQuoteEligible(
  deal: Deal,
  quote: QuoteRecord,
  matchConfirmed: boolean,
): QuoteLinkage {
  if (quote.dealId === deal.id) return "deal";
  if (quote.dealId && quote.dealId !== deal.id) {
    throw new AppRequestError(
      "quote_other_deal",
      "This quote is linked to a different deal.",
      409,
    );
  }
  if (!deal.companyId || quote.companyId !== deal.companyId) {
    throw new AppRequestError(
      "quote_unrelated",
      "This quote does not belong to the deal's customer.",
      409,
    );
  }
  if (!matchConfirmed) {
    throw new AppRequestError(
      "match_unconfirmed",
      "Confirm that this quote belongs to this deal before comparing.",
      409,
    );
  }
  return "customer_only";
}
