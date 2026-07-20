import { useMemo, useState } from "react";
import { parseCopybook, generateStream, getRecordLength, fillerFillValue } from "@/lib/cobol";
import type { ParsedField } from "@/lib/cobol";
import { FileTextarea } from "./file-textarea";
import { EmptyState } from "./empty-state";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Copy, Download, Trash2, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function GenerateTab({
  copybookSource,
  setCopybookSource,
  values,
  setValues,
}: {
  copybookSource: string;
  setCopybookSource: (v: string) => void;
  values: Record<string, string>;
  setValues: (v: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
}) {
  const { toast } = useToast();

  // FILLER rows are read-only by default. Ticking this turns them into normal
  // inputs and enables the fill-character picker below.
  const [fillerEditable, setFillerEditable] = useState(false);
  const [fillerMode, setFillerMode] = useState("spaces"); // spaces | , | ; | custom
  const [fillerCustom, setFillerCustom] = useState("");
  const fillerChar =
    !fillerEditable || fillerMode === "spaces"
      ? ""
      : fillerMode === "custom"
      ? fillerCustom
      : fillerMode;

  const fields = useMemo(() => {
    try {
      return parseCopybook(copybookSource);
    } catch (e) {
      return [];
    }
  }, [copybookSource]);

  const fillerFill = (f: ParsedField) => fillerFillValue(f, fillerChar);

  // Derived, not stored: the picker stays live and Clear Values can't strand
  // a filler holding an old fill char.
  const effectiveValues = useMemo(() => {
    if (!fillerChar) return values;
    const next = { ...values };
    for (const f of fields) {
      const fill = fillerFill(f);
      if (fill !== null && next[f.id] === undefined) next[f.id] = fill;
    }
    return next;
  }, [fields, values, fillerChar]);

  const stream = useMemo(() => {
    if (!fields.length) return "";
    try {
      return generateStream(fields, effectiveValues);
    } catch (e) {
      return "";
    }
  }, [fields, effectiveValues]);

  const recordLength = useMemo(() => getRecordLength(fields), [fields]);

  const handleCopy = async () => {
    if (!stream) return;
    await navigator.clipboard.writeText(stream);
    toast({ title: "Copied to clipboard", description: "The stream has been copied." });
  };

  const handleDownload = () => {
    if (!stream) return;
    const blob = new Blob([stream], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "stream.txt";
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Downloaded stream.txt", description: "The stream file has been saved." });
  };

  const clearValues = () => setValues({});

  // Drop user overrides on fields that have a copybook VALUE, so they snap
  // back to the latest VALUE literal in the copybook text.
  const refreshDefaults = () => {
    setValues(prev => {
      const next = { ...prev };
      for (const f of fields) {
        if (f.initialValue !== null) delete next[f.id];
      }
      return next;
    });
    toast({ title: "Refreshed", description: "VALUE fields now follow the copybook." });
  };

  const clearAll = () => {
    setCopybookSource("");
    setValues({});
    toast({ title: "Cleared", description: "Generate tab data has been reset." });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={clearAll}
          className="h-7 text-xs"
          disabled={!copybookSource.trim() && Object.keys(values).length === 0}
        >
          <Trash2 className="w-3 h-3 mr-1.5" />
          Clear Tab
        </Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="flex flex-col gap-6">
        <Card>
          <CardContent className="pt-6">
            <FileTextarea
              label="Copybook Definition"
              placeholder="01 CUSTOMER-RECORD.&#10;   05 CUSTOMER-ID   PIC X(10).&#10;   05 CUSTOMER-NAME PIC X(50)."
              value={copybookSource}
              onChange={setCopybookSource}
              showTypeLegend
              showCopyButton
              lengthBadge={fields.length > 0 ? `Total: ${recordLength} bytes` : undefined}
            />
          </CardContent>
        </Card>

        {fields.length > 0 && (
          <Card>
            <CardContent className="pt-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Field Values</h3>
                <div className="flex items-center gap-1">
                  <div className="flex items-center gap-1.5 mr-1">
                    <Checkbox
                      id="filler-editable"
                      checked={fillerEditable}
                      onCheckedChange={(v) => setFillerEditable(v === true)}
                    />
                    <Label htmlFor="filler-editable" className="text-xs text-muted-foreground cursor-pointer">
                      Filler editable
                    </Label>
                  </div>
                  {fillerEditable && (
                    <div className="flex items-center gap-1.5 mr-1">
                      <Select value={fillerMode} onValueChange={setFillerMode}>
                        <SelectTrigger className="h-7 w-[110px] text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="spaces" className="text-xs">Spaces</SelectItem>
                          <SelectItem value="," className="text-xs">Comma ,</SelectItem>
                          <SelectItem value=";" className="text-xs">Semicolon ;</SelectItem>
                          <SelectItem value="custom" className="text-xs">Custom…</SelectItem>
                        </SelectContent>
                      </Select>
                      {fillerMode === "custom" && (
                        <Input
                          value={fillerCustom}
                          onChange={(e) => setFillerCustom(e.target.value.slice(0, 1))}
                          maxLength={1}
                          placeholder="?"
                          className="h-7 w-10 text-center text-xs font-mono"
                        />
                      )}
                    </div>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={refreshDefaults}
                    className="h-7 text-xs"
                    title="Re-apply the copybook's VALUE literals to their fields"
                  >
                    <RefreshCw className="w-3 h-3 mr-1.5" />
                    Refresh
                  </Button>
                  <Button variant="ghost" size="sm" onClick={clearValues} className="h-7 text-xs">
                    <Trash2 className="w-3 h-3 mr-1.5" />
                    Clear Values
                  </Button>
                </div>
              </div>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="w-[40%] text-xs">Field</TableHead>
                      <TableHead className="w-[20%] text-xs">Type</TableHead>
                      <TableHead className="w-[10%] text-xs">Len</TableHead>
                      <TableHead className="w-[30%] text-xs">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((f) => (
                      <TableRow key={f.id} className={f.indent > 0 ? "bg-muted/20" : ""}>
                        <TableCell className="py-2 text-xs font-mono">
                          <div style={{ paddingLeft: `${f.indent * 16}px` }} className="flex flex-col">
                            <span>{f.name}</span>
                            {f.redefines && !f.isGroup && <span className="text-[10px] text-muted-foreground">Redefines {f.redefines}</span>}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 text-xs font-mono text-muted-foreground">{f.picRaw || "GROUP"}</TableCell>
                        <TableCell className="py-2 text-xs font-mono text-muted-foreground">{f.length > 0 ? f.length : ""}</TableCell>
                        <TableCell className="py-2">
                          {f.isGroup && f.groupNote && (
                            <span className="text-xs italic text-muted-foreground">{f.groupNote}</span>
                          )}
                          {!f.isGroup && f.length > 0 && (!f.isFiller || f.initialValue !== null || fillerEditable) && (
                            <Input
                              className="h-7 text-xs font-mono"
                              value={values[f.id] ?? fillerFill(f) ?? f.initialValue ?? ""}
                              onChange={(e) => {
                                let next = e.target.value;
                                if (f.kind === "NUMERIC") {
                                  next = next.replace(/[^0-9]/g, "");
                                } else if (f.kind === "DECIMAL") {
                                  next = next.replace(/[^0-9.]/g, "");
                                } else if (f.kind === "SIGNED" || f.kind === "SIGNED_DEC") {
                                  next = next.replace(/[^0-9.\-]/g, "");
                                }
                                setValues(prev => ({ ...prev, [f.id]: next }));
                              }}
                              inputMode={
                                f.kind === "NUMERIC"
                                  ? "numeric"
                                  : f.kind === "DECIMAL" || f.kind === "SIGNED" || f.kind === "SIGNED_DEC"
                                  ? "decimal"
                                  : "text"
                              }
                              placeholder={
                                f.kind === "DECIMAL"
                                  ? "e.g. 123.45"
                                  : f.kind === "SIGNED" || f.kind === "SIGNED_DEC"
                                  ? "e.g. 10001.00 or -10001.00"
                                  : "..."
                              }
                            />
                          )}
                          {!f.isGroup && f.isFiller && f.initialValue === null && !fillerEditable && (
                            <span className="text-xs italic text-muted-foreground">Filler</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {copybookSource.trim() && fields.length === 0 && (
          <EmptyState>No valid fields found in this copybook.</EmptyState>
        )}
      </div>

      <div className="sticky top-6 flex flex-col gap-6">
        <Card>
          <CardContent className="pt-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Generated Stream</h3>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleCopy} className="h-7 text-xs" disabled={!stream}>
                  <Copy className="w-3 h-3 mr-1.5" />
                  Copy
                </Button>
                <Button variant="outline" size="sm" onClick={handleDownload} className="h-7 text-xs" disabled={!stream}>
                  <Download className="w-3 h-3 mr-1.5" />
                  Save
                </Button>
              </div>
            </div>
            <div className="relative">
              <textarea
                className="w-full h-64 sm:h-96 p-4 font-mono text-xs bg-muted/30 border rounded-md focus:outline-none focus:ring-1 focus:ring-ring resize-y"
                readOnly
                value={stream}
                placeholder="Output stream will appear here..."
                spellCheck={false}
              />
              <div className="absolute bottom-4 right-4 text-xs font-mono text-muted-foreground bg-background/80 px-2 py-1 rounded backdrop-blur-sm border">
                {stream.length} bytes
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      </div>
    </div>
  );
}
