import { ScopeWorkspace } from "@/components/scope/ScopeWorkspace";

export const metadata = { title: "Scope check", description: "Work requested after the quote was signed, checked against the signed scope." };

export default async function ScopePage({ params }: PageProps<"/scope/[taskId]">) {
  const { taskId } = await params;
  return <ScopeWorkspace taskId={taskId} />;
}
