// Synthetic demonstration content. The Acme scenario is section 22 of the build plan; the others
// are original fixtures written to exercise specific comparison behaviours.
//
// Sample conversations are NOT Graph8 inbox messages or meetings. They are always labeled
// "Sample conversation" and their evidence is marked synthetic.
// Companies, contacts, deals, and draft quotes below are written into Graph8 by
// `node scripts/setup-promiseguard.mts records`, all prefixed "[PromiseGuard Demo]". Quotes are never sent.

export const SAMPLE_LABEL = "Sample conversation";
export const SAMPLE_SELLER_DOMAIN = "agency.example";

export type SampleMessage = { speakerName: string; speakerEmail: string; text: string };

export type SampleSource = {
  id: string;
  kind: "sample";
  format: "call_transcript" | "email";
  title: string;
  occurredAt: string;
  participants: string[];
  messages: SampleMessage[];
};

export type DemoQuote = {
  key: string;
  /** false creates a same-customer quote with no deal link, to demonstrate explicit confirmation. */
  linkToDeal: boolean;
  title: string;
  currency: "USD";
  payment_terms: "net_30";
  contract_start_date: string;
  contract_duration_value: number;
  contract_duration_unit: "months" | "weeks";
  line_items: Array<{
    product_name: string;
    description: string;
    quantity: number;
    unit_amount: number;
    billing_frequency: "one_time" | "month" | "year";
  }>;
  terms_content: string;
  notes: string;
};

export type DemoScenario = {
  key: string;
  summary: string;
  company: { name: string; domain: string };
  contact: { first_name: string; last_name: string; work_email: string; job_title: string };
  deal: { name: string; amount: number; currency: "USD" };
  quotes: DemoQuote[];
  sources: SampleSource[];
  /** What a correct comparison should show; used in docs/demo.md and manual testing. */
  expected: string[];
};

const SELLER = { speakerName: "Sam Carter", speakerEmail: "sam.carter@agency.example" };
const NOT_SENT = "[PromiseGuard Demo] Synthetic quote for demonstrating PromiseGuard. Do not send.";
const terms = (...lines: string[]) => lines.join("\n");

function person(first: string, last: string, domain: string) {
  const email = `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`;
  return { speakerName: `${first} ${last}`, speakerEmail: email };
}

// --- Acme (build plan section 22) -------------------------------------------------------------

const ACME_DOMAIN = "promiseguard-demo-acme.example";
const JORDAN = person("Jordan", "Reyes", ACME_DOMAIN);

const acme: DemoScenario = {
  key: "acme",
  summary: "The plan's reference case: one conflict, one missing item, one covered commitment.",
  company: { name: "[PromiseGuard Demo] Acme", domain: ACME_DOMAIN },
  contact: { first_name: "[PromiseGuard Demo] Jordan", last_name: "Reyes", work_email: JORDAN.speakerEmail, job_title: "Operations Director" },
  deal: { name: "[PromiseGuard Demo] Acme customer portal", amount: 8000, currency: "USD" },
  quotes: [
    {
      key: "main",
      linkToDeal: true,
      title: "[PromiseGuard Demo] Acme customer portal quote",
      currency: "USD",
      payment_terms: "net_30",
      contract_start_date: "2026-10-05",
      contract_duration_value: 1,
      contract_duration_unit: "months",
      line_items: [
        { product_name: "Web portal setup", description: "Customer web portal setup and launch.", quantity: 1, unit_amount: 800000, billing_frequency: "one_time" },
      ],
      terms_content: terms(
        "Scope",
        "Web portal setup for the Acme customer portal.",
        "",
        "Delivery",
        "Delivery: four weeks after receipt of final assets.",
        "",
        "Exclusions",
        "Data migration: excluded.",
        "Mobile applications: excluded.",
      ),
      notes: NOT_SENT,
    },
  ],
  sources: [
    {
      id: "acme-discovery-call",
      kind: "sample",
      format: "call_transcript",
      title: "Sample conversation: Acme discovery call",
      occurredAt: "2026-09-10T15:00:00.000Z",
      participants: [SELLER.speakerEmail, JORDAN.speakerEmail],
      messages: [
        { ...JORDAN, text: "Thanks for walking us through the portal. We have a few thousand customer records in our old system." },
        { ...SELLER, text: "We will migrate your existing customer records as part of the setup." },
        { ...JORDAN, text: "Could you also build an Android app?" },
        { ...SELLER, text: "An Android app would need a separate proposal." },
      ],
    },
    {
      id: "acme-follow-up-email",
      kind: "sample",
      format: "email",
      title: "Sample conversation: follow-up email after discovery call",
      occurredAt: "2026-09-12T09:30:00.000Z",
      participants: [SELLER.speakerEmail, JORDAN.speakerEmail],
      messages: [
        {
          ...SELLER,
          text: "Thanks for the call, Jordan. To confirm what we discussed: Three months of post-launch support are included. Delivery takes four weeks after you supply the final assets.",
        },
      ],
    },
  ],
  expected: [
    "Customer record migration: Conflict (quote excludes data migration).",
    "Three months of support: Missing (quote has no support term).",
    "Four-week delivery after final assets: Covered.",
    "Android app: not a seller promise (buyer request, seller declined).",
  ],
};

