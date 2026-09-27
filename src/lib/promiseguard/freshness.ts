import "server-only";
import type { Deal } from "@/lib/graph8/adapters/deals";
import { sha256 } from "./hash";
import { sourceHash } from "./normalize";
import { PROMPT_VERSION } from "./prompt";
import { refKey, type Mode, type SourceRef } from "./schemas";
import { findSourceCandidates, loadSource, type CandidateScan } from "./sources";

export const discoveryKeys = (scan: CandidateScan) => [...new Set(scan.candidates.map((c) => refKey(c.ref)))].sort();
export const discoveryComplete = (scan: CandidateScan) => scan.errors.length === 0 && scan.candidates.every((c) => c.textAvailable);

export function evidenceFingerprint(quoteHash: string, sourceHashes: Record<string, string>, discoveredSourceKeys: string[], mode: Mode): string {
  return sha256({ quoteHash, sourceHashes, discoveredSourceKeys: [...discoveredSourceKeys].sort(), mode, promptVersion: PROMPT_VERSION });
}

/** Request-scoped reads only: a subsequent send always reads Graph8 again. */
export function evidenceReader(deal: Deal, mode: Mode) {
  let discovery: Promise<CandidateScan> | undefined;
  const sources = new Map<string, ReturnType<typeof loadSource>>();
  return {
    scan: () => (discovery ??= findSourceCandidates(deal, mode)),
    load: (ref: SourceRef) => {
      const key = refKey(ref);
      if (!sources.has(key)) sources.set(key, loadSource(deal, ref, mode));
      return sources.get(key)!;
    },
  };
}

export async function readSourceHashes(reader: ReturnType<typeof evidenceReader>, refs: SourceRef[]) {
  const loaded = await Promise.all(refs.map((ref) => reader.load(ref)));
  return Object.fromEntries(loaded.map((s) => [refKey(s.ref), sourceHash(s.documents)]));
}
