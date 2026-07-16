import { useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, Clipboard, Copy, Download, Eraser } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "./empty-state";
import { parseMqDump } from "@/lib/mqdump";
import { getStripHeader, getStripFields } from "./strip-tab";
import { decomposeStream, type ParsedField } from "@/lib/cobol";
import { isDataField, escapeValue } from "@/lib/delimit";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function MqParseTab() {
  const [source, setSource] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [header, setHeader] = useState("");
  const [cbFields, setCbFields] = useState<ParsedField[]>([]);
  const [previewFiller, setPreviewFiller] = useState(false);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const { messages, skipped } = useMemo(
    () => (source ? parseMqDump(source) : { messages: [], skipped: 0 }),
    [source],
  );
  const output = useMemo(() => {
    const body = messages.map((m) => m.decoded).join("\n");
    return header.trim() ? `${header.trim()}\n${body}` : body;
  }, [messages, header]);

  // Header delimiter = the most frequent candidate char; field count = split by it.
  const headerInfo = useMemo(() => {
    const h = header.trim();
    if (!h) return null;
    const delim = [";", ",", "|", "\t"].reduce((best, d) =>
      h.split(d).length > h.split(best).length ? d : best,
    );
    const count = h.split(delim).length;
    const collision =
      count > 1 && messages.some((m) => m.decoded.includes(delim))
        ? `Delimiter "${delim}" also appears inside the message data — columns won't line up if this is used as a CSV.`
        : null;
    return { delim, count, collision };
  }, [header, messages]);

  // Per-variable crosscheck of the first and last message, like Delimiter Export —
  // needs the copybook fields imported from the Strip tab.
  const crosscheck = useMemo(() => {
    // Explicitly imported fields win; otherwise fall back to whatever copybook
    // the Strip tab currently holds, so the table appears without extra clicks.
    if (!header.trim()) return []; // preview only once a header is set
    const fields = cbFields.length ? cbFields : getStripFields();
    if (!fields.length || !messages.length) return [];
    const include = previewFiller ? (f: ParsedField) => !f.isGroup && f.length > 0 : isDataField;
    const first = decomposeStream(fields, messages[0].decoded).filter(include);
    const last = decomposeStream(fields, messages[messages.length - 1].decoded).filter(include);
    return first.map((f, i) => ({ id: f.id, name: f.name, pic: f.picRaw, first: f.value, last: last[i]?.value ?? "" }));
  }, [cbFields, messages, header, previewFiller]);
  const warnings = useMemo(
    () => messages.filter((m) => m.warning).map((m) => `Message ${m.index}: ${m.warning}`),
    [messages],
  );

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
      toast({
        title: "Couldn't copy to clipboard",
        description: "Your browser may be blocking clipboard access.",
        variant: "destructive",
      });
    }
  };

  const handleDownload = (format: "txt" | "csv") => {
    let content = output;
    if (format === "csv") {
      // Split each message per copybook field and join with the header's delimiter,
      // same rules as Delimiter Export (FILLER/groups skipped, values escaped).
      const fields = cbFields.length ? cbFields : getStripFields();
      const delim = headerInfo?.delim ?? ";";
      if (!fields.length) {
        toast({
          title: "No copybook available",
          description: "CSV needs the copybook from the Strip tab (Import from Strip).",
          variant: "destructive",
        });
        return;
      }
      const included = (f: ParsedField) => isDataField(f) && !excluded.has(f.id);
      const rows = messages.map((m) =>
        decomposeStream(fields, m.decoded)
          .filter(included)
          .map((v) => escapeValue(v.value, delim))
          .join(delim),
      );
      // Header regenerated from the included fields so columns always line up.
      const csvHeader = fields.filter(included).map((f) => escapeValue(f.name, delim)).join(delim);
      content = [csvHeader, ...rows].filter(Boolean).join("\n");
    }

    const blob = new Blob([content + "\n"], {
      type: format === "csv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const stamp = `${p(now.getMonth() + 1)}${p(now.getDate())}${String(now.getFullYear()).slice(-2)}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    const base = fileName ? fileName.replace(/\.[^.]+$/, "") : null;
    a.download = base ? `MQParsed_${base}_${stamp}.${format}` : `mqparsed_${stamp}.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: "Parse Message", description: `${messages.length} message${messages.length === 1 ? "" : "s"} exported.` });
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
                <Label className="text-sm font-medium">Message</Label>
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
                  Upload .txt
                </Button>
                <input
                  type="file"
                  ref={fileRef}
                  className="hidden"
                  accept=".txt,.log,.out"
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
              placeholder="Paste, or Drag Message Here."
              spellCheck={false}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {!source ? (
            <EmptyState>
              Decoded message bodies will appear here, one line per message — ready to paste into Decompose or Delimiter Export with a copybook.
            </EmptyState>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label className="text-sm font-medium">Decoded Messages</Label>
                  <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                    {messages.length} message{messages.length === 1 ? "" : "s"}
                    {skipped > 0 ? `, ${skipped} skipped` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleCopy} disabled={!output}>
                    <Copy className="w-3 h-3 mr-1.5" />
                    Copy
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="sm" className="h-7 text-xs" disabled={!output}>
                        <Download className="w-3 h-3 mr-1.5" />
                        Download
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem className="text-xs" onClick={() => handleDownload("txt")}>
                        .txt — decoded messages as-is
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-xs" onClick={() => handleDownload("csv")}>
                        .csv — split per copybook field
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="mq-header" className="text-[11px] font-normal text-muted-foreground whitespace-nowrap">
                  Add header:
                </Label>
                <Input
                  id="mq-header"
                  className="h-7 text-[11px] font-mono"
                  value={header}
                  onChange={(e) => setHeader(e.target.value)}
                  placeholder="optional — added as the first line"
                  spellCheck={false}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs whitespace-nowrap"
                  onClick={() => {
                    const h = getStripHeader();
                    if (h) {
                      setHeader(h);
                      setCbFields(getStripFields());
                      toast({ title: "Header imported from Strip" });
                    } else {
                      toast({
                        title: "No header in Strip",
                        description: "Strip a copybook first so its header is available.",
                        variant: "destructive",
                      });
                    }
                  }}
                >
                  Import from Strip
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText();
                      if (text) setHeader(text.split(/\r?\n/)[0]);
                      else toast({ title: "Clipboard is empty", variant: "destructive" });
                    } catch {
                      toast({ title: "Couldn't read clipboard", variant: "destructive" });
                    }
                  }}
                >
                  <Clipboard className="w-3 h-3 mr-1.5" />
                  Paste
                </Button>
              </div>
              {headerInfo && (
                <div className="flex flex-col gap-1">
                  <p className="text-[11px] font-mono text-muted-foreground">
                    Header: {headerInfo.count} field{headerInfo.count === 1 ? "" : "s"} (delimiter "
                    {headerInfo.delim === "\t" ? "\\t" : headerInfo.delim}")
                  </p>
                  {headerInfo.collision && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-500">{headerInfo.collision}</p>
                  )}
                </div>
              )}
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

      {crosscheck.length > 0 && (
        <Card className="lg:col-span-2">
          <CardContent className="pt-6 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Preview</Label>
              <div className="flex items-center gap-1.5">
                <Checkbox
                  id="preview-filler"
                  checked={previewFiller}
                  onCheckedChange={(v) => setPreviewFiller(v === true)}
                />
                <Label htmlFor="preview-filler" className="text-[11px] font-normal text-muted-foreground cursor-pointer">
                  Include FILLER
                </Label>
              </div>
            </div>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    <TableHead className="w-10 text-xs">
                      <Checkbox
                        checked={excluded.size === 0}
                        title="Check/uncheck all fields"
                        onCheckedChange={(checked) =>
                          setExcluded(checked ? new Set() : new Set(crosscheck.map((r) => r.id)))
                        }
                      />
                    </TableHead>
                    <TableHead className="text-xs">Field</TableHead>
                    <TableHead className="text-xs">Type</TableHead>
                    <TableHead className="text-xs">Message 1</TableHead>
                    <TableHead className="text-xs">Message {messages.length} (last)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crosscheck.map((r) => (
                    <TableRow key={r.id} className={excluded.has(r.id) ? "opacity-50" : ""}>
                      <TableCell className="py-1.5">
                        <Checkbox
                          checked={!excluded.has(r.id)}
                          title={excluded.has(r.id) ? "Include this field in the CSV" : "Exclude this field from the CSV"}
                          onCheckedChange={(checked) =>
                            setExcluded((prev) => {
                              const next = new Set(prev);
                              if (checked) next.delete(r.id);
                              else next.add(r.id);
                              return next;
                            })
                          }
                        />
                      </TableCell>
                      <TableCell className="py-1.5 text-xs font-mono">{r.name}</TableCell>
                      <TableCell className="py-1.5 text-xs font-mono text-muted-foreground">{r.pic}</TableCell>
                      <TableCell className="py-1.5 text-xs font-mono">{r.first}</TableCell>
                      <TableCell className="py-1.5 text-xs font-mono">{r.last}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