// --- Northwind: quote versions, conditional promise, later correction --------------------------

const NW_DOMAIN = "promiseguard-demo-northwind.example";
const PRIYA = person("Priya", "Shah", NW_DOMAIN);

const northwind: DemoScenario = {
  key: "northwind",
  summary: "Two quote versions to choose between, a conditional discount promise, and a later correction.",
  company: { name: "[PromiseGuard Demo] Northwind Traders", domain: NW_DOMAIN },
  contact: { first_name: "[PromiseGuard Demo] Priya", last_name: "Shah", work_email: PRIYA.speakerEmail, job_title: "CTO" },
  deal: { name: "[PromiseGuard Demo] Northwind field service app", amount: 37000, currency: "USD" },
  quotes: [
    {
      key: "v1",
      linkToDeal: true,
      title: "[PromiseGuard Demo] Northwind field service app quote v1",
      currency: "USD",
      payment_terms: "net_30",
      contract_start_date: "2026-10-12",
      contract_duration_value: 14,
      contract_duration_unit: "weeks",
      line_items: [
        { product_name: "iOS field service app", description: "Native iOS app with job lists and photo capture.", quantity: 1, unit_amount: 1800000, billing_frequency: "one_time" },
        { product_name: "Android field service app", description: "Native Android app with job lists and photo capture.", quantity: 1, unit_amount: 1600000, billing_frequency: "one_time" },
        { product_name: "Admin dashboard", description: "Web admin dashboard for dispatchers.", quantity: 1, unit_amount: 800000, billing_frequency: "one_time" },
      ],
      terms_content: terms("Delivery", "Delivery: 14 weeks from project kickoff.", "", "Exclusions", "App store submission is handled by the client."),
      notes: NOT_SENT,
    },
    {
      key: "v2",
      linkToDeal: true,
      title: "[PromiseGuard Demo] Northwind field service app quote v2",
      currency: "USD",
      payment_terms: "net_30",
      contract_start_date: "2026-10-12",
      contract_duration_value: 12,
      contract_duration_unit: "weeks",
      line_items: [
        {
          product_name: "iOS and Android field service apps",
          description: "Native iOS and Android apps built together, with job lists, photo capture, and offline mode for technicians.",
          quantity: 1,
          unit_amount: 3400000,
          billing_frequency: "one_time",
        },
        { product_name: "Admin dashboard", description: "Web admin dashboard for dispatchers.", quantity: 1, unit_amount: 300000, billing_frequency: "one_time" },
        { product_name: "App store submission", description: "App store submission and review support for both platforms.", quantity: 1, unit_amount: 0, billing_frequency: "one_time" },
      ],
      terms_content: terms(
        "Delivery",
        "Delivery: 12 weeks from project kickoff.",
        "",
        "Pricing",
        "All line items are billed at the listed prices, including the admin dashboard. No items are provided free of charge and no signing-date discounts apply.",
        "",
        "Exclusions",
        "Push notifications are not included in this phase.",
        "Website redesign is out of scope.",
      ),
      notes: NOT_SENT,
    },
  ],
  sources: [
    {
      id: "northwind-scoping-call",
      kind: "sample",
      format: "call_transcript",
      title: "Sample conversation: Northwind scoping call",
      occurredAt: "2026-09-02T14:00:00.000Z",
      participants: [SELLER.speakerEmail, PRIYA.speakerEmail],
      messages: [
        { ...PRIYA, text: "Our technicians often work in basements with no signal." },
        { ...SELLER, text: "Offline mode for technicians is included, so they can work without signal." },
        { ...SELLER, text: "We'll deliver iOS and Android together in 10 weeks." },
        { ...SELLER, text: "Push notifications are included." },
        { ...PRIYA, text: "Can you also do our website redesign?" },
        { ...SELLER, text: "Let me check with the team and come back to you." },
      ],
    },
    {
      id: "northwind-pricing-email",
      kind: "sample",
      format: "email",
      title: "Sample conversation: Northwind pricing follow-up email",
      occurredAt: "2026-09-05T10:15:00.000Z",
      participants: [SELLER.speakerEmail, PRIYA.speakerEmail],
      messages: [
        {
          ...SELLER,
          text: "Hi Priya, following up on pricing: if you sign by October 15, we'll include the admin dashboard at no extra cost. We also handle the app store submission for both platforms.",
        },
      ],
    },
    {
      id: "northwind-correction-email",
      kind: "sample",
      format: "email",
      title: "Sample conversation: Northwind correction email",
      occurredAt: "2026-09-09T16:40:00.000Z",
      participants: [SELLER.speakerEmail, PRIYA.speakerEmail],
      messages: [{ ...SELLER, text: "Correction to my earlier note: push notifications will be phase 2, not part of this build. Everything else stands." }],
    },
  ],
  expected: [
    "Select v2 (the newer quote) for the main demo; selecting v1 gives different results, showing why the quote must be chosen explicitly.",
    "Offline mode: Covered by v2 (not mentioned in v1).",
    "iOS and Android in 10 weeks: Conflict (v2 says 12 weeks).",
    "Free admin dashboard if signed by October 15: Conflict (v2 bills the dashboard and rules out signing-date discounts); the condition is preserved.",
    "App store submission handled by the seller: Covered by v2 (v1 says the client handles it).",
    "Push notifications: withdrawn by the later correction email, and v2 excludes them. The model may still list it; a reviewer can dismiss it citing the correction.",
    "Website redesign: not a promise (seller only said they would check).",
  ],
};

