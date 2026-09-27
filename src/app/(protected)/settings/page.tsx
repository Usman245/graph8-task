import { ConnectionPanel } from "@/components/settings/ConnectionPanel";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Connection", description: "Check what the configured Graph8 connection can do." };

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Graph8 workspace"
        title="Connection and capabilities"
        description="Checks what the configured Graph8 key can do. A passing check is not proof every record is accessible."
      />
      <ConnectionPanel />
    </div>
  );
}
