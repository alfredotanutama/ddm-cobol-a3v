import { useState } from "react";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// ponytail: broadcast lives in localStorage — same per-browser ceiling as the user list; move both to a backend if messages must reach other machines
const BROADCAST_KEY = "ddm_broadcast";

export interface Broadcast {
  text: string;
  url: string;
  label: string;
}

export function loadBroadcast(): Broadcast | null {
  try {
    const b = JSON.parse(localStorage.getItem(BROADCAST_KEY) ?? "");
    if (b && typeof b === "object" && (b.text?.trim() || b.url?.trim())) {
      return { text: b.text ?? "", url: b.url ?? "", label: b.label ?? "" };
    }
  } catch {
    // no broadcast
  }
  return null;
}

export function BroadcastBanner({ broadcast }: { broadcast: Broadcast | null }) {
  if (!broadcast) return null;
  const href = /^https?:\/\//i.test(broadcast.url) ? broadcast.url : `https://${broadcast.url}`;
  return (
    <div className="flex items-start gap-3 rounded-md border bg-muted/40 px-4 py-3 text-sm">
      <Megaphone className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 space-y-0.5">
        {broadcast.text && <p className="whitespace-pre-wrap break-words">{broadcast.text}</p>}
        {broadcast.url && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline underline-offset-2 break-all"
          >
            {broadcast.label || broadcast.url}
          </a>
        )}
      </div>
    </div>
  );
}

export function BroadcastDialog({ onSaved }: { onSaved: (b: Broadcast | null) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");

  const handleOpenChange = (o: boolean) => {
    if (o) {
      const b = loadBroadcast();
      setText(b?.text ?? "");
      setUrl(b?.url ?? "");
      setLabel(b?.label ?? "");
    }
    setOpen(o);
  };

  const save = () => {
    const b: Broadcast = { text: text.trim(), url: url.trim(), label: label.trim() };
    if (!b.text && !b.url) {
      localStorage.removeItem(BROADCAST_KEY);
      onSaved(null);
    } else {
      localStorage.setItem(BROADCAST_KEY, JSON.stringify(b));
      onSaved(b);
    }
    setOpen(false);
  };

  const clear = () => {
    localStorage.removeItem(BROADCAST_KEY);
    onSaved(null);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2">
          <Megaphone className="w-4 h-4" />
          Broadcast
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Broadcast</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bc-text">Message</Label>
            <Textarea
              id="bc-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Announcement shown to every user on the login screen and inside the app"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bc-url">Link URL (optional)</Label>
            <Input
              id="bc-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/doc"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bc-label">Link text (optional)</Label>
            <Input
              id="bc-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Shown instead of the raw URL"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={clear}>
            Clear broadcast
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
