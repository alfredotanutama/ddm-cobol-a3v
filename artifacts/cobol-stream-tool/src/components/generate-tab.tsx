import { useMemo } from "react";
import { parseCopybook, generateStream, getRecordLength } from "@/lib/cobol";
import { FileTextarea } from "./file-textarea";
import { EmptyState } from "./empty-state";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
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

  const fields = useMemo(() => {
    try {
      return parseCopybook(copybookSource);
    } catch (e) {
      return [];
    }
  }, [copybookSource]);

  const stream = useMemo(() => {
    if (!fields.length) return "";
    try {
      return generateStream(fields, values);
    } catch (e) {
      return "";
    }
  }, [fields, values]);

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
                          {!f.isGroup && (!f.isFiller || f.initialValue !== null) && f.length > 0 && (
                            <Input
                              className="h-7 text-xs font-mono"
                              value={values[f.id] ?? f.initialValue ?? ""}
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
                          {!f.isGroup && f.isFiller && f.initialValue === null && <span className="text-xs italic text-muted-foreground">Filler</span>}
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
