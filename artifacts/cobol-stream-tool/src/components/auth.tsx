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

export const ADMIN_USER = "alfredo";
const ADMIN_PASSWORD = "alfredo3gituloh";
const ADMIN_PW_KEY = "ddm_admin_pw";
const USERS_KEY = "ddm_users";
const SESSION_KEY = "ddm_user";

function adminPassword(): string {
  return localStorage.getItem(ADMIN_PW_KEY) ?? ADMIN_PASSWORD;
}

// ponytail: plaintext passwords in localStorage — this is a client-side gate only; move to a real backend if it must be secure
function loadGuests(): Record<string, string> {
  try {
    const stored = JSON.parse(localStorage.getItem(USERS_KEY) ?? "");
    if (stored && typeof stored === "object" && !Array.isArray(stored)) return stored;
  } catch {
    // fall through to seed
  }
  const seed = { ids: "ids" };
  localStorage.setItem(USERS_KEY, JSON.stringify(seed));
  return seed;
}

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

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const u = username.trim();
    const ok = u === ADMIN_USER ? password === adminPassword() : loadGuests()[u] === password;
    if (ok) {
      sessionStorage.setItem(SESSION_KEY, u);
      onLogin(u);
    } else {
      setError("Wrong user ID or password");
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex bg-background text-foreground font-sans">
      <div className="relative hidden lg:block lg:w-1/2 bg-[#0d0f0d]">
        <img
          src="/cobol.png"
          alt="CRT terminal displaying COBOL — Common Business Oriented Language"
          className="absolute inset-0 h-full w-full object-cover"
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
            <Button type="submit" className="w-full">
              Login
            </Button>
          </form>
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

  const handleOpenChange = (o: boolean) => {
    if (o) {
      setRows(Object.entries(loadGuests()).map(([id, pw]) => ({ id, pw })));
      setAdminPw(adminPassword());
      setError("");
    }
    setOpen(o);
  };

  const update = (i: number, patch: Partial<{ id: string; pw: string }>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const save = () => {
    if (!adminPw) return setError("Admin password can't be empty");
    const guests: Record<string, string> = {};
    for (const { id, pw } of rows) {
      const name = id.trim();
      if (!name || !pw) return setError("User ID and password can't be empty");
      if (name === ADMIN_USER) return setError(`"${ADMIN_USER}" is the admin — pick another ID`);
      if (name in guests) return setError(`Duplicate user ID "${name}"`);
      guests[name] = pw;
    }
    localStorage.setItem(USERS_KEY, JSON.stringify(guests));
    localStorage.setItem(ADMIN_PW_KEY, adminPw);
    setOpen(false);
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
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
