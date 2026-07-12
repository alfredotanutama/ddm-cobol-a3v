import { useMemo, useRef, useState } from "react";
import { parseCopybook, getRecordLength } from "@/lib/cobol";
import { delimitLines } from "@/lib/delimit";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Download, Trash2, Upload, CheckCircle2 } from "lucide-react";

function FileUpload({
  label,
  loaded,
  loadedNote,
  onLoad,
}: {
  label: string;
  loaded: boolean;
  loadedNote: string;
  onLoad: (text: string, fileName: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      if (typeof ev.target?.result === "string") {
        onLoad(ev.target.result, file.name);
        setFileName(file.name);
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <input type="file" hidden ref={ref} onChange={handleFile} />
      <Button variant="outline" size="sm" className="w-fit h-8 text-xs" onClick={() => ref.current?.click()}>
        <Upload className="w-3 h-3 mr-1.5" />
        Upload file
      </Button>
      {loaded && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500" />
          {fileName ? `${fileName} uploaded` : "Uploaded"} — {loadedNote}
        </p>
      )}
    </div>
  );
}

export function DelimiterExportTab({
  copybookSource,
  setCopybookSource,
  dataSource,
  setDataSource,
}: {
  copybookSource: string;
  setCopybookSource: (v: string) => void;
  dataSource: string;
  setDataSource: (v: string) => void;
}) {
  const { toast } = useToast();
  const [delimiterInput, setDelimiterInput] = useState(",");
  const delimiter = delimiterInput || ",";

  const fields = useMemo(() => {
    try {
      return parseCopybook(copybookSource);
    } catch (e) {
      return [];
    }
  }, [copybookSource]);

  // Each non-empty line is one fixed-width record.
  const lines = useMemo(() => dataSource.split(/\r?\n/).filter((l) => l.length > 0), [dataSource]);

  const recordLength = useMemo(() => getRecordLength(fields), [fields]);
  const lengthMismatch = fields.length > 0 && lines.length > 0 && lines[0].length !== recordLength;
  const ready = fields.length > 0 && lines.length > 0;

  const preview = useMemo(
    () => (ready ? delimitLines(fields, lines.slice(0, 5), delimiter) : []),
    [ready, fields, lines, delimiter],
  );

  // Records whose data contains the delimiter itself — their values get quoted, but warn so
  // the user can pick a collision-free delimiter for consumers that don't understand quotes.
  const collisionCount = useMemo(
    () => (ready ? lines.filter((l) => l.includes(delimiter)).length : 0),
    [ready, lines, delimiter],
  );

  const handleDownload = () => {
    const blob = new Blob([delimitLines(fields, lines, delimiter).join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "delimiter-export.csv";
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: "Delimiter Export", description: `${lines.length} record${lines.length === 1 ? "" : "s"} exported.` });
  };

  const clearAll = () => {
    setCopybookSource("");
    setDataSource("");
    toast({ title: "Cleared", description: "Delimiter Export tab data has been reset." });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={clearAll}
          className="h-7 text-xs"
          disabled={!copybookSource.trim() && !dataSource.trim()}
        >
          <Trash2 className="w-3 h-3 mr-1.5" />
          Clear Tab
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardContent className="pt-6">
            <FileUpload
              label="Copybook Definition"
              loaded={copybookSource.trim().length > 0}
              loadedNote={
                fields.length > 0
                  ? `${fields.filter((f) => !f.isGroup).length} fields, ${recordLength} bytes/record`
                  : "couldn't parse any fields"
              }
              onLoad={(text) => setCopybookSource(text)}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <FileUpload
              label="Record Lines"
              loaded={dataSource.length > 0}
              loadedNote={lines.length > 0 ? `${lines.length} records × ${lines[0].length} bytes` : "file is empty"}
              onLoad={(text) => setDataSource(text)}
            />
            {lengthMismatch && (
              <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-500">
                Record length ({lines[0].length}) doesn't match the copybook's expected length ({recordLength}).
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {!ready && (copybookSource.trim() || dataSource.trim()) && (
        <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-md border text-center">
          Upload both a valid copybook and a record lines file to export.
        </div>
      )}

      {ready && (
        <Card>
          <CardContent className="pt-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Preview{lines.length > 5 ? ` (first 5 of ${lines.length})` : ""}
              </h3>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="delim" className="text-xs text-muted-foreground">
                    Delimiter
                  </Label>
                  <Input
                    id="delim"
                    value={delimiterInput}
                    onChange={(e) => setDelimiterInput(e.target.value)}
                    maxLength={3}
                    className="h-7 w-14 text-center text-xs font-mono"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={handleDownload}
                  className="h-7 text-xs"
                  title="Download all records as delimited values, one column per copybook field"
                >
                  <Download className="w-3 h-3 mr-1.5" />
                  Download CSV ({lines.length})
                </Button>
              </div>
            </div>
            {collisionCount > 0 ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-500">
                "{delimiter}" already exists in the data ({collisionCount} record
                {collisionCount === 1 ? "" : "s"}). Those values are wrapped in quotes so columns
                stay correct — or pick a delimiter that doesn't appear in the data.
              </p>
            ) : (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-500">
                "{delimiter}" doesn't appear anywhere in the data — safe delimiter.
              </p>
            )}
            <pre className="rounded-md border bg-muted/40 p-3 text-xs font-mono overflow-x-auto">
              {preview.join("\n")}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
