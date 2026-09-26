import { GuardBoard } from "@/components/guard/guard-board";
import { currentMode } from "@/lib/promiseguard/mode";

export const metadata = { title: "Quote Guard · PromiseGuard" };

export default async function GuardPage() {
  const mode = await currentMode();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Quote Guard</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted">
          Every quote is checked against what sales promised before it goes out. When a quote is created or edited in Graph8, PromiseGuard
          reviews it automatically; sending goes through a gate that stays closed while promise gaps are open.
          {mode === "demo" ? " Demo mode shows [PromiseGuard Demo] quotes; sends are rendered by Graph8's send preview and never delivered." : ""}
        </p>
      </div>
      <GuardBoard />
    </div>
  );
}
