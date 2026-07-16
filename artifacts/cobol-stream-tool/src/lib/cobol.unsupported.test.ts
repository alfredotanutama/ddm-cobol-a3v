// Run: node --experimental-strip-types src/lib/cobol.unsupported.test.ts
// PIC A / COMP-5 / edited-PIC support + unsupported-clause warnings + zoned S9 binary decode.
import { parseCopybook, formatFieldValue, decomposeStream } from "./cobol.ts";
import { packedByteLength, decodeBinaryField } from "./comp3.ts";
import assert from "node:assert";

const fields = parseCopybook(`
01  REC.
    05  F-ALPHA    PIC A(6).
    05  F-COMP5    PIC S9(9) COMP-5.
    05  F-EDITED   PIC ZZ9.99.
    05  F-OCCURS   PIC X(2) OCCURS 5 TIMES.
    05  F-SYNC     PIC S9(4) COMP SYNC.
    05  F-FLOAT    COMP-1.
    05  F-ZONED    PIC S9(3).
    05  F-BAD      PIC G(4).
`);
const byName = Object.fromEntries(fields.map((f) => [f.name, f]));

// PIC A = alphanumeric, correct length, no warning.
assert.strictEqual(byName["F-ALPHA"].type, "X");
assert.strictEqual(byName["F-ALPHA"].length, 6);
assert.strictEqual(byName["F-ALPHA"].parseWarning, null);

// COMP-5 = binary, 4 bytes for 9 digits.
assert.strictEqual(byName["F-COMP5"].isCompBinary, true);
assert.strictEqual(packedByteLength(byName["F-COMP5"]), 4);

// Edited PIC: correct byte length (Z Z 9 . 9 9 = 6), passed through as text, warned.
assert.strictEqual(byName["F-EDITED"].length, 6);
assert.strictEqual(byName["F-EDITED"].type, "X");
assert.match(byName["F-EDITED"].parseWarning ?? "", /Edited PIC/);

// Unsupported clauses are flagged, never silent.
assert.match(byName["F-OCCURS"].parseWarning ?? "", /OCCURS/);
assert.match(byName["F-SYNC"].parseWarning ?? "", /SYNC/);
assert.match(byName["F-FLOAT"].parseWarning ?? "", /COMP-1/);
assert.match(byName["F-BAD"].parseWarning ?? "", /not understood/);

// Offsets: F-ALPHA 0..5, F-COMP5 text-length 9 → F-EDITED starts at 15 (text layout).
assert.strictEqual(byName["F-EDITED"].start, 15);

// Zoned decimal (PIC S9 DISPLAY) in binary EBCDIC records: F1 F2 D3 = -123.
const zoned = decodeBinaryField(byName["F-ZONED"], new Uint8Array([0xf1, 0xf2, 0xd3]));
assert.strictEqual(zoned.value, "-123");
assert.strictEqual(zoned.warning, null);
const zonedPos = decodeBinaryField(byName["F-ZONED"], new Uint8Array([0xf1, 0xf2, 0xc3]));
assert.strictEqual(zonedPos.value, "123");
const zonedUnsigned = decodeBinaryField(byName["F-ZONED"], new Uint8Array([0xf0, 0xf4, 0xf2]));
assert.strictEqual(zonedUnsigned.value, "042");

// PIC A guards alphabetic content: generate strips invalid chars, decompose warns.
assert.strictEqual(byName["F-ALPHA"].alphaOnly, true);
assert.strictEqual(formatFieldValue(byName["F-ALPHA"], "AB1C-2"), "ABC   ");
const alphaFields = parseCopybook("01 R.\n   05 F PIC A(3).");
const [, bad] = decomposeStream(alphaFields, "A2C");
assert.match(bad.warning ?? "", /Non-alphabetic/);
const [, good] = decomposeStream(alphaFields, "AbC");
assert.strictEqual(good.warning, null);

console.log("cobol.unsupported.test.ts: all assertions passed");
