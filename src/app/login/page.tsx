import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · PromiseGuard" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <p className="text-sm font-semibold tracking-wide text-primary">PromiseGuard</p>
        <h1 className="mt-2 text-2xl font-semibold">Sign in to the review workspace</h1>
        <p className="mt-2 text-sm text-muted">
          Compare what sales promised with what the quotation actually covers.
        </p>
        <LoginForm />
      </div>
    </main>
  );
}
