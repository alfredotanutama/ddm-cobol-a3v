// Run: node src/lib/delimit.test.ts
import { parseCopybook } from "./cobol.ts";
import { delimitLines, escapeValue, trimNumericValue, trimNumericRows } from "./delimit.ts";
import { decomposeStream } from "./cobol.ts";
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

// "Numbers as number": fixed-width numerics trimmed, precision preserved, text untouched.
assert.strictEqual(trimNumericValue("00123.45"), "123.45");
assert.strictEqual(trimNumericValue("-00123.45"), "-123.45");
assert.strictEqual(trimNumericValue("00000"), "0");
assert.strictEqual(trimNumericValue("0000000000001.50"), "1.50");
assert.strictEqual(trimNumericValue("798897928973799"), "798897928973799"); // 15 digits intact
const numFields = parseCopybook(`
01 R.
   05 AMOUNT PIC 9(5)V99.
   05 CODE   PIC X(5).
`);
const numRows = trimNumericRows([decomposeStream(numFields, "0012345" + "00123")]);
const amount = numRows[0].find((d) => d.name === "AMOUNT")!;
const code = numRows[0].find((d) => d.name === "CODE")!;
assert.strictEqual(amount.value, "123.45");
assert.strictEqual(code.value, "00123"); // X field: leading zeros are data, kept

console.log("delimit.test.ts: all assertions passed");
