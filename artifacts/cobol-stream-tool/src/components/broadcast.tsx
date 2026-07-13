import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
import { getSettings, saveBroadcast } from "@/lib/settings-api";

export interface Broadcast {
  text: string;
  url: string;
  label: string;
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

export function BroadcastDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const handleOpenChange = async (o: boolean) => {
    if (o) {
      setText("");
      setUrl("");
      setLabel("");
      try {
        const b = (await getSettings()).broadcast;
        setText(b?.text ?? "");
        setUrl(b?.url ?? "");
        setLabel(b?.label ?? "");
      } catch {
        // start blank if load fails
      }
    }
    setOpen(o);
  };

  const persist = async (value: Broadcast | null) => {
    setSaving(true);
    try {
      await saveBroadcast(value);
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
      setOpen(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't save broadcast");
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    const b: Broadcast = { text: text.trim(), url: url.trim(), label: label.trim() };
    persist(b.text || b.url ? b : null);
  };

  const clear = () => persist(null);

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
          <Button variant="outline" onClick={clear} disabled={saving}>
            Clear broadcast
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
