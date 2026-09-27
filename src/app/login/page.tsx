import Link from "next/link";
import { Logo } from "@/components/logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in", description: "Sign in to the PromiseGuard review workspace." };

const POINTS = [
  "Find commitments missing from the quotation",
  "Block risky sends until gaps are resolved",
  "Hand agreed promises to delivery with evidence",
];

export default function LoginPage() {
  return (
    <main className="grid flex-1 lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-foreground p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(520px 320px at 90% 10%, rgba(36,83,199,.55), transparent 70%), radial-gradient(420px 260px at 0% 100%, rgba(154,91,0,.45), transparent 70%)",
          }}
        />
        <Link href="/" aria-label="PromiseGuard home" className="relative w-fit">
          <Logo inverted />
        </Link>
        <div className="relative max-w-md">
          <p className="text-4xl font-semibold leading-tight tracking-tight">
            Every promise sales makes,
            <br />
            <span className="text-white/60">checked against the quote.</span>
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/75">
            {POINTS.map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span aria-hidden className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-[11px]">
                  ✓
                </span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/50">Built on Graph8 CRM, AI, and storage.</p>
      </section>

      <section className="flex items-center justify-center px-4 py-16">
        <div className="pg-rise w-full max-w-sm">
          <Link href="/" aria-label="PromiseGuard home" className="inline-block lg:hidden">
            <Logo />
          </Link>
          <h1 className="mt-6 text-3xl font-semibold tracking-tight lg:mt-0">Sign in</h1>
          <p className="mt-2 text-sm text-muted">Compare what sales promised with what the quotation actually covers.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
