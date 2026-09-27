"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api/client-fetch";

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      className="px-3 py-1.5 text-muted hover:text-foreground"
      onClick={async () => {
        await api("/api/auth/logout", { method: "POST" }).catch(() => undefined);
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
