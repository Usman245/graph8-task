// Browser-safe scope-check labels (no Node imports), shared by server logic and components.
export const SCOPE_CLASSES = ["out_of_scope_agreed", "out_of_scope_unagreed", "needs_review", "in_scope"] as const;
export type ScopeClass = (typeof SCOPE_CLASSES)[number];

export const SCOPE_LABEL: Record<ScopeClass, string> = {
  out_of_scope_agreed: "Agreed without payment",
  out_of_scope_unagreed: "Requested, not agreed",
  needs_review: "Needs review",
  in_scope: "In scope",
};

export function scopeCounts(items: Array<{ classification: ScopeClass }>): Record<ScopeClass, number> {
  const c: Record<ScopeClass, number> = { out_of_scope_agreed: 0, out_of_scope_unagreed: 0, needs_review: 0, in_scope: 0 };
  for (const i of items) c[i.classification] += 1;
  return c;
}
