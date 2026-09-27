// Synthetic demo content: Brightside Marketing selling to four local businesses. Sample conversations are not
// Graph8 emails or meetings and are always labeled; the deals and draft quotes are created in Graph8 by
// `node scripts/setup-promiseguard.mts records` with the "[PromiseGuard Demo]" prefix.

export const SAMPLE_LABEL = "Sample conversation";
export const SAMPLE_SELLER_DOMAIN = "brightside-marketing.example";

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
  expected: string[];
};

/** The agency's account manager. Her domain counts as the seller in Demo mode. */
const SELLER = { speakerName: "Maya Brooks", speakerEmail: `maya.brooks@${SAMPLE_SELLER_DOMAIN}` };
const NOT_SENT = "[PromiseGuard Demo] Synthetic quote for demonstrating PromiseGuard. Do not send.";
const terms = (...lines: string[]) => lines.join("\n");

function person(first: string, last: string, domain: string) {
  const email = `${first.toLowerCase()}.${last.toLowerCase()}@${domain}`;
  return { speakerName: `${first} ${last}`, speakerEmail: email };
}

const BAKERY_DOMAIN = "promiseguard-demo-bloombakery.example";
const OLIVIA = person("Olivia", "Grant", BAKERY_DOMAIN);

const bakery: DemoScenario = {
  key: "bakery",
  summary: "The headline example: a TikTok promise the quote leaves out, a missing photographer, and a covered monthly report.",
  company: { name: "[PromiseGuard Demo] Bloom Bakery", domain: BAKERY_DOMAIN },
  contact: { first_name: "[PromiseGuard Demo] Olivia", last_name: "Grant", work_email: OLIVIA.speakerEmail, job_title: "Owner" },
  deal: { name: "[PromiseGuard Demo] Bloom Bakery social media", amount: 4500, currency: "USD" },
  quotes: [
    {
      key: "main",
      linkToDeal: true,
      title: "[PromiseGuard Demo] Bloom Bakery social media quote",
      currency: "USD",
      payment_terms: "net_30",
      contract_start_date: "2026-10-05",
      contract_duration_value: 3,
      contract_duration_unit: "months",
      line_items: [
        {
          product_name: "Social media management (3 months)",
          description: "Running Bloom Bakery's Instagram and Facebook pages for 3 months.",
          quantity: 1,
          unit_amount: 450000,
          billing_frequency: "one_time",
        },
      ],
      terms_content: terms(
        "What's included",
        "12 posts per month on Instagram and Facebook.",
        "A monthly report showing likes, followers and reach.",
        "",
        "Not included",
        "TikTok is not included.",
        "Paid advertising budget is not included.",
      ),
      notes: NOT_SENT,
    },
  ],
  sources: [
    {
      id: "bakery-intro-call",
      kind: "sample",
      format: "call_transcript",
      title: "Sample conversation: Bloom Bakery intro call",
      occurredAt: "2026-09-10T15:00:00.000Z",
      participants: [SELLER.speakerEmail, OLIVIA.speakerEmail],
      messages: [
        { ...OLIVIA, text: "We're a small bakery and nobody on our team has time for social media." },
        { ...SELLER, text: "We'll run your TikTok as well as your Instagram and Facebook." },
        { ...OLIVIA, text: "Could you also redesign our logo?" },
        { ...SELLER, text: "A new logo would be a separate project." },
      ],
    },
    {
      id: "bakery-follow-up-email",
      kind: "sample",
      format: "email",
      title: "Sample conversation: follow-up email after the intro call",
      occurredAt: "2026-09-12T09:30:00.000Z",
      participants: [SELLER.speakerEmail, OLIVIA.speakerEmail],
      messages: [
        {
          ...SELLER,
          text: "Thanks for the chat, Olivia. As promised, a professional photographer will visit once a month to photograph your cakes. You'll also get a monthly report showing your likes, followers and reach.",
        },
      ],
    },
  ],
  expected: [
    "Running TikTok: Conflict (the quote says TikTok is not included).",
    "Monthly photographer visit: Missing (the quote does not mention photography).",
    "Monthly report on likes, followers and reach: Covered.",
    "New logo: not a promise (the owner asked, the agency said it is a separate project).",
  ],
};