// --- Globex: SLA and price conflicts, unknown speaker, unlinked quote ---------------------------

const GX_DOMAIN = "promiseguard-demo-globex.example";
const MARCUS = person("Marcus", "Webb", GX_DOMAIN);
const PARTNER = { speakerName: "Dana Lee", speakerEmail: "dana.lee@implementation-partner.example" };

const globex: DemoScenario = {
  key: "globex",
  summary: "Service-level and price conflicts, a statement from an unidentified third party, and a quote that needs deal confirmation.",
  company: { name: "[PromiseGuard Demo] Globex", domain: GX_DOMAIN },
  contact: { first_name: "[PromiseGuard Demo] Marcus", last_name: "Webb", work_email: MARCUS.speakerEmail, job_title: "VP Operations" },
  deal: { name: "[PromiseGuard Demo] Globex managed analytics", amount: 60000, currency: "USD" },
  quotes: [
    {
      key: "main",
      linkToDeal: true,
      title: "[PromiseGuard Demo] Globex managed analytics quote",
      currency: "USD",
      payment_terms: "net_30",
      contract_start_date: "2026-11-01",
      contract_duration_value: 12,
      contract_duration_unit: "months",
      line_items: [
        { product_name: "Analytics platform setup", description: "Platform setup and data connectors for up to 5 sources.", quantity: 1, unit_amount: 2000000, billing_frequency: "one_time" },
        { product_name: "Managed analytics service", description: "Managed platform operation and monitoring.", quantity: 1, unit_amount: 3600000, billing_frequency: "year" },
        { product_name: "Onboarding training", description: "Onboarding training for up to 20 users.", quantity: 1, unit_amount: 400000, billing_frequency: "one_time" },
      ],
      terms_content: terms(
        "Service levels",
        "Target availability: 99.5% monthly. No service credits apply.",
        "",
        "Pricing",
        "Pricing is valid for 12 months and is subject to annual review.",
        "",
        "Reporting",
        "Monthly service report delivered by email.",
      ),
      notes: NOT_SENT,
    },
    {
      key: "pilot",
      linkToDeal: false,
      title: "[PromiseGuard Demo] Globex pilot quote (not linked to a deal)",
      currency: "USD",
      payment_terms: "net_30",
      contract_start_date: "2026-10-01",
      contract_duration_value: 1,
      contract_duration_unit: "months",
      line_items: [
        { product_name: "Analytics pilot", description: "One-month pilot with a single data connector.", quantity: 1, unit_amount: 500000, billing_frequency: "one_time" },
      ],
      terms_content: terms("Scope", "One-month pilot with a single data connector.", "", "Service levels", "No availability commitment during the pilot."),
      notes: NOT_SENT,
    },
  ],
  sources: [
    {
      id: "globex-solution-call",
      kind: "sample",
      format: "call_transcript",
      title: "Sample conversation: Globex solution call",
      occurredAt: "2026-09-15T17:00:00.000Z",
      participants: [SELLER.speakerEmail, MARCUS.speakerEmail, PARTNER.speakerEmail],
      messages: [
        { ...MARCUS, text: "Uptime is critical for our dispatch team." },
        { ...SELLER, text: "We guarantee 99.9% uptime." },
        { ...SELLER, text: "Training for up to 20 users is included." },
        { ...PARTNER, text: "We'll also migrate your historical dashboards from the old tool." },
        { ...SELLER, text: "Your price is locked for 24 months." },
      ],
    },
    {
      id: "globex-reporting-email",
      kind: "sample",
      format: "email",
      title: "Sample conversation: Globex reporting email",
      occurredAt: "2026-09-18T08:45:00.000Z",
      participants: [SELLER.speakerEmail, MARCUS.speakerEmail],
      messages: [{ ...SELLER, text: "Marcus, as promised we'll run weekly reporting calls with your team for the first 3 months." }],
    },
  ],
  expected: [
    "99.9% uptime guarantee: Conflict (quote targets 99.5% with no service credits).",
    "Training for 20 users: Covered.",
    "Historical dashboard migration: Needs review (said by a third party whose side is unknown).",
    "Price locked for 24 months: Conflict (quote pricing valid for 12 months).",
    "Weekly reporting calls for 3 months: Missing or Conflict (quote has only a monthly report).",
    "The pilot quote is the same customer but not linked to the deal: selecting it requires explicit confirmation.",
  ],
};

