// Run: node src/lib/cobol.filler-value.test.ts
import { parseCopybook, generateStream, decomposeStream } from "./cobol.ts";
import assert from "node:assert";

const copybook = `
01 REC.
   05 FIELD-A PIC X(3).
   05 FILLER  PIC X(1) VALUE 'X'.
   05 FILLER  PIC X(2).
   05 FIELD-B PIC 9(3) VALUE 123.
`;

const fields = parseCopybook(copybook);
const [_, a, fillerV, fillerPlain, b] = fields;

assert.equal(fillerV.isFiller, true);
assert.equal(fillerV.initialValue, "X");
assert.equal(fillerPlain.initialValue, null);
assert.equal(b.initialValue, "123");

// VALUE literals fill the stream by default; user edits override
assert.equal(generateStream(fields, {}), "   X  123");
assert.equal(generateStream(fields, { [fillerV.id]: "Y" }), "   Y  123");

// decompose still extracts filler bytes
const dec = decomposeStream(fields, "AAAX  456");
assert.equal(dec[2].value, "X");
assert.equal(dec[4].value, "456");

// figurative constants and ALL
const fig = parseCopybook(`
01 REC2.
   05 FILLER PIC X(05) VALUE ZEROS.
   05 FILLER PIC X(10) VALUE ALL "*".
   05 FILLER PIC X(3)  VALUE SPACES.
   05 FILLER PIC X(4)  VALUE IS ALL 'AB'.
   05 FILLER PIC 9(3)  VALUE ZERO.
`);
assert.equal(fig[1].initialValue, "00000");
assert.equal(fig[2].initialValue, "**********");
assert.equal(fig[3].initialValue, "   ");
assert.equal(fig[4].initialValue, "ABAB");
assert.equal(fig[5].initialValue, "000");
assert.equal(generateStream(fig, {}), "00000**********   ABAB000");

console.log("ok");
