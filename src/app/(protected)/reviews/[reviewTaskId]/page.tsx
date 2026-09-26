import { ReviewWorkspace } from "@/components/reviews/review-workspace";

export const metadata = { title: "Review · PromiseGuard" };

export default async function ReviewPage({ params }: PageProps<"/reviews/[reviewTaskId]">) {
  const { reviewTaskId } = await params;
  return <ReviewWorkspace reviewTaskId={reviewTaskId} />;
}
