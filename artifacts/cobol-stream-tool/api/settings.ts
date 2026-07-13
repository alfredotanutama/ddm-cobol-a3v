import type { VercelRequest, VercelResponse } from "@vercel/node";
import pg from "pg";

// Shared app state (admin password, guest users, broadcast) persisted in Postgres so it
// survives across sessions and devices, instead of per-browser localStorage.
//
// ponytail: module-scoped pool reused across warm invocations, max:1 connection per instance
// via the Supabase session pooler — fine at this traffic. If connections exhaust, switch the
// DATABASE_URL to the transaction pooler (port 6543).
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

const KEYS = ["admin_pw", "users", "broadcast"] as const;
type Key = (typeof KEYS)[number];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === "GET") {
      const { rows } = await pool.query<{ key: string; value: unknown }>(
        "select key, value from app_settings",
      );
      const out: Record<string, unknown> = {};
      for (const r of rows) out[r.key] = r.value;
      return res.status(200).json(out);
    }

    if (req.method === "PUT") {
      const { key, value } = (req.body ?? {}) as { key?: string; value?: unknown };
      if (!key || !KEYS.includes(key as Key)) {
        return res.status(400).json({ error: `unknown settings key: ${key}` });
      }
      // null clears a key (used to remove the broadcast).
      if (value === null || value === undefined) {
        await pool.query("delete from app_settings where key = $1", [key]);
      } else {
        await pool.query(
          `insert into app_settings (key, value, updated_at) values ($1, $2::jsonb, now())
           on conflict (key) do update set value = excluded.value, updated_at = now()`,
          [key, JSON.stringify(value)],
        );
      }
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : "server error" });
  }
}
