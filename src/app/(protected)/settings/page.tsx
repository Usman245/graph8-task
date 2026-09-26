import { ConnectionPanel } from "@/components/settings/connection-panel";

export const metadata = { title: "Connection · PromiseGuard" };

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Connection and capabilities</h1>
        <p className="mt-1 text-sm text-muted">
          Checks what the configured Graph8 key can do. A passing check is not proof every record is accessible.
        </p>
      </div>
      <ConnectionPanel />
    </div>
  );
}
