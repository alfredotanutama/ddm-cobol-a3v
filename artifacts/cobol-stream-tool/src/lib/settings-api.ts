import { useQuery } from "@tanstack/react-query";
import type { Broadcast } from "@/components/broadcast";

// Shared app state persisted server-side (see api/settings.ts). Passwords are hashed and verified
// on the server — they are never sent to the browser, so this shape has usernames only.
export interface AppSettings {
  broadcast: Broadcast | null;
  users: string[];
}

export async function getSettings(): Promise<AppSettings> {
  const res = await fetch("/api/settings");
  if (!res.ok) throw new Error(`Couldn't load settings (${res.status})`);
  const raw = (await res.json()) as Record<string, unknown>;
  return {
    broadcast: (raw.broadcast as Broadcast | null) ?? null,
    users: Array.isArray(raw.users) ? (raw.users as string[]) : [],
  };
}

/** Verify credentials on the server. Returns the authenticated user, or null if rejected. */
export async function login(user: string, password: string): Promise<string | null> {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "login", user, password }),
  });
  if (!res.ok) throw new Error(`Login failed (${res.status})`);
  const data = (await res.json()) as { ok: boolean; user: string | null };
  return data.ok ? data.user : null;
}

/**
 * Admin saves the guest list (and optionally a new admin password). Re-supplies the current admin
 * password, which the server verifies before applying. A blank user password keeps the current one.
 */
export async function saveUsers(
  adminPassword: string,
  users: { id: string; password: string }[],
  newAdminPassword: string,
): Promise<void> {
  const res = await fetch("/api/settings", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "save-users", adminPassword, newAdminPassword, users }),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => null);
    throw new Error((msg as { error?: string })?.error ?? `Couldn't save users (${res.status})`);
  }
}

export async function saveBroadcast(value: Broadcast | null): Promise<void> {
  const res = await fetch("/api/settings", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ key: "broadcast", value }),
  });
  if (!res.ok) throw new Error(`Couldn't save broadcast (${res.status})`);
}

/** Cached shared settings; components read broadcast/usernames from here and invalidate on save. */
export function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: getSettings });
}
