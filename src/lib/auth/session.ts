// Signed session cookie using Web Crypto HMAC-SHA256. Imported by proxy.ts and
// route handlers, so it reads process.env directly instead of the server-only env module.

export const SESSION_COOKIE = "pg_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12;

export type Session = { sub: "operator"; iat: number; exp: number };

const encoder = new TextEncoder();

function secret(): string | null {
  const value = process.env.PROMISEGUARD_SESSION_SECRET;
  return value && value.length >= 32 ? value : null;
}

export function isSessionConfigured(): boolean {
  return Boolean(secret() && process.env.PROMISEGUARD_APP_PASSWORD);
}

async function hmacKey(value: string) {
  return crypto.subtle.importKey("raw", encoder.encode(value), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function b64url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const key = secret();
  if (!key) throw new Error("PROMISEGUARD_SESSION_SECRET must be at least 32 characters");
  const iat = Math.floor(now / 1000);
  const payload: Session = { sub: "operator", iat, exp: iat + SESSION_TTL_SECONDS };
  const body = b64url(encoder.encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(key), encoder.encode(body)));
  return `${body}.${b64url(sig)}`;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<Session | null> {
  const key = secret();
  if (!key || !token) return null;
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return null;
  let valid = false;
  try {
    // crypto.subtle.verify performs a constant-time signature comparison.
    valid = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(key),
      Buffer.from(sig, "base64url"),
      encoder.encode(body),
    );
  } catch {
    return null;
  }
  if (!valid) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
    if (payload.sub !== "operator" || typeof payload.exp !== "number") return null;
    if (payload.exp * 1000 <= now) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Constant-time password check: compares HMAC digests so length differences leak nothing. */
export async function passwordMatches(supplied: string): Promise<boolean> {
  const expected = process.env.PROMISEGUARD_APP_PASSWORD;
  const key = secret();
  if (!expected || !key) return false;
  const k = await hmacKey(key);
  const [a, b] = await Promise.all([
    crypto.subtle.sign("HMAC", k, encoder.encode(supplied)),
    crypto.subtle.sign("HMAC", k, encoder.encode(expected)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
