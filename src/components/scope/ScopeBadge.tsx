import { Badge } from "@/components/ui/Badge";
import { SCOPE_LABEL, type ScopeClass } from "@/lib/promiseguard/scope-labels";

const TONE: Record<ScopeClass, "conflict" | "missing" | "review" | "covered"> = {
  out_of_scope_agreed: "conflict",
  out_of_scope_unagreed: "missing",
  needs_review: "review",
  in_scope: "covered",
};

export function ScopeBadge({ value }: { value: ScopeClass }) {
  return <Badge tone={TONE[value]}>{SCOPE_LABEL[value]}</Badge>;
}
