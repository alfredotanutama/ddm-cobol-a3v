import { useState } from "react";
import { Trash2, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { BroadcastBanner } from "@/components/broadcast";
import { getSettings, putSetting, useSettings } from "@/lib/settings-api";

export const ADMIN_USER = "alfredo";
// Emergency fallback: lets the admin in when the DB is unreachable. Only used after a failed
// getSettings() — the DB value is the source of truth whenever the server is reachable.
// ponytail: hardcoded in the bundle by design; keep it in sync if you change the admin password.
const ADMIN_FALLBACK_PASSWORD = "alfredo3gituloh";
const SESSION_KEY = "ddm_user";

export function getSessionUser(): string | null {
  return sessionStorage.getItem(SESSION_KEY);
}

export function logout() {
  sessionStorage.removeItem(SESSION_KEY);
}

export function LoginScreen({ onLogin }: { onLogin: (user: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);
  const { data: settings } = useSettings();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    setChecking(true);
    setError("");
    try {
      // Fetch fresh so a password just changed on another device is honored immediately.
      const { admin_pw, users } = await getSettings();
      const ok = u === ADMIN_USER ? password === admin_pw : users[u] === password;
      if (ok) {
        sessionStorage.setItem(SESSION_KEY, u);
        onLogin(u);
      } else {
        setError("Wrong user ID or password");
      }
    } catch {
      // Server unreachable — allow the admin in with the fallback password.
      if (u === ADMIN_USER && password === ADMIN_FALLBACK_PASSWORD) {
        sessionStorage.setItem(SESSION_KEY, u);
        onLogin(u);
      } else {
        setError("Can't reach the server — only the admin can sign in offline");
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex bg-background text-foreground font-sans">
      <div className="relative hidden lg:block lg:w-1/2 bg-[#0d0f0d]">
        <img
          src="/cobol-code.jpeg"
          alt="Close-up of a CRT screen showing COBOL MOVE and MODIFY statements"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.28)_0px,rgba(0,0,0,0.28)_1px,transparent_1px,transparent_3px)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(0,0,0,0.6)_100%)]"
        />
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
      <Card className="w-full max-w-sm border-none shadow-none bg-transparent">
        <CardHeader className="space-y-3">
          <img src="/favicon.svg" alt="" className="w-8 h-8" />
          <div className="space-y-1">
            <CardTitle className="text-xl tracking-tight">DDM Stream for COBOLers</CardTitle>
            <CardDescription>Sign in to continue</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-user">User ID</Label>
              <Input
                id="login-user"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-pass">Password</Label>
              <Input
                id="login-pass"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={checking}>
              {checking ? "Signing in…" : "Login"}
            </Button>
          </form>
          <div className="mt-6">
            <BroadcastBanner broadcast={settings?.broadcast ?? null} />
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}

export function UserManagerDialog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<{ id: string; pw: string }[]>([]);
  const [adminPw, setAdminPw] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const handleOpenChange = async (o: boolean) => {
    if (o) {
      setRows([]);
      setAdminPw("");
      setError("");
      try {
        const { admin_pw, users } = await getSettings();
        setRows(Object.entries(users).map(([id, pw]) => ({ id, pw })));
        setAdminPw(admin_pw ?? "");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load users");
      }
    }
    setOpen(o);
  };

  const update = (i: number, patch: Partial<{ id: string; pw: string }>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = async () => {
    if (!adminPw) return setError("Admin password can't be empty");
    const guests: Record<string, string> = {};
    for (const { id, pw } of rows) {
      const name = id.trim();
      if (!name || !pw) return setError("User ID and password can't be empty");
      if (name === ADMIN_USER) return setError(`"${ADMIN_USER}" is the admin — pick another ID`);
      if (name in guests) return setError(`Duplicate user ID "${name}"`);
      guests[name] = pw;
    }
    setSaving(true);
    setError("");
    try {
      await putSetting("users", guests);
      await putSetting("admin_pw", adminPw);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Users className="w-4 h-4" />
          Users
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Users</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="admin-pw">Admin password ({ADMIN_USER})</Label>
          <Input
            id="admin-pw"
            value={adminPw}
            onChange={(e) => setAdminPw(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Guest users</Label>
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={row.id}
                placeholder="User ID"
                onChange={(e) => update(i, { id: e.target.value })}
              />
              <Input
                value={row.pw}
                placeholder="Password"
                onChange={(e) => update(i, { pw: e.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label="Delete user"
                onClick={() => setRows(rows.filter((_, idx) => idx !== i))}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setRows([...rows, { id: "", pw: "" }])}
          >
            <Plus className="w-4 h-4" />
            Add user
          </Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
