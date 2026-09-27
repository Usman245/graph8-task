import { GuardBoard } from "@/components/guard/guard-board";
import { PageHeader } from "@/components/ui/page-header";
import { currentMode } from "@/lib/promiseguard/mode";

export const metadata = { title: "Quote Guard", description: "Every quote is reviewed automatically and sending stays blocked while promise risks are open." };

export default async function GuardPage() {
  const mode = await currentMode();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Send gate"
        title="Quote Guard"
        description={
          <p className="max-w-3xl">
            Every quote is checked against what sales promised before it goes out. When a quote is created or edited in Graph8, PromiseGuard
            reviews it automatically; sending goes through a gate that stays closed while promise risks are open.
            {mode === "demo" ? " Demo mode shows [PromiseGuard Demo] quotes; sends are rendered by Graph8's send preview and never delivered." : ""}
          </p>
        }
      />
      <GuardBoard />
    </div>
  );
}
