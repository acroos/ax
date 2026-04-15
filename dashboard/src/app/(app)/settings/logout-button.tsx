"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/auth/logout", { method: "POST" });
      router.push("/login");
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <button
      onClick={handleLogout}
      disabled={loggingOut}
      className="px-3 py-1.5 rounded-md bg-red/10 text-red hover:bg-red/20 text-xs font-medium transition-colors disabled:opacity-50"
    >
      {loggingOut ? "Logging out..." : "Log out"}
    </button>
  );
}
