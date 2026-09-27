/* eslint-disable @typescript-eslint/no-explicit-any -- Graph8 setup responses are untyped JSON */
// Creates one clearly labelled, non-contactable Graph8 dataset that exercises PromiseGuard in Live mode.
// It is idempotent and never sends a quote or email.

import { describeError, g8 } from "./lib/g8.mts";

const COMPANY_NAME = "PromiseGuard Live — Harbor & Pine";
const COMPANY_DOMAIN = "harborpine.example";
const CONTACT_EMAIL = `amina.shah@${COMPANY_DOMAIN}`;
const DEAL_NAME = "PromiseGuard Live — Harbor & Pine Website Launch";
const QUOTE_TITLE = "PromiseGuard Live — Harbor & Pine Website Launch Quote";
const SELLER_NOTE = [
  "Synthetic live-mode seller recap for PromiseGuard; do not contact this account.",
  "We confirmed that website hosting is included at no charge for the first year.",
  "We committed to two administrator training sessions after Harbor & Pine supplies the final content and brand assets.",
  "We also committed to launching within 30 days after all final content and brand assets are received.",
].join(" ");

function listData(value: any): any[] {
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.data?.items)) return value.data.items;
  return [];
}

async function main() {
  const companies = await g8("GET", "/companies", {
    operation: "find live fixture company",
    query: { page: 1, limit: 100, search: COMPANY_NAME },
  });
  let company = listData(companies).find((item) => item.name === COMPANY_NAME);
  if (!company) {
    const created = await g8("POST", "/companies", {
      operation: "create live fixture company",
      body: {
        name: COMPANY_NAME,
        domain: COMPANY_DOMAIN,
        website: `https://${COMPANY_DOMAIN}`,
        description: "Live-mode validation account for PromiseGuard. Synthetic hackathon data; do not contact.",
      },
    });
    const companyId = created?.data?.company_id;
    company = { id: companyId };
    console.log(`company: created id=${companyId}`);
  } else {
    console.log(`company: reuse id=${company.id}`);
  }

  const contacts = await g8("GET", "/contacts", {
    operation: "find live fixture contact",
    query: { page: 1, limit: 100, search: CONTACT_EMAIL },
  });
  let contact = listData(contacts).find(
    (item) => String(item.work_email ?? item.email ?? "").toLowerCase() === CONTACT_EMAIL,
  );
  if (!contact) {
    const created = await g8("POST", "/contacts", {
      operation: "create live fixture contact",
      body: {
        first_name: "Amina",
        last_name: "Shah",
        work_email: CONTACT_EMAIL,
        job_title: "Operations Director",
        company_id: company.id,
        company_domain: COMPANY_DOMAIN,
      },
    });
    const contactId = created?.data?.contact_id;
    contact = { id: contactId };
    console.log(`contact: created id=${contactId}`);
  } else {
    console.log(`contact: reuse id=${contact.id}`);
  }

  const members = await g8("GET", "/team-members", { operation: "find live fixture owner" });
  const ownerId = process.env.PROMISEGUARD_DEMO_OWNER_ID || listData(members)[0]?.id;
  if (!ownerId) throw new Error("No Graph8 team member is available to own the live fixture");

  const deals = await g8("GET", "/deals", {
    operation: "find live fixture deal",
    query: { page: 1, limit: 100, search: DEAL_NAME },
  });
  let deal = listData(deals).find((item) => item.name === DEAL_NAME);
  if (!deal) {
    const created = await g8("POST", "/deals", {
      operation: "create live fixture deal",
      body: {
        name: DEAL_NAME,
        amount: 12000,
        currency: "USD",
        owner_id: ownerId,
        contact_ids: [contact.id],
      },
    });
    deal = created?.data;
    console.log(`deal: created id=${deal?.id}`);
  } else {
    console.log(`deal: reuse id=${deal.id}`);
  }
  if (!deal?.id) throw new Error("Graph8 did not return a deal ID");

  const notes = await g8("GET", `/deals/${encodeURIComponent(deal.id)}/notes`, {
    operation: "find live fixture seller note",
  });
  const noteExists = listData(notes).some((item) => item.content === SELLER_NOTE);
  if (!noteExists) {
    const created = await g8("POST", `/deals/${encodeURIComponent(deal.id)}/notes`, {
      operation: "create live fixture seller note",
      body: { content: SELLER_NOTE },
    });
    console.log(`seller note: created id=${created?.data?.id}`);
  } else {
    console.log("seller note: reuse");
  }

  const quotes = await g8("GET", "/quotes", {
    operation: "find live fixture quote",
    query: { deal_id: deal.id, page: 1, limit: 50 },
  });
  let quote = listData(quotes).find((item) => item.title === QUOTE_TITLE);
  if (!quote) {
    const created = await g8("POST", "/quotes", {
      operation: "create live fixture draft quote",
      body: {
        title: QUOTE_TITLE,
        deal_id: deal.id,
        mashup_company_id: company.id,
        signer_contact_id: contact.id,
        signer_email: CONTACT_EMAIL,
        signer_name: "Amina Shah",
        owner_id: ownerId,
        currency: "USD",
        payment_terms: "net_30",
        contract_start_date: "2026-10-15",
        contract_duration_value: 12,
        contract_duration_unit: "months",
        line_items: [
          {
            product_name: "Website design and launch",
            description: "Design, build, and launch the Harbor & Pine website.",
            quantity: 1,
            unit_amount: 1200000,
            billing_frequency: "one_time",
          },
        ],
        terms_content: [
          "Scope",
          "Design, build, and launch a responsive website.",
          "One administrator training session is included.",
          "",
          "Exclusions",
          "Website hosting is not included and will be billed separately.",
          "Launch timing will be agreed after content delivery.",
        ].join("\n"),
        notes: "Synthetic live-mode fixture for PromiseGuard. Do not send.",
        billing_legal_name: COMPANY_NAME,
        billing_email: CONTACT_EMAIL,
        billing_address: `${COMPANY_NAME}, 1 Example Street, Lahore (synthetic address)`,
      },
    });
    quote = created?.data;
    console.log(`quote: created id=${quote?.id} status=${quote?.status}`);
  } else {
    console.log(`quote: reuse id=${quote.id} status=${quote.status}`);
  }

  console.log(JSON.stringify({ companyId: company.id, contactId: contact.id, dealId: deal.id, quoteId: quote?.id }, null, 2));
  console.log("Safety: draft only; no quote or email was sent.");
}

main().catch((error) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