const CAFE_DOMAIN = "promiseguard-demo-greenleaf.example";
const DANIEL = person("Daniel", "Kim", CAFE_DOMAIN);

const cafe: DemoScenario = {
  key: "cafe",
  summary: "Two quote versions to choose between, a 'free first month if you sign by' promise, and a later correction.",
  company: { name: "[PromiseGuard Demo] Green Leaf Café", domain: CAFE_DOMAIN },
  contact: { first_name: "[PromiseGuard Demo] Daniel", last_name: "Kim", work_email: DANIEL.speakerEmail, job_title: "Owner" },
  deal: { name: "[PromiseGuard Demo] Green Leaf Café Google search", amount: 3600, currency: "USD" },
  quotes: [
    {
      key: "v1",
      linkToDeal: true,
      title: "[PromiseGuard Demo] Green Leaf Café Google search quote v1",
      currency: "USD",
      payment_terms: "net_30",
      contract_start_date: "2026-10-12",
      contract_duration_value: 6,
      contract_duration_unit: "months",
      line_items: [
        {
          product_name: "Local Google search package (6 months)",
          description: "Monthly work to help Green Leaf Café show up when people nearby search on Google.",
          quantity: 1,
          unit_amount: 360000,
          billing_frequency: "one_time",
        },
      ],
      terms_content: terms(
        "What's included",
        "A monthly check of your search words and nearby competitors.",
        "",
        "Not included",
        "Setting up your Google Business Profile is done by the café.",
        "",
        "Results",
        "Most businesses see better Google rankings within 6 to 9 months.",
      ),
      notes: NOT_SENT,
    },
    {
      key: "v2",
      linkToDeal: true,
      title: "[PromiseGuard Demo] Green Leaf Café Google search quote v2",
      currency: "USD",
      payment_terms: "net_30",
      contract_start_date: "2026-10-12",
      contract_duration_value: 6,
      contract_duration_unit: "months",
      line_items: [
        {
          product_name: "Local Google search package (6 months)",
          description:
            "Monthly work to help Green Leaf Café show up when people nearby search on Google, including setting up and improving your Google Business Profile.",
          quantity: 1,
          unit_amount: 360000,
          billing_frequency: "one_time",
        },
      ],
      terms_content: terms(
        "What's included",
        "Setting up and improving your Google Business Profile, so you appear on Google Maps.",
        "A monthly check of your search words and nearby competitors.",
        "",
        "Results",
        "We cannot guarantee a first-page Google ranking. Most businesses see better rankings within 4 to 6 months.",
        "",
        "Pricing",
        "The first month is charged at the normal price. No sign-up discounts or free months apply.",
        "",
        "Not included",
        "Replying to customer reviews is not included.",
        "Facebook advertising is not included.",
      ),
      notes: NOT_SENT,
    },
  ],
  sources: [
    {
      id: "cafe-planning-call",
      kind: "sample",
      format: "call_transcript",
      title: "Sample conversation: Green Leaf Café planning call",
      occurredAt: "2026-09-02T14:00:00.000Z",
      participants: [SELLER.speakerEmail, DANIEL.speakerEmail],
      messages: [
        { ...DANIEL, text: "When people search for coffee near me, we never show up." },
        { ...SELLER, text: "We'll get you on the first page of Google for 'coffee near me' within 2 months." },
        { ...SELLER, text: "We'll set up your Google Business Profile so you show up on Google Maps." },
        { ...SELLER, text: "We'll reply to all your Google reviews for you." },
        { ...DANIEL, text: "Can you also run our Facebook ads?" },
        { ...SELLER, text: "Let me check with the team and get back to you." },
      ],
    },
    {
      id: "cafe-pricing-email",
      kind: "sample",
      format: "email",
      title: "Sample conversation: Green Leaf Café pricing email",
      occurredAt: "2026-09-05T10:15:00.000Z",
      participants: [SELLER.speakerEmail, DANIEL.speakerEmail],
      messages: [{ ...SELLER, text: "Hi Daniel, good news on pricing: if you sign by October 15, your first month is free." }],
    },
    {
      id: "cafe-correction-email",
      kind: "sample",
      format: "email",
      title: "Sample conversation: Green Leaf Café correction email",
      occurredAt: "2026-09-09T16:40:00.000Z",
      participants: [SELLER.speakerEmail, DANIEL.speakerEmail],
      messages: [
        {
          ...SELLER,
          text: "A quick correction to what I said on our call: replying to your Google reviews is not part of this package. We'll show your team how to do it instead.",
        },
      ],
    },
  ],
  expected: [
    "Select v2 (the newer quote) for the main demo; selecting v1 gives different results, showing why the quote must be chosen on purpose.",
    "First page of Google within 2 months: Conflict (v2 says rankings cannot be guaranteed and usually take 4 to 6 months).",
    "Google Business Profile set-up: Covered by v2 (v1 says the café does it).",
    "Free first month if signed by October 15: Conflict (v2 says no free months); the condition is kept.",
    "Replying to reviews: withdrawn by the later correction email, and v2 excludes it. The model may still list it; a reviewer can dismiss it, citing the correction.",
    "Facebook ads: not a promise (the agency only said it would check).",
  ],
};

