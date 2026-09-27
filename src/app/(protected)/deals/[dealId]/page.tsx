import { DealWorkspace } from "@/components/deals/DealWorkspace";

export const metadata = { title: "Deal", description: "Choose a quotation and sales conversations, then check every promise against the quote." };

export default async function DealPage({ params }: PageProps<"/deals/[dealId]">) {
  const { dealId } = await params;
  return <DealWorkspace dealId={dealId} />;
}
