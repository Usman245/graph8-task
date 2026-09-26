import Link from "next/link";
import { LogoutButton } from "@/components/logout-button";
import { ModeSwitch } from "@/components/mode-switch";
import { requirePageSession } from "@/lib/auth/guard";
import { env } from "@/lib/env";
import { currentMode } from "@/lib/promiseguard/mode";

export default async function ProtectedLayout({ children }: LayoutProps<"/">) {
  await requirePageSession();
  const mode = await currentMode();
  const demoEnabled = env().PROMISEGUARD_DEMO_ENABLED;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {mode === "demo" ? (
        <div role="status" className="bg-missing-soft px-4 py-2 text-center text-sm font-medium text-missing">
          Demo mode · Sample conversation · Live Graph8 AI and storage
        </div>
      ) : (
        <div role="status" className="bg-primary-soft px-4 py-2 text-center text-sm font-medium text-primary">
          Live mode · Real Graph8 deals, quotes, emails, and transcripts · Live Graph8 AI and storage
        </div>
      )}
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/deals" className="font-semibold">
              PromiseGuard
            </Link>
            <nav aria-label="Main" className="flex gap-4 text-sm text-muted">
              <Link href="/guard" className="hover:text-foreground">
                Quote Guard
              </Link>
              <Link href="/deals" className="hover:text-foreground">
                Deals
              </Link>
              <Link href="/settings" className="hover:text-foreground">
                Connection
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <ModeSwitch mode={mode} demoEnabled={demoEnabled} />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </div>
  );
}
