import { useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Upload, Clipboard, Copy, Download, Eraser } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "./empty-state";
import { parseCopybook } from "@/lib/cobol";
import { toPreTemplate, isTemplateField } from "@/lib/decodeeto";

export function DecodeetoTab() {
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { output, fieldCount, warnings } = useMemo(() => {
    if (!source.trim()) return { output: "", fieldCount: 0, warnings: [] as string[] };
    const parsed = parseCopybook(source);
    const fieldCount = parsed.filter(isTemplateField).length;
    const warnings = parsed
      .filter((f) => f.parseWarning)
      .map((f) => `${f.name}: ${f.parseWarning} — its length in the template may be wrong.`);
    // No exportable fields = not a copybook; keep the empty state instead of a header-only file.
    return { output: fieldCount ? toPreTemplate(parsed) : "", fieldCount, warnings };
  }, [source]);

  const readFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === "string") {
        setSource(ev.target.result);
        setFileName(file.name);
      }
    };
    reader.readAsText(file);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) {
        toast({ title: "Clipboard is empty", variant: "destructive" });
        return;
      }
      setSource(text);
      setFileName(null);
      toast({ title: "Pasted from clipboard" });
    } catch {
      toast({
        title: "Couldn't read clipboard",
        description: "Your browser may be blocking clipboard access. Try pasting directly into the field instead.",
        variant: "destructive",
      });
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      toast({ title: "Copied to clipboard" });
    } catch {
      toast({ title: "Couldn't copy to clipboard", variant: "destructive" });
    }
  };

  const handleDownload = () => {
    const blob = new Blob([output + "\n"], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const stamp = `${p(now.getMonth() + 1)}${p(now.getDate())}${String(now.getFullYear()).slice(-2)}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    const base = fileName ? fileName.replace(/\.[^.]+$/, "") : null;
    a.download = base ? `pre-template_${base}_${stamp}.txt` : `pre-template_${stamp}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: "DECODEETO", description: `${fieldCount} field${fieldCount === 1 ? "" : "s"} exported.` });
  };

  const clearAll = () => {
    setSource("");
    setFileName(null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardContent className="pt-6">
          <div
            className={`flex flex-col gap-2 rounded-md border border-dashed p-3 transition-colors ${
              dragOver ? "border-primary bg-primary/5" : "border-transparent"
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              readFile(e.dataTransfer.files?.[0]);
            }}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Copybook</Label>
                {fileName && (
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{fileName}</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handlePaste}>
                  <Clipboard className="w-3 h-3 mr-1.5" />
                  Paste
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => fileRef.current?.click()}>
                  <Upload className="w-3 h-3 mr-1.5" />
                  Upload
                </Button>
                <input
                  type="file"
                  ref={fileRef}
                  className="hidden"
                  accept=".txt,.cbl,.cob,.cpy"
                  onChange={(e) => {
                    readFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearAll} disabled={!source}>
                  <Eraser className="w-3 h-3 mr-1.5" />
                  Clear
                </Button>
              </div>
            </div>
            <Textarea
              className="font-mono text-xs resize-y min-h-[420px] whitespace-pre overflow-x-auto"
              wrap="off"
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setFileName(null);
              }}
              placeholder={"Paste, upload, or drag & drop a COBOL copybook here.\nEach field becomes a DECODEETO pre-template line."}
              spellCheck={false}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {!output ? (
            <EmptyState>
              The DECODEETO pre-template (LABEL:LEN:VISIBLE:TYPE) will appear here — save it as a .txt and load it in DECODEETO.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Pre-template</Label>
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {fieldCount} field{fieldCount === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleCopy}>
                    <Copy className="w-3 h-3 mr-1.5" />
                    Copy
                  </Button>
                  <Button size="sm" className="h-7 text-xs" onClick={handleDownload}>
                    <Download className="w-3 h-3 mr-1.5" />
                    Download .txt
                  </Button>
                </div>
              </div>
              <Textarea
                className="font-mono text-xs resize-y min-h-[420px] whitespace-pre overflow-x-auto"
                wrap="off"
                value={output}
                readOnly
                spellCheck={false}
              />
              {warnings.map((w, i) => (
                <p key={i} className="text-[11px] text-amber-600 dark:text-amber-500">
                  {w}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
