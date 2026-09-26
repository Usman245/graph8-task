"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client-fetch";

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      className="px-2 py-1"
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
