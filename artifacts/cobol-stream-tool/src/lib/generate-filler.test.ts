// Run: node --experimental-strip-types src/lib/generate-filler.test.ts
import assert from "node:assert";
import { parseCopybook, generateStream, fillerFillValue } from "./cobol.ts";

// Generic invented names only — never a real field name from a copybook.
const COPYBOOK = `
01 WIDGET-RECORD.
   05 WIDGET-CODE   PIC X(4).
   05 FILLER        PIC X(3).
   05 WIDGET-QTY    PIC 9(3).
   05 FILLER        PIC 9(2).
   05 FILLER        PIC X(2) VALUE 'ZZ'.
`;

const fields = parseCopybook(COPYBOOK);
const byName = (n: string) => fields.filter((f) => f.name === n);
const [xFiller, numFiller, valuedFiller] = byName("FILLER");

// --- fillerFillValue: which fillers may take a fill char -------------------
assert.strictEqual(fillerFillValue(xFiller, ","), ",,,", "X filler repeats across its full width");
assert.strictEqual(fillerFillValue(xFiller, ";"), ";;;");
assert.strictEqual(fillerFillValue(xFiller, ""), null, "no char = leave alone (spaces)");

// the two that must be refused, or the stream silently disagrees with the UI
assert.strictEqual(fillerFillValue(numFiller, ","), null, "PIC 9 filler would become '00'");
assert.strictEqual(fillerFillValue(valuedFiller, ","), null, "VALUE filler keeps its literal");

const named = fields.find((f) => f.name === "WIDGET-CODE")!;
assert.strictEqual(fillerFillValue(named, ","), null, "non-filler is never auto-filled");

// --- end to end through the real generator ---------------------------------
const fill = (char: string) => {
  const values: Record<string, string> = {};
  for (const f of fields) {
    const v = fillerFillValue(f, char);
    if (v !== null) values[f.id] = v;
  }
  return generateStream(fields, values);
};

const plain = generateStream(fields, {});
assert.strictEqual(plain, "    " + "   " + "000" + "00" + "ZZ", "baseline unchanged");

assert.strictEqual(fill(","), "    " + ",,," + "000" + "00" + "ZZ",
  "only the X filler changes; numeric filler stays zeros, VALUE filler stays ZZ");

assert.strictEqual(fill(",").length, plain.length, "record length never shifts");

// an explicit user value still wins over the fill char
const overridden = generateStream(fields, { [xFiller.id]: "ABC" });
assert.strictEqual(overridden.slice(4, 7), "ABC");

console.log("generate-filler: all asserts pass");
