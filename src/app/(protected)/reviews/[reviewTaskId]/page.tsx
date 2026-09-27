import { ReviewWorkspace } from "@/components/reviews/review-workspace";

export const metadata = { title: "Review", description: "Promise-by-promise comparison of sales conversations against the quotation, with evidence." };

export default async function ReviewPage({ params }: PageProps<"/reviews/[reviewTaskId]">) {
  const { reviewTaskId } = await params;
  return <ReviewWorkspace reviewTaskId={reviewTaskId} />;
}
