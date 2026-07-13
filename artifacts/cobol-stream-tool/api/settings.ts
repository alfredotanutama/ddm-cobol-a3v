import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import pg from "pg";

// Shared app state (admin password, guest users, broadcast) in Postgres so it survives across
// sessions and devices. Passwords are stored HASHED (scrypt) and verified server-side — they are
// never returned to the browser.
//
// ponytail: module-scoped pool reused across warm invocations, max:1 connection via the Supabase
// session pooler — fine at this scale. Switch DATABASE_URL to the transaction pooler (port 6543)
// if connections ever exhaust.
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

// Admin username lives here too (the front-end has its own copy); the server is the one that
// verifies the admin password, so it must know which id is the admin.
const ADMIN_USER = "alfredo";

// === password hashing (Node crypto scrypt; no external dependency) ===
export function hashPw(pw: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString("hex")}$${dk.toString("hex")}`;
}

const isHashed = (s: unknown): s is string => typeof s === "string" && s.startsWith("scrypt$");

export function verifyPw(pw: string, stored: string): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  // Legacy plaintext (data from before hashing) — compare directly so old rows still work; the
  // login handler rehashes on success, so plaintext upgrades itself the first time it's used.
  if (parts.length !== 3 || parts[0] !== "scrypt") return pw === stored;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const dk = scryptSync(pw, salt, expected.length);
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}

interface Settings {
  admin_pw: string;
  users: Record<string, string>; // id -> hashed password
  broadcast: unknown;
}

async function readSettings(): Promise<Settings> {
  const { rows } = await pool.query<{ key: string; value: unknown }>(
    "select key, value from app_settings",
  );
  const map: Record<string, unknown> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    admin_pw: typeof map.admin_pw === "string" ? map.admin_pw : "",
    users:
      map.users && typeof map.users === "object" && !Array.isArray(map.users)
        ? (map.users as Record<string, string>)
        : {},
    broadcast: map.broadcast ?? null,
  };
}

async function writeKey(key: string, value: unknown): Promise<void> {
  if (value === null || value === undefined) {
    await pool.query("delete from app_settings where key = $1", [key]);
  } else {
    await pool.query(
      `insert into app_settings (key, value, updated_at) values ($1, $2::jsonb, now())
       on conflict (key) do update set value = excluded.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      // Public read: broadcast + the list of usernames. Never the password hashes.
      const s = await readSettings();
      return res.status(200).json({ broadcast: s.broadcast, users: Object.keys(s.users) });
    }

    if (req.method === "POST") {
      const body = (req.body ?? {}) as Record<string, unknown>;

      // Verify credentials server-side; the password is checked here, not in the browser.
      if (body.action === "login") {
        const user = String(body.user ?? "").trim();
        const password = String(body.password ?? "");
        const s = await readSettings();
        const stored = user === ADMIN_USER ? s.admin_pw : s.users[user];
        const ok = stored != null && verifyPw(password, stored);
        // Transparent upgrade: rehash any legacy plaintext that just authenticated.
        if (ok && !isHashed(stored)) {
          if (user === ADMIN_USER) {
            await writeKey("admin_pw", hashPw(password));
          } else {
            s.users[user] = hashPw(password);
            await writeKey("users", s.users);
          }
        }
        return res.status(200).json({ ok, user: ok ? user : null });
      }

      // Admin saves the user list. Passwords arrive as plaintext over HTTPS and are hashed here.
      // An empty password for an existing user means "keep current". The caller must be admin —
      // it re-supplies the admin password, which we verify before applying anything.
      if (body.action === "save-users") {
        const adminPassword = String(body.adminPassword ?? "");
        const newAdminPassword = String(body.newAdminPassword ?? "");
        const incoming = Array.isArray(body.users) ? (body.users as { id: string; password: string }[]) : [];
        const s = await readSettings();

        if (!verifyPw(adminPassword, s.admin_pw)) {
          return res.status(401).json({ error: "Wrong admin password" });
        }

        const nextUsers: Record<string, string> = {};
        for (const u of incoming) {
          const id = String(u?.id ?? "").trim();
          const pw = String(u?.password ?? "");
          if (!id || id === ADMIN_USER) continue;
          if (pw) nextUsers[id] = hashPw(pw);
          else if (s.users[id]) nextUsers[id] = s.users[id]; // keep existing hash
          // new id with no password -> skip (client validates this too)
        }
        await writeKey("users", nextUsers);
        if (newAdminPassword) await writeKey("admin_pw", hashPw(newAdminPassword));
        return res.status(200).json({ ok: true });
      }

      return res.status(400).json({ error: `unknown action: ${String(body.action)}` });
    }

    if (req.method === "PUT") {
      // Broadcast only — it's the one non-secret setting a plain PUT can touch. null clears it.
      const { key, value } = (req.body ?? {}) as { key?: string; value?: unknown };
      if (key !== "broadcast") return res.status(400).json({ error: `unknown key: ${String(key)}` });
      await writeKey("broadcast", value ?? null);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PUT");
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
  }
}