const GYM_DOMAIN = "promiseguard-demo-summitfitness.example";
const RACHEL = person("Rachel", "Adams", GYM_DOMAIN);
const FREELANCER = { speakerName: "Leo Martin", speakerEmail: "leo.martin@freelance-video.example" };

const gym: DemoScenario = {
  key: "gym",
  summary: "A sign-up guarantee and a price freeze the quote contradicts, a freelancer's promise to check, and a trial quote that needs confirming.",
  company: { name: "[PromiseGuard Demo] Summit Fitness", domain: GYM_DOMAIN },
  contact: { first_name: "[PromiseGuard Demo] Rachel", last_name: "Adams", work_email: RACHEL.speakerEmail, job_title: "Gym Owner" },
  deal: { name: "[PromiseGuard Demo] Summit Fitness online ads", amount: 9000, currency: "USD" },
  quotes: [
    {
      key: "main",
      linkToDeal: true,
      title: "[PromiseGuard Demo] Summit Fitness online ads quote",
      currency: "USD",
      payment_terms: "net_30",
      contract_start_date: "2026-11-01",
      contract_duration_value: 12,
      contract_duration_unit: "months",
      line_items: [
        { product_name: "Ad campaign set-up", description: "Setting up Facebook and Instagram ad campaigns.", quantity: 1, unit_amount: 150000, billing_frequency: "one_time" },
        { product_name: "Monthly ad management", description: "Running and improving your ads every month.", quantity: 1, unit_amount: 62500, billing_frequency: "month" },
      ],
      terms_content: terms(
        "What's included",
        "3 new ad designs every month.",
        "A monthly results report sent by email.",
        "",
        "Results",
        "We aim to bring in more new members, but no number of sign-ups is guaranteed.",
        "",
        "Pricing",
        "The monthly fee is fixed for 12 months, then reviewed.",
        "",
        "Not included",
        "Ad spend (the money paid to Facebook and Instagram) is billed separately.",
      ),
      notes: NOT_SENT,
    },
    {
      key: "trial",
      linkToDeal: false,
      title: "[PromiseGuard Demo] Summit Fitness one-month trial (not linked to a deal)",
      currency: "USD",
      payment_terms: "net_30",
      contract_start_date: "2026-10-01",
      contract_duration_value: 1,
      contract_duration_unit: "months",
      line_items: [
        { product_name: "One-month ads trial", description: "One ad campaign on Facebook for one month.", quantity: 1, unit_amount: 50000, billing_frequency: "one_time" },
      ],
      terms_content: terms("What's included", "One ad campaign on Facebook for one month.", "", "Results", "No results are guaranteed during the trial."),
      notes: NOT_SENT,
    },
  ],
  sources: [
    {
      id: "gym-strategy-call",
      kind: "sample",
      format: "call_transcript",
      title: "Sample conversation: Summit Fitness strategy call",
      occurredAt: "2026-09-15T17:00:00.000Z",
      participants: [SELLER.speakerEmail, RACHEL.speakerEmail, FREELANCER.speakerEmail],
      messages: [
        { ...RACHEL, text: "January is our busiest month and we need more members." },
        { ...SELLER, text: "We guarantee at least 50 new member sign-ups every month." },
        { ...SELLER, text: "You'll get 3 new ad designs every month." },
        { ...FREELANCER, text: "I'll also film a promo video at your gym for the ads." },
        { ...SELLER, text: "Your monthly fee stays the same for 2 years." },
      ],
    },
    {
      id: "gym-updates-email",
      kind: "sample",
      format: "email",
      title: "Sample conversation: Summit Fitness weekly updates email",
      occurredAt: "2026-09-18T08:45:00.000Z",
      participants: [SELLER.speakerEmail, RACHEL.speakerEmail],
      messages: [{ ...SELLER, text: "Rachel, as promised, we'll send you a quick update every week on how your ads are doing." }],
    },
  ],
  expected: [
    "50 new sign-ups a month guaranteed: Conflict (the quote says no number of sign-ups is guaranteed).",
    "3 new ad designs a month: Covered.",
    "Promo video at the gym: Needs review (said by a freelance videographer, not the agency).",
    "Same monthly fee for 2 years: Conflict (the quote fixes the fee for 12 months).",
    "Weekly updates: Missing or Conflict (the quote only includes a monthly report).",
    "The one-month trial quote is for the same gym but not linked to the deal: choosing it asks you to confirm it belongs to this deal.",
  ],
};

