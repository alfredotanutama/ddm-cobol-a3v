import { useQuery } from "@tanstack/react-query";
import type { Broadcast } from "@/components/broadcast";

// Shared app state persisted server-side (see api/settings.ts), replacing per-browser localStorage
// so the admin password, guest users, and broadcast survive across sessions and devices.
export interface AppSettings {
  admin_pw: string | null;
  users: Record<string, string>;
  broadcast: Broadcast | null;
}

export async function getSettings(): Promise<AppSettings> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error(`Couldn't load settings (${res.status})`);
  const raw = (await res.json()) as Record<string, unknown>;
  return {
    admin_pw: typeof raw.admin_pw === "string" ? raw.admin_pw : null,
    users: raw.users && typeof raw.users === "object" ? (raw.users as Record<string, string>) : {},
    broadcast: (raw.broadcast as Broadcast | null) ?? null,
  };
}

export async function putSetting(key: keyof AppSettings, value: unknown): Promise<void> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  if (!res.ok) throw new Error(`Couldn't save settings (${res.status})`);
}

/** Cached shared settings; components read broadcast/users from here and invalidate on save. */
export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: getSettings });
}
