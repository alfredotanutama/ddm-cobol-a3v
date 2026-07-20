import { useMemo, useRef, useState } from "react";
import { parseCopybook, getRecordLength, decomposeStream, type DecomposedField } from "@/lib/cobol";
import { decomposeBinaryRecords } from "@/lib/comp3";
import { delimitRows, isDataField, trimNumericRows } from "@/lib/delimit";
import { EmptyState } from "./empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Download, Trash2, Upload, CheckCircle2, Binary, Clipboard } from "lucide-react";

function FileUpload({
  label,
  loaded,
  loadedNote,
  onLoadText,
  onLoadBytes,
}: {
  label: string;
  loaded: boolean;
  loadedNote: string;
  onLoadText?: (text: string, fileName: string) => void;
  onLoadBytes?: (bytes: Uint8Array, fileName: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const readFile = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = ev.target?.result;
      if (onLoadBytes && result instanceof ArrayBuffer) {
        onLoadBytes(new Uint8Array(result), file.name);
        setFileName(file.name);
      } else if (onLoadText && typeof result === "string") {
        onLoadText(result, file.name);
        setFileName(file.name);
      }
    };
    if (onLoadBytes) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    readFile(e.target.files?.[0]);
    e.target.value = "";
  };

  return (
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
      <Label>{label}</Label>
      <input type="file" hidden ref={ref} onChange={handleFile} />
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" className="w-fit h-8 text-xs" onClick={() => ref.current?.click()}>
          <Upload className="w-3 h-3 mr-1.5" />
          Upload file
        </Button>
        {onLoadText && (
          <Button
            variant="outline"
            size="sm"
            className="w-fit h-8 text-xs"
            onClick={async () => {
              try {
                const text = await navigator.clipboard.readText();
                if (text) {
                  onLoadText(text, "");
                  setFileName("");
                }
              } catch {
                /* clipboard blocked -- upload/drop still work */
              }
            }}
          >
            <Clipboard className="w-3 h-3 mr-1.5" />
            Paste
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground/70">or drag &amp; drop here</p>
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
  dataSource: Uint8Array | null;
  setDataSource: (v: Uint8Array | null) => void;
}) {
  const { toast } = useToast();
  const [delimiterInput, setDelimiterInput] = useState(",");
  const delimiter = delimiterInput || ",";
  // Field ids the user unchecked — left out of the CSV columns.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  // Skip trailing low-value/space padding per record (copybook shorter than the file's LRECL).
  const [ignorePadding, setIgnorePadding] = useState(false);
  // Export numeric fields as plain numbers (123.45) instead of raw fixed-width (00123.45).
  const [numbersAsNumber, setNumbersAsNumber] = useState(false);
  // Name of the uploaded record file — only used to warn on a .dat/.txt mismatch.
  const [dataFileName, setDataFileName] = useState("");

  const fields = useMemo(() => {
    try {
      return parseCopybook(copybookSource);
    } catch (e) {
      return [];
    }
  }, [copybookSource]);

  // Any COMP-3 or COMP (binary) field switches the record file to binary mode (packed decimal + EBCDIC text).
  const binaryMode = useMemo(() => fields.some((f) => f.isComp3 || f.isCompBinary), [fields]);

  // Decode all records once; every view (preview, crosscheck, download) reads from `rows`.
  const decoded = useMemo((): {
    rows: DecomposedField[][];
    recordLength: number;
    warnings: string[];
    lengthMismatch: boolean;
  } => {
    if (fields.length === 0 || !dataSource || dataSource.length === 0) {
      return { rows: [], recordLength: 0, warnings: [], lengthMismatch: false };
    }
    if (binaryMode) {
      const { records, warnings, recordLength } = decomposeBinaryRecords(fields, dataSource, ignorePadding);
      return { rows: records, recordLength, warnings, lengthMismatch: false };
    }
    // Text mode: each non-empty line is one fixed-width record.
    const recordLength = getRecordLength(fields);
    const text = new TextDecoder().decode(dataSource);
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    const rows = lines.map((line) => decomposeStream(fields, line));
    const lengthMismatch = lines.length > 0 && lines[0].length !== recordLength;
    return { rows, recordLength, warnings: [], lengthMismatch };
  }, [fields, dataSource, binaryMode, ignorePadding]);

  const { rows, recordLength, warnings, lengthMismatch } = decoded;
  const ready = fields.length > 0 && rows.length > 0;

  // Rows as they'll appear in the CSV (numeric trimming applied when chosen).
  const csvRows = useMemo(
    () => (numbersAsNumber ? trimNumericRows(rows) : rows),
    [rows, numbersAsNumber],
  );

  const dataFieldCount = useMemo(() => fields.filter(isDataField).length, [fields]);
  const includedCount = dataFieldCount - excluded.size;

  const preview = useMemo(
    () => (ready ? delimitRows(fields, csvRows.slice(0, 5), delimiter, excluded) : []),
    [ready, fields, csvRows, delimiter, excluded],
  );

  // Records whose decoded values contain the delimiter — they get quoted, but warn so the
  // user can pick a collision-free delimiter for consumers that don't understand quotes.
  const collisionCount = useMemo(
    () =>
      ready
        ? csvRows.filter((row) =>
            row.some((d) => isDataField(d) && !excluded.has(d.id) && d.value.includes(delimiter)),
          ).length
        : 0,
    [ready, csvRows, delimiter, excluded],
  );

  // Per-field values of the first and last record, for crosschecking the split.
  const crosscheck = useMemo(() => {
    if (!ready) return [];
    const first = rows[0].filter(isDataField);
    const last = (rows.length > 1 ? rows[rows.length - 1] : rows[0]).filter(isDataField);
    return first.map((f, i) => ({ id: f.id, name: f.name, pic: f.picRaw, first: f.value, last: last[i]?.value ?? "" }));
  }, [ready, rows]);

  // Extension vs copybook check. Advisory only — the name doesn't prove the content,
  // so a mismatch warns but never blocks the export.
  const isDatFile = dataFileName.toLowerCase().endsWith(".dat");
  const extensionWarning =
    !dataFileName || fields.length === 0
      ? ""
      : binaryMode && !isDatFile
      ? `Copybook has COMP-3 / COMP fields, but "${dataFileName}" isn't a .dat file. Packed bytes get corrupted when the dataset is transferred as text — export the record file as binary (.dat, RECFM=FB, no ASCII conversion).`
      : !binaryMode && isDatFile
      ? `No COMP-3 in the copybook, so "${dataFileName}" is read as plain text (one line per record). If the file really is binary, the copybook is missing its COMP-3 fields.`
      : "";

  const handleDownload = () => {
    const blob = new Blob([delimitRows(fields, csvRows, delimiter, excluded).join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    // ddm_generated_MMDDYY_HHMMSS.csv
    const now = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    const stamp = `${p(now.getMonth() + 1)}${p(now.getDate())}${String(now.getFullYear()).slice(-2)}_${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
    a.download = `ddm_generated_${stamp}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast({ title: "Delimiter Export", description: `${rows.length} record${rows.length === 1 ? "" : "s"} exported.` });
  };

  const clearAll = () => {
    setCopybookSource("");
    setDataSource(null);
    setExcluded(new Set());
    setDataFileName("");
    setIgnorePadding(false);
    setNumbersAsNumber(false);
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
          disabled={!copybookSource.trim() && !dataSource}
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
                  ? `${fields.filter((f) => !f.isGroup).length} fields, ${binaryMode ? `${recordLength || "?"} bytes/record (COMP-3 packed)` : `${getRecordLength(fields)} bytes/record`}`
                  : "couldn't parse any fields"
              }
              onLoadText={(text) => {
                setCopybookSource(text);
                setExcluded(new Set());
              }}
            />
            {copybookSource.trim().length > 0 && (
              <details className="mt-2">
                <summary className="text-[11px] text-muted-foreground cursor-pointer select-none">
                  Preview copybook
                </summary>
                <pre className="mt-1.5 max-h-64 overflow-auto rounded bg-muted p-2 font-mono text-[11px] leading-snug whitespace-pre">
                  {copybookSource}
                </pre>
              </details>
            )}
            {binaryMode && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Binary className="w-3.5 h-3.5" />
                COMP-3 detected — upload the record file as binary (.dat). Text fields are decoded as EBCDIC.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <FileUpload
              label="Record Lines"
              loaded={!!dataSource && dataSource.length > 0}
              loadedNote={
                rows.length > 0
                  ? `${rows.length} record${rows.length === 1 ? "" : "s"} × ${recordLength} bytes`
                  : dataSource && dataSource.length > 0
                  ? `${dataSource.length} bytes — upload a copybook to decode`
                  : "file is empty"
              }
              onLoadBytes={(bytes, fileName) => {
                setDataSource(bytes);
                setDataFileName(fileName);
              }}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {fields.length === 0
                ? "Upload a copybook first — it decides whether this file must be binary (.dat) or plain text (.txt)."
                : binaryMode
                ? "Copybook contains COMP-3 / COMP fields — this file must be binary (.dat)."
                : "No COMP-3 in the copybook — a plain text file (.txt) is fine."}
            </p>
            {extensionWarning && (
              <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-500">{extensionWarning}</p>
            )}
            {binaryMode && (
              <div className="mt-2 flex items-start gap-2">
                <Checkbox
                  id="ignore-padding"
                  checked={ignorePadding}
                  onCheckedChange={(v) => setIgnorePadding(v === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="ignore-padding" className="text-[11px] font-normal text-muted-foreground leading-snug cursor-pointer">
                  Ignore trailing low-values per record — use when the copybook is shorter than the
                  file's record length (no need to add a FILLER to the copybook).
                </Label>
              </div>
            )}
            {lengthMismatch && (
              <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-500">
                Record length doesn't match the copybook's expected length ({recordLength}).
              </p>
            )}
            {warnings.map((w, i) => (
              <p key={i} className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-500">
                {w}
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      {!ready && (copybookSource.trim() || dataSource) && (
        <EmptyState>Upload both a valid copybook and a record lines file to export.</EmptyState>
      )}

      {ready && (
        <Card>
          <CardContent className="pt-6 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">
                Preview{rows.length > 5 ? ` (first 5 of ${rows.length})` : ""}
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
                <div className="flex items-center gap-1.5">
                  <Checkbox
                    id="numbers-as-number"
                    checked={numbersAsNumber}
                    onCheckedChange={(v) => setNumbersAsNumber(v === true)}
                  />
                  <Label
                    htmlFor="numbers-as-number"
                    className="text-xs font-normal text-muted-foreground cursor-pointer"
                    title="Numeric fields exported as plain numbers (123.45) instead of raw fixed-width (00123.45)"
                  >
                    Numbers as number
                  </Label>
                </div>
                <Button
                  size="sm"
                  onClick={handleDownload}
                  className="h-7 text-xs"
                  disabled={includedCount === 0}
                  title="Download all records as delimited values, one column per checked copybook field"
                >
                  <Download className="w-3 h-3 mr-1.5" />
                  Download CSV ({rows.length})
                </Button>
              </div>
            </div>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500" />
              Input: {rows.length} record{rows.length === 1 ? "" : "s"} → CSV: {rows.length + 1} rows
              ({rows.length} data + 1 header), {includedCount} of {dataFieldCount} fields
              {binaryMode ? " — binary COMP-3 mode" : ""}
            </p>
            {includedCount === 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-500">
                All fields are unchecked — check at least one field below to export.
              </p>
            )}
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
            <h3 className="text-sm font-semibold">Per-variable crosscheck</h3>
            <p className="text-xs text-muted-foreground">
              Uncheck a field to leave its column out of the CSV.
            </p>
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
                    <TableHead className="text-xs">Record 1</TableHead>
                    <TableHead className="text-xs">Record {rows.length} (last)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {crosscheck.map((r, i) => (
                    <TableRow key={i} className={excluded.has(r.id) ? "opacity-50" : ""}>
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
