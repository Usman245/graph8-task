import { DealList } from "@/components/deals/deal-list";
import { currentMode } from "@/lib/promiseguard/mode";

export const metadata = { title: "Deals · PromiseGuard" };

export default async function DealsPage() {
  const mode = await currentMode();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Deals</h1>
        <p className="mt-1 text-sm text-muted">
          {mode === "demo"
            ? "Demo mode shows only [PromiseGuard Demo] deals stored in Graph8. Their conversation evidence is a labeled sample."
            : "Live mode shows real deals from your Graph8 workspace. Pick one to check its quotation against sales conversations."}
        </p>
      </div>
      <DealList mode={mode} />
    </div>
  );
}
