// Run: node --experimental-strip-types src/lib/comp3.test.ts
// Record bytes below are the first 36 bytes of the real mainframe file DATA_DAT.dat,
// hand-verified against COMP3VIEWDATA.txt (see parser_cobol_guide.md §10).
import { parseCopybook } from "./cobol.ts";
import { binaryLayout, decodeBinaryField, decomposeBinaryRecords } from "./comp3.ts";
import { isDataField, delimitRows } from "./delimit.ts";
import assert from "node:assert";

const COPYBOOK = `
01  DAMCDB-REC.
      05  DAMCDB-ACC-NO        PIC  9(10)     COMP-3.
      05  DAMCDB-TERM-ID       PIC  X(8).
      05  DAMCDB-TXN-CODE      PIC  9(3)      COMP-3.
      05  DAMCDB-STATUS        PIC  9(1).
      05  DAMCDB-KODE-PROD.
          10  DAMCDB-ICH-IND   PIC  X(1).
          10  DAMCDB-NETWK-ID  PIC  X(2).
      05  DAMCDB-AMT1          PIC  S9(13)V99 COMP-3.
      05  DAMCDB-AMT2          PIC  S9(13)V99 COMP-3.
`;

const fields = parseCopybook(COPYBOOK);

// Packed layout: 6+8+2+1+1+2+8+8 = 36 bytes.
const layout = binaryLayout(fields);
assert.strictEqual(layout.recordLength, 36);

const hex = (s: string) => new Uint8Array(s.split(/\s+/).filter(Boolean).map((h) => parseInt(h, 16)));

const RECORD = hex(`
  00 03 00 01 14 1f
  f1 f2 f3 f4 f5 f6 f7 f8
  01 3f
  f0
  00
  d4 c3
  00 00 00 00 00 00 15 0c
  00 00 00 00 00 00 89 7c
`);
assert.strictEqual(RECORD.length, 36);

// One real record + one all-zero record + 28 leftover zero bytes (mirrors DATA_DAT.dat's shape).
const data = new Uint8Array(36 + 36 + 28);
data.set(RECORD, 0);

const { records, warnings, skippedZeroRecords, leftoverBytes } = decomposeBinaryRecords(fields, data);
assert.strictEqual(records.length, 1);
assert.strictEqual(skippedZeroRecords, 1);
assert.strictEqual(leftoverBytes, 28);
assert.strictEqual(warnings.length, 2);

// Raw fixed-width values; NUL byte in ICH-IND renders as "." (ISPF style).
const values = records[0].filter(isDataField).map((d) => d.value);
assert.deepStrictEqual(values, [
  "0030001141",
  "12345678",
  "013",
  "0",
  ".",
  "MC",
  "0000000000001.50",
  "0000000000008.97",
]);
assert.ok(records[0].every((d) => d.warning === null));

// CSV round-trip through delimitRows.
const [header, row] = delimitRows(fields, records, ",");
assert.strictEqual(
  header,
  "DAMCDB-ACC-NO,DAMCDB-TERM-ID,DAMCDB-TXN-CODE,DAMCDB-STATUS,DAMCDB-ICH-IND,DAMCDB-NETWK-ID,DAMCDB-AMT1,DAMCDB-AMT2",
);
assert.strictEqual(row, "0030001141,12345678,013,0,.,MC,0000000000001.50,0000000000008.97");

// Negative sign nibble (D): S9(3)V99 packed in 3 bytes -> -123.45
const signedField = parseCopybook("01 R.\n 05 F PIC S9(3)V99 COMP-3.").find((f) => !f.isGroup)!;
assert.strictEqual(decodeBinaryField(signedField, hex("12 34 5d")).value, "-123.45");
// B is also negative; C and F positive.
assert.strictEqual(decodeBinaryField(signedField, hex("12 34 5b")).value, "-123.45");
assert.strictEqual(decodeBinaryField(signedField, hex("12 34 5c")).value, "123.45");

// Invalid digit nibble warns but still yields a value.
const bad = decodeBinaryField(signedField, hex("1a 34 5c"));
assert.ok(bad.warning?.includes("Invalid packed digit"));

// === COMP (binary int) — halfword/word/doubleword, big-endian two's complement ===
const compFields = parseCopybook(`
01 R.
   05 F1 PIC S9(04) COMP.
   05 F2 PIC 9(05) COMP.
   05 F3 PIC S9(10) COMP.
   05 F4 PIC S9(4)V99 COMP.
`).filter((f) => !f.isGroup);
const [f1, f2, f3, f4] = compFields;
assert.ok(f1.isCompBinary && !f1.isComp3);
// Byte sizes: 1-4 digits -> 2, 5-9 -> 4, 10-18 -> 8. (V digits count: S9(4)V99 = 6 digits -> 4.)
const compLayout = binaryLayout(compFields);
assert.strictEqual(compLayout.recordLength, 2 + 4 + 8 + 4);
// 0x0168 = 360 — a typical halfword record-length value seen in real mainframe data.
assert.strictEqual(decodeBinaryField(f1, hex("01 68")).value, "0360");
// Negative two's complement: 0xFF9C = -100.
assert.strictEqual(decodeBinaryField(f1, hex("ff 9c")).value, "-0100");
// Unsigned PIC 9 never goes negative.
assert.strictEqual(decodeBinaryField(f2, hex("00 00 30 39")).value, "12345");
// Doubleword.
assert.strictEqual(decodeBinaryField(f3, hex("00 00 00 02 54 0b e3 ff")).value, "9999999999");
// V scaling: 12345 with V99 -> 0123.45
assert.strictEqual(decodeBinaryField(f4, hex("00 00 30 39")).value, "0123.45");
// === ignorePadding: copybook shorter than the file's LRECL ===
// 2 records of 50 bytes = 36 copybook bytes + 14 low-value pad. Without the flag the file
// misaligns (100 % 36 != 0); with it, stride 50 is detected and both records decode.
{
  const padded = new Uint8Array(100);
  padded.set(RECORD, 0);
  padded.set(RECORD, 50);
  const off = decomposeBinaryRecords(fields, padded);
  assert.strictEqual(off.records.length, 2); // misaligned: record 2 decodes garbage
  assert.notStrictEqual(off.records[1].filter(isDataField)[0].value, "0030001141");
  const on = decomposeBinaryRecords(fields, padded, true);
  assert.strictEqual(on.recordLength, 50);
  assert.strictEqual(on.records.length, 2);
  assert.strictEqual(on.records[1].filter(isDataField)[0].value, "0030001141");
  assert.strictEqual(on.leftoverBytes, 0);
  assert.ok(on.warnings[0].includes("padding"));
  // Pad region holding real data (not low-values) -> no stride qualifies, falls back.
  const dirty = new Uint8Array(100);
  dirty.set(RECORD, 0);
  dirty.set(RECORD, 50);
  dirty.fill(0xc1, 36, 50); // 'A' bytes where padding should be
  assert.strictEqual(decomposeBinaryRecords(fields, dirty, true).recordLength, 36);
}

// COMP-1/COMP-2 (float) must NOT be flagged binary; COMP-4 and BINARY must.
const flags = parseCopybook(`
01 R.
   05 A PIC 9(4) COMP-1.
   05 B PIC 9(4) COMP-4.
   05 C PIC 9(4) BINARY.
`).filter((f) => !f.isGroup);
assert.deepStrictEqual(flags.map((f) => f.isCompBinary), [false, true, true]);

console.log("comp3.test.ts: all assertions passed");
