// node --experimental-strip-types src/lib/decodeeto.test.ts
import assert from "node:assert";
import { parseCopybook } from "./cobol.ts";
import { toPreTemplate, PRE_TEMPLATE_HEADER } from "./decodeeto.ts";

const copybook = `
01 DEMO-REC.
   05 WIDGET-LABEL  PIC X(10).
   05 WIDGET-QTY    PIC 9(7).
   05 FILLER        PIC X(02).
   05 COLOR-CODE    PIC X(03) VALUE 'RED'.
   05 COLOR-NUM REDEFINES COLOR-CODE PIC 9(03).
`;

const out = toPreTemplate(parseCopybook(copybook));
const lines = out.split("\n");

assert.strictEqual(lines[0], PRE_TEMPLATE_HEADER, "header first");
assert.strictEqual(lines[1], "WIDGET-LABEL:10:1:X", "alpha visible");
assert.strictEqual(lines[2], "WIDGET-QTY:7:1:9", "numeric type 9");
assert.strictEqual(lines[3], "FILLER:2:0:X", "filler invisible");
assert.strictEqual(lines[4], `COLOR-CODE:3:1:X="RED"`, "value default quoted");
assert.strictEqual(lines.length, 5, "REDEFINES overlay excluded (no COLOR-NUM line)");
// Template lengths must add up to the real record length (no double-counted bytes).
const total = lines.slice(1).reduce((s, l) => s + parseInt(l.split(":")[1], 10), 0);
assert.strictEqual(total, 22, "total template length = record length");

console.log("decodeeto.test.ts OK");