// --- Lakeside: mostly covered, one hosting conflict --------------------------------------------

const LK_DOMAIN = "promiseguard-demo-lakeside.example";
const ELENA = person("Elena", "Park", LK_DOMAIN);

const lakeside: DemoScenario = {
  key: "lakeside",
  summary: "A mostly well-covered quote with one hosting conflict and a declined buyer request.",
  company: { name: "[PromiseGuard Demo] Lakeside Dental Group", domain: LK_DOMAIN },
  contact: { first_name: "[PromiseGuard Demo] Elena", last_name: "Park", work_email: ELENA.speakerEmail, job_title: "Practice Manager" },
  deal: { name: "[PromiseGuard Demo] Lakeside website redesign", amount: 15000, currency: "USD" },
  quotes: [
    {
      key: "main",
      linkToDeal: true,
      title: "[PromiseGuard Demo] Lakeside website redesign quote",
      currency: "USD",
      payment_terms: "net_30",
      contract_start_date: "2026-10-19",
      contract_duration_value: 6,
      contract_duration_unit: "weeks",
      line_items: [
        {
          product_name: "Website design and build",
          description: "Design and build of 5 page templates with up to two revision rounds per template.",
          quantity: 1,
          unit_amount: 1200000,
          billing_frequency: "one_time",
        },
        { product_name: "SEO redirect mapping", description: "301 redirect mapping for up to 200 existing URLs.", quantity: 1, unit_amount: 300000, billing_frequency: "one_time" },
      ],
      terms_content: terms("Hosting", "Hosting is not included; the client provides hosting.", "", "Delivery", "Launch within 6 weeks of content approval."),
      notes: NOT_SENT,
    },
  ],
  sources: [
    {
      id: "lakeside-recap-thread",
      kind: "sample",
      format: "email",
      title: "Sample conversation: Lakeside recap email thread",
      occurredAt: "2026-09-20T11:00:00.000Z",
      participants: [SELLER.speakerEmail, ELENA.speakerEmail],
      messages: [
        {
          ...SELLER,
          text: "Elena, quick recap: the site includes 5 page templates, with two rounds of revisions on each. We'll handle the SEO redirects from your old URLs. And we'll host the new site free for the first year.",
        },
        { ...ELENA, text: "Great. Could you also write the page copy?" },
        { ...SELLER, text: "Copywriting isn't something we offer, but we can recommend a writer." },
      ],
    },
  ],
  expected: [
    "5 page templates: Covered.",
    "Two revision rounds per template: Covered.",
    "SEO redirects: Covered.",
    "Free hosting for the first year: Conflict (quote says hosting is not included).",
    "Copywriting: not a promise (buyer request, seller declined).",
  ],
};

export const DEMO_SCENARIOS: DemoScenario[] = [acme, northwind, globex, lakeside];

export const SAMPLE_SOURCES: SampleSource[] = DEMO_SCENARIOS.flatMap((s) => s.sources);
