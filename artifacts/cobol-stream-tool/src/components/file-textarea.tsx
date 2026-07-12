import { useRef } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Upload, Clipboard, Copy } from "lucide-react";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const TYPE_LEGEND: { code: string; label: string }[] = [
  { code: "9", label: "Numeric" },
  { code: "A", label: "Alphabetic" },
  { code: "X", label: "Alphanumeric" },
  { code: "9V9", label: "Numeric w/ decimals" },
];

export function FileTextarea({
  value,
  onChange,
  placeholder,
  label,
  showTypeLegend = false,
  showCopyButton = false,
  lengthBadge,
  lengthBadgeVariant = "default",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
  showTypeLegend?: boolean;
  showCopyButton?: boolean;
  lengthBadge?: string;
  lengthBadgeVariant?: "default" | "warning";
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copied to clipboard" });
    } catch (e) {
      toast({
        title: "Couldn't copy to clipboard",
        description: "Your browser may be blocking clipboard access.",
        variant: "destructive",
      });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === "string") {
        onChange(ev.target.result);
      }
    };
    reader.readAsText(file);
    if (fileRef.current) {
      fileRef.current.value = "";
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast({ title: "Clipboard is empty", variant: "destructive" });
        return;
      }
      onChange(text);
      toast({ title: "Pasted from clipboard" });
    } catch (e) {
      toast({
        title: "Couldn't read clipboard",
        description: "Your browser may be blocking clipboard access. Try pasting directly into the field instead.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-sm font-medium">{label}</Label>
          {lengthBadge && (
            <span
              className={
                "text-[11px] font-mono px-1.5 py-0.5 rounded " +
                (lengthBadgeVariant === "warning"
                  ? "bg-amber-500/15 text-amber-600 dark:text-amber-500"
                  : "bg-muted text-muted-foreground")
              }
            >
              {lengthBadge}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showCopyButton && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={handleCopy}
              disabled={!value}
            >
              <Copy className="w-3 h-3 mr-1.5" />
              Copy
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={handlePaste}
          >
            <Clipboard className="w-3 h-3 mr-1.5" />
            Paste
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-3 h-3 mr-1.5" />
            Upload .txt
          </Button>
          <input
            type="file"
            ref={fileRef}
            className="hidden"
            accept=".txt"
            onChange={handleFileChange}
          />
        </div>
      </div>
      <Textarea
        className="font-mono text-xs resize-y min-h-[120px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
      {showTypeLegend && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {TYPE_LEGEND.map(({ code, label }) => (
            <span key={code} className="inline-flex items-center gap-1">
              <span className="font-mono font-semibold text-foreground/70">{code}</span>
              <span>{label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