const DENTAL_DOMAIN = "promiseguard-demo-riveradental.example";
const SOFIA = person("Sofia", "Rivera", DENTAL_DOMAIN);

const dental: DemoScenario = {
  key: "dental",
  summary: "A mostly well-covered website quote with one free-hosting conflict and a request the agency turned down.",
  company: { name: "[PromiseGuard Demo] Rivera Family Dental", domain: DENTAL_DOMAIN },
  contact: { first_name: "[PromiseGuard Demo] Sofia", last_name: "Rivera", work_email: SOFIA.speakerEmail, job_title: "Practice Manager" },
  deal: { name: "[PromiseGuard Demo] Rivera Family Dental new website", amount: 5000, currency: "USD" },
  quotes: [
    {
      key: "main",
      linkToDeal: true,
      title: "[PromiseGuard Demo] Rivera Family Dental website quote",
      currency: "USD",
      payment_terms: "net_30",
      contract_start_date: "2026-10-19",
      contract_duration_value: 6,
      contract_duration_unit: "weeks",
      line_items: [
        {
          product_name: "New website",
          description: "Design and build of a 5-page website, with up to two rounds of changes on each page.",
          quantity: 1,
          unit_amount: 400000,
          billing_frequency: "one_time",
        },
        { product_name: "Online booking button", description: "A 'Book an appointment' button on every page.", quantity: 1, unit_amount: 100000, billing_frequency: "one_time" },
      ],
      terms_content: terms(
        "Hosting",
        "Website hosting is not included. The practice pays for its own hosting.",
        "",
        "Timeline",
        "The website goes live within 6 weeks after the practice sends all photos and text.",
      ),
      notes: NOT_SENT,
    },
  ],
  sources: [
    {
      id: "dental-recap-thread",
      kind: "sample",
      format: "email",
      title: "Sample conversation: Rivera Family Dental recap email thread",
      occurredAt: "2026-09-20T11:00:00.000Z",
      participants: [SELLER.speakerEmail, SOFIA.speakerEmail],
      messages: [
        {
          ...SELLER,
          text: "Hi Sofia, quick recap: your new website will have 5 pages, and you get two rounds of changes on each page. We'll add a 'Book an appointment' button to every page. And we'll host the website for free for the first year.",
        },
        { ...SOFIA, text: "Great. Could you also write the text for each page?" },
        { ...SELLER, text: "We don't write website text, but we can recommend a writer." },
      ],
    },
  ],
  expected: [
    "5-page website: Covered.",
    "Two rounds of changes on each page: Covered.",
    "'Book an appointment' button on every page: Covered.",
    "Free hosting for the first year: Conflict (the quote says hosting is not included).",
    "Writing the page text: not a promise (the practice asked, the agency said no).",
  ],
};

