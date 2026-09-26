// Synthetic demonstration content from the build plan (section 22).
// The sample conversation is NOT a Graph8 inbox message or meeting. It is always
// labeled "Sample conversation" and its evidence is marked synthetic.
// The demo quote content below is written into Graph8 as a real draft quote by the setup script.

export const SAMPLE_LABEL = "Sample conversation";
export const SAMPLE_SELLER_DOMAIN = "agency.example";

export const DEMO_COMPANY = {
  name: "[PromiseGuard Demo] Acme",
  domain: "promiseguard-demo-acme.example",
};

export const DEMO_CONTACT = {
  first_name: "[PromiseGuard Demo] Jordan",
  last_name: "Reyes",
  work_email: "jordan.reyes@promiseguard-demo-acme.example",
  job_title: "Operations Director",
};

export const DEMO_DEAL = {
  name: "[PromiseGuard Demo] Acme customer portal",
  amount: 8000,
  currency: "USD",
};

export const DEMO_QUOTE = {
  title: "[PromiseGuard Demo] Acme customer portal quote",
  currency: "USD",
  payment_terms: "net_30",
  contract_start_date: "2026-10-05",
  contract_duration_value: 1,
  contract_duration_unit: "months",
  line_items: [
    {
      product_name: "Web portal setup",
      description: "Customer web portal setup and launch.",
      quantity: 1,
      unit_amount: 800000,
      billing_frequency: "one_time",
    },
  ],
  terms_content: [
    "Scope",
    "Web portal setup for the Acme customer portal.",
    "",
    "Delivery",
    "Delivery: four weeks after receipt of final assets.",
    "",
    "Exclusions",
    "Data migration: excluded.",
    "Mobile applications: excluded.",
  ].join("\n"),
  notes: "[PromiseGuard Demo] Synthetic quote for demonstrating PromiseGuard. Do not send.",
};

export type SampleMessage = {
  speakerName: string;
  speakerEmail: string;
  text: string;
};

export type SampleSource = {
  id: string;
  kind: "sample";
  format: "call_transcript" | "email";
  title: string;
  occurredAt: string;
  participants: string[];
  messages: SampleMessage[];
};

const SELLER = { speakerName: "Sam Carter", speakerEmail: "sam.carter@agency.example" };
const BUYER = { speakerName: "Jordan Reyes", speakerEmail: DEMO_CONTACT.work_email };

export const SAMPLE_SOURCES: SampleSource[] = [
  {
    id: "acme-discovery-call",
    kind: "sample",
    format: "call_transcript",
    title: "Sample conversation: Acme discovery call",
    occurredAt: "2026-09-10T15:00:00.000Z",
    participants: [SELLER.speakerEmail, BUYER.speakerEmail],
    messages: [
      { ...BUYER, text: "Thanks for walking us through the portal. We have a few thousand customer records in our old system." },
      { ...SELLER, text: "We will migrate your existing customer records as part of the setup." },
      { ...BUYER, text: "Could you also build an Android app?" },
      { ...SELLER, text: "An Android app would need a separate proposal." },
    ],
  },
  {
    id: "acme-follow-up-email",
    kind: "sample",
    format: "email",
    title: "Sample conversation: follow-up email after discovery call",
    occurredAt: "2026-09-12T09:30:00.000Z",
    participants: [SELLER.speakerEmail, BUYER.speakerEmail],
    messages: [
      {
        ...SELLER,
        text: "Thanks for the call, Jordan. To confirm what we discussed: Three months of post-launch support are included. Delivery takes four weeks after you supply the final assets.",
      },
    ],
  },
];
