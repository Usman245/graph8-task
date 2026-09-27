import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

// Optimistic check only. Every page and API route verifies the session again.
export async function proxy(request: NextRequest) {
  // The landing page is public.
  if (request.nextUrl.pathname === "/") return NextResponse.next();

  const session = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );
  if (session) return NextResponse.next();

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: "unauthenticated",
          message: "Sign in to continue.",
          retryable: false,
        },
      },
      { status: 401 },
    );
  }
  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  // api/webhooks is called by Graph8 (no session); it authenticates with its own URL token.
  matcher: [
    "/((?!login|api/auth|api/health|api/webhooks|_next/static|_next/image|favicon.ico|icon.svg).*)",
  ],
};
