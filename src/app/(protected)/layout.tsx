import Link from "next/link";
import { Logo } from "@/components/logo";
import { LogoutButton } from "@/components/logout-button";
import { ModeSwitch } from "@/components/mode-switch";
import { NavLinks } from "@/components/nav-links";
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
        <div role="status" className="flex items-center justify-center gap-2 bg-missing-soft px-4 py-1.5 text-center text-xs font-medium text-missing">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-missing" />
          Demo mode · Sample conversation · Live Graph8 AI and storage
        </div>
      ) : (
        <div role="status" className="flex items-center justify-center gap-2 bg-primary-soft px-4 py-1.5 text-center text-xs font-medium text-primary">
          <span aria-hidden className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Live mode · Real Graph8 deals, quotes, emails, and transcripts · Live Graph8 AI and storage
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-border/80 bg-surface/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 items-center gap-6">
            <Link href="/" aria-label="PromiseGuard home">
              <Logo />
            </Link>
            <NavLinks />
          </div>
          <div className="flex items-center gap-2">
            <ModeSwitch mode={mode} demoEnabled={demoEnabled} />
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{children}</main>
      <footer className="border-t border-border/70 py-6 text-center text-xs text-muted">
        PromiseGuard · Decision support built on Graph8. Not a determination of contractual liability.
      </footer>
    </div>
  );
}
