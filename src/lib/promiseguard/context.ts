import "server-only";
import { env } from "@/lib/env";
import { getDeal, listDeals, type Deal } from "@/lib/graph8/adapters/deals";
import { Graph8Error } from "@/lib/graph8/errors";
import { getConnectionStatus } from "./capabilities";
import { DEMO_TITLE_PREFIX } from "./manifest";
import { findQuoteCandidates, type QuoteLinkage } from "./matching";
import { isDemoDeal } from "./mode";
import { quoteToDocument } from "./normalize";
import { listReviewSummaries, type ReviewSummary } from "./repository";
import type { Mode } from "./schemas";
import { findSourceCandidates, type CandidateScan } from "./sources";

export type DealRow = Pick<Deal, "id" | "name" | "amount" | "currency" | "stageName" | "ownerName" | "updatedAt"> & {
  companyName: string | null;
  primaryContact: string | null;
};

export type DealPage = { items: DealRow[]; page: number; hasNext: boolean; total: number; hiddenDemoDeals: number };

export async function dealPage(mode: Mode, page: number, search: string): Promise<DealPage> {
  const limit = 25;
  // Demo mode lists only "[PromiseGuard Demo]" deals; Live mode hides them.
  const res = await listDeals({ page, limit, search: mode === "demo" ? search || DEMO_TITLE_PREFIX : search || undefined });
  const keep = res.items.filter((d) => (mode === "demo" ? isDemoDeal(d) : !isDemoDeal(d)));
  return {
    items: keep.map((d) => ({
      id: d.id,
      name: d.name,
      amount: d.amount,
      currency: d.currency,
      stageName: d.stageName,
      ownerName: d.ownerName,
      updatedAt: d.updatedAt,
      companyName: null,
      primaryContact: d.contacts[0]?.name ?? d.contacts[0]?.email ?? null,
    })),
    page: res.page,
    hasNext: res.hasNext,
    total: res.total,
    hiddenDemoDeals: mode === "live" ? res.items.length - keep.length : 0,
  };
}

export type QuoteOption = {
  id: string;
  label: string;
  number: string | null;
  title: string | null;
  status: string | null;
  totalMinor: number | null;
  currency: string | null;
  createdAt: string | null;
  sentAt: string | null;
  linkage: QuoteLinkage;
  textComplete: boolean;
  includedFields: string[];
  limitations: string[];
  preview: Array<{ path: string; text: string }>;
};

export type DealContext = {
  mode: Mode;
  deal: Deal;
  dealIsDemo: boolean;
  modeMismatch: string | null;
  quotes: QuoteOption[];
  quoteWarnings: string[];
  sources: CandidateScan;
  reviews: { items: ReviewSummary[]; partial: boolean } | { error: string };
  maxSources: number;
  comparisonReady: boolean;
};

export async function dealContext(dealId: string, mode: Mode): Promise<DealContext> {
  const deal = await getDeal(dealId);
  const dealIsDemo = isDemoDeal(deal);
  const modeMismatch =
    mode === "demo" && !dealIsDemo
      ? "This is a real Graph8 deal. Switch to Live mode to review it."
      : mode === "live" && dealIsDemo
        ? "This is a [PromiseGuard Demo] deal. Switch to Demo mode to review it with the sample conversation."
        : null;

  const [quoteResult, sources, reviews, status] = await Promise.all([
    findQuoteCandidates(deal),
    modeMismatch ? Promise.resolve<CandidateScan>({ candidates: [], coverage: [], errors: [] }) : findSourceCandidates(deal, mode),
    listReviewSummaries(deal.id).catch((err) => ({ error: err instanceof Graph8Error ? err.message : "Could not load previous reviews." })),
    getConnectionStatus(),
  ]);

  const maxQuoteChars = env().PROMISEGUARD_MAX_QUOTE_CHARS;
  const quotes: QuoteOption[] = quoteResult.candidates.map(({ quote, linkage }) => {
    const doc = quoteToDocument(quote, maxQuoteChars);
    return {
      id: quote.id,
      label: doc.label,
      number: quote.number,
      title: quote.title,
      status: quote.status,
      totalMinor: quote.totalMinor,
      currency: quote.currency,
      createdAt: quote.createdAt,
      sentAt: quote.sentAt,
      linkage,
      textComplete: doc.textComplete,
      includedFields: doc.includedFields,
      limitations: doc.limitations,
      preview: doc.parts.map((p) => ({ path: p.path, text: p.text })),
    };
  });

  return {
    mode,
    deal,
    dealIsDemo,
    modeMismatch,
    quotes,
    quoteWarnings: quoteResult.warnings,
    sources,
    reviews,
    maxSources: env().PROMISEGUARD_MAX_SOURCES,
    comparisonReady: status.comparisonReady,
  };
}
