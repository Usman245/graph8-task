import { DealWorkspace } from "@/components/deals/deal-workspace";

export const metadata = { title: "Deal · PromiseGuard" };

export default async function DealPage({ params }: PageProps<"/deals/[dealId]">) {
  const { dealId } = await params;
  return <DealWorkspace dealId={dealId} />;
}