const YOGA_DOMAIN = "promiseguard-demo-harboryoga.example";
const NINA = person("Nina", "Patel", YOGA_DOMAIN);

const yoga: DemoScenario = {
  key: "yoga",
  summary: "A clean quote that covers every promise: Clear to send, then handed to delivery as Graph8 tasks.",
  company: { name: "[PromiseGuard Demo] Harbor Yoga Studio", domain: YOGA_DOMAIN },
  contact: { first_name: "[PromiseGuard Demo] Nina", last_name: "Patel", work_email: NINA.speakerEmail, job_title: "Studio Owner" },
  deal: { name: "[PromiseGuard Demo] Harbor Yoga email newsletter", amount: 2400, currency: "USD" },
  quotes: [
    {
      key: "main",
      linkToDeal: true,
      title: "[PromiseGuard Demo] Harbor Yoga email newsletter quote",
      currency: "USD",
      payment_terms: "net_30",
      contract_start_date: "2026-10-01",
      contract_duration_value: 6,
      contract_duration_unit: "months",
      line_items: [
        {
          product_name: "Email newsletter service (6 months)",
          description: "Two newsletters per month, written and sent for Harbor Yoga Studio.",
          quantity: 1,
          unit_amount: 180000,
          billing_frequency: "one_time",
        },
        {
          product_name: "Newsletter template design",
          description: "A branded newsletter template in Harbor Yoga's colours with its logo.",
          quantity: 1,
          unit_amount: 60000,
          billing_frequency: "one_time",
        },
      ],
      terms_content: terms(
        "What's included",
        "Two newsletters per month for 6 months.",
        "A branded newsletter template in your colours with your logo.",
        "Importing your existing subscriber list from your booking system.",
        "A monthly report showing opens and clicks.",
        "",
        "Timeline",
        "The first newsletter goes out within 2 weeks after you send your logo and class schedule.",
      ),
      notes: NOT_SENT,
    },
  ],
  sources: [
    {
      id: "yoga-planning-call",
      kind: "sample",
      format: "call_transcript",
      title: "Sample conversation: Harbor Yoga planning call",
      occurredAt: "2026-09-16T13:00:00.000Z",
      participants: [SELLER.speakerEmail, NINA.speakerEmail],
      messages: [
        { ...NINA, text: "We want to stay in touch with our members between classes." },
        { ...SELLER, text: "We'll send two newsletters a month for you." },
        { ...SELLER, text: "We'll design a template in your colours with your logo." },
        { ...NINA, text: "Can you move our subscriber list over from the booking system?" },
        { ...SELLER, text: "Yes, we'll import your existing subscriber list." },
      ],
    },
    {
      id: "yoga-confirmation-email",
      kind: "sample",
      format: "email",
      title: "Sample conversation: Harbor Yoga confirmation email",
      occurredAt: "2026-09-18T10:00:00.000Z",
      participants: [SELLER.speakerEmail, NINA.speakerEmail],
      messages: [
        {
          ...SELLER,
          text: "Hi Nina, to confirm: the first newsletter goes out within 2 weeks after you send your logo and class schedule, and each month you'll get a report showing opens and clicks.",
        },
      ],
    },
  ],
  expected: [
    "Every promise is Covered: two newsletters a month, the branded template, the subscriber import, the monthly report, and the first newsletter within 2 weeks (after the logo and class schedule arrive).",
    "Quote Guard shows Clear to send.",
    "Promise Handoff turns each covered promise into a Graph8 delivery task with an owner and a due date; these appear on the Delivery page.",
  ],
};

/** The first scenario is the headline example linked from the Deals page. */
export const DEMO_SCENARIOS: DemoScenario[] = [bakery, cafe, gym, dental, yoga];

export const SAMPLE_SOURCES: SampleSource[] = DEMO_SCENARIOS.flatMap((s) => s.sources);
