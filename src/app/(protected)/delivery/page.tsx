import { DeliveryBoard } from "@/components/delivery/DeliveryBoard";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Delivery", description: "Track owners, deadlines, and completion evidence for promises handed to delivery." };

export default function DeliveryPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="After the sale"
        title="Promises in delivery"
        description={
          <p className="max-w-2xl">
            Track who owns each agreed commitment, when it is due, and what evidence was recorded when the work was completed.
          </p>
        }
      />
      <DeliveryBoard />
    </div>
  );
}
