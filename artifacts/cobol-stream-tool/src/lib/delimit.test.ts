// Run: node src/lib/delimit.test.ts
import { parseCopybook } from "./cobol.ts";
import { delimitLines, escapeValue } from "./delimit.ts";
import assert from "node:assert";

const fields = parseCopybook(`
01 REC.
   05 NAME PIC X(10).
   05 CITY PIC X(5).
`);

// NAME contains a comma; CITY is plain.
const line = "DOE, JO   PARIS";

// Comma delimiter: the comma inside NAME must be quoted, keeping exactly 2 columns.
const [header, row] = delimitLines(fields, [line], ",");
assert.strictEqual(header, "NAME,CITY");
assert.strictEqual(row, '"DOE, JO",PARIS');

// Semicolon delimiter: the comma is harmless, no quoting needed.
assert.strictEqual(delimitLines(fields, [line], ";")[1], "DOE, JO;PARIS");

// Pipe delimiter with a pipe in the data: quoted.
assert.strictEqual(delimitLines(fields, ["A|B       PARIS"], "|")[1], '"A|B"|PARIS');

// Quotes in data are doubled per CSV rules.
assert.strictEqual(escapeValue('say "hi"', ","), '"say ""hi"""');

// Excluding a field drops its column from both header and rows.
const nameId = fields.find((f) => f.name === "NAME")!.id;
const [exHeader, exRow] = delimitLines(fields, [line], ",", new Set([nameId]));
assert.strictEqual(exHeader, "CITY");
assert.strictEqual(exRow, "PARIS");

console.log("delimit.test.ts: all assertions passed");
