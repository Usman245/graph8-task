// Host health check. Exposes no Graph8 data or configuration.
export async function GET() {
  return Response.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
}
