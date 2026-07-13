// Binary COMP-3 (packed decimal) record decoding for Delimiter Export.
// Pure functions only — no React, no side effects. See parser_cobol_guide.md §10 for the rules,
// validated byte-for-byte against real mainframe data (COMP3COPYBOOK.txt / DATA_DAT.dat).

import type { DecomposedField, ParsedField } from "./cobol.ts";

// === EBCDIC (CP037) -> ASCII, printable subset. Every unmapped byte renders as "." (ISPF style). ===
const EBCDIC_PRINTABLE: Record<number, string> = {
  0x40: " ",
  0x4b: ".", 0x4c: "<", 0x4d: "(", 0x4e: "+", 0x4f: "|",
  0x50: "&", 0x5a: "!", 0x5b: "$", 0x5c: "*", 0x5d: ")", 0x5e: ";",
  0x60: "-", 0x61: "/", 0x6b: ",", 0x6c: "%", 0x6d: "_", 0x6e: ">", 0x6f: "?",
  0x7a: ":", 0x7b: "#", 0x7c: "@", 0x7d: "'", 0x7e: "=", 0x7f: '"',
};
for (let i = 0; i < 9; i++) {
  EBCDIC_PRINTABLE[0x81 + i] = String.fromCharCode(97 + i); // a-i
  EBCDIC_PRINTABLE[0x91 + i] = String.fromCharCode(106 + i); // j-r
  EBCDIC_PRINTABLE[0xc1 + i] = String.fromCharCode(65 + i); // A-I
  EBCDIC_PRINTABLE[0xd1 + i] = String.fromCharCode(74 + i); // J-R
}
for (let i = 0; i < 8; i++) {
  EBCDIC_PRINTABLE[0xa2 + i] = String.fromCharCode(115 + i); // s-z
  EBCDIC_PRINTABLE[0xe2 + i] = String.fromCharCode(83 + i); // S-Z
}
for (let i = 0; i < 10; i++) EBCDIC_PRINTABLE[0xf0 + i] = String.fromCharCode(48 + i); // 0-9

export const ebcdicToAscii = (byte: number): string => EBCDIC_PRINTABLE[byte] ?? ".";

/** Byte length of one field inside a BINARY record: packed for COMP-3, 1 byte/char otherwise. */
export function packedByteLength(field: ParsedField): number {
  if (field.isGroup) return 0;
  return field.isComp3 ? Math.ceil((field.length + 1) / 2) : field.length;
}

export interface BinaryLayout {
  /** field.id -> { byteStart, byteLength } within one binary record */
  byId: Map<string, { byteStart: number; byteLength: number }>;
  recordLength: number;
}

/**
 * Assigns packed byte offsets to every elementary field, mirroring parseCopybook's cursor
 * rules: REDEFINES overlays its target's offset; fields inside a REDEFINES group (indent 1,
 * no own redefines) run sequentially from the group's start; overlaps don't add to the total.
 */
export function binaryLayout(fields: ParsedField[]): BinaryLayout {
  const byId = new Map<string, { byteStart: number; byteLength: number }>();
  const offsetsByName = new Map<string, number>();
  let cursor = 0;
  let shadowCursor = 0;
  let recordLength = 0;

  for (const f of fields) {
    if (f.isGroup) {
      const start = f.redefines
        ? offsetsByName.get(f.redefines.toUpperCase()) ?? cursor
        : f.indent > 0
        ? shadowCursor
        : cursor;
      offsetsByName.set(f.name.toUpperCase(), start);
      if (f.redefines) shadowCursor = start;
      continue;
    }

    const byteLength = packedByteLength(f);
    let byteStart: number;
    if (f.redefines) {
      byteStart = offsetsByName.get(f.redefines.toUpperCase()) ?? cursor;
    } else if (f.indent > 0) {
      byteStart = shadowCursor;
      shadowCursor += byteLength;
    } else {
      byteStart = cursor;
      cursor += byteLength;
    }

    offsetsByName.set(f.name.toUpperCase(), byteStart);
    byId.set(f.id, { byteStart, byteLength });
    recordLength = Math.max(recordLength, byteStart + byteLength);
  }

  return { byId, recordLength };
}

/**
 * Decodes one field's bytes to its display value.
 * COMP-3: nibbles = digits, last nibble = sign (C/F/A/E = +, D/B = −), formatted RAW
 * FIXED-WIDTH (full PIC digit count, zero-padded, "." at the V position, "-" prefix).
 * DISPLAY fields: EBCDIC per byte, non-printables as ".".
 */
export function decodeBinaryField(
  field: ParsedField,
  bytes: Uint8Array,
): { value: string; warning: string | null } {
  if (!field.isComp3) {
    let out = "";
    for (const b of bytes) out += ebcdicToAscii(b);
    return { value: out, warning: null };
  }

  const nibbles: number[] = [];
  for (const b of bytes) {
    nibbles.push(b >> 4, b & 0x0f);
  }
  const sign = nibbles.pop() ?? 0x0f;

  let warning: string | null = null;
  if (sign <= 9) warning = `Invalid sign nibble 0x${sign.toString(16).toUpperCase()} in ${field.name}`;
  const negative = sign === 0x0d || sign === 0x0b;

  let digits = "";
  for (const n of nibbles) {
    if (n > 9) {
      if (!warning) warning = `Invalid packed digit 0x${n.toString(16).toUpperCase()} in ${field.name}`;
      digits += "0";
    } else {
      digits += String(n);
    }
  }
  // Packed storage holds an odd digit count; keep the PIC's exact digit width.
  digits = digits.slice(-field.length).padStart(field.length, "0");

  const intLen = field.length - field.decimals;
  const body =
    field.decimals > 0 ? `${digits.slice(0, intLen)}.${digits.slice(intLen)}` : digits;
  return { value: `${negative ? "-" : ""}${body}`, warning };
}

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");

export interface BinaryDecomposition {
  records: DecomposedField[][];
  warnings: string[];
  recordLength: number;
  /** records skipped because every byte was 0x00 (tail padding) */
  skippedZeroRecords: number;
  /** bytes at the end of the file that don't fill a whole record */
  leftoverBytes: number;
}

/** Splits a binary .dat buffer into records and decodes every field of every record. */
export function decomposeBinaryRecords(
  fields: ParsedField[],
  data: Uint8Array,
): BinaryDecomposition {
  const { byId, recordLength } = binaryLayout(fields);
  const records: DecomposedField[][] = [];
  const warnings: string[] = [];
  let skippedZeroRecords = 0;

  if (recordLength === 0) {
    return { records, warnings, recordLength, skippedZeroRecords, leftoverBytes: data.length };
  }

  const fullRecords = Math.floor(data.length / recordLength);
  const leftoverBytes = data.length % recordLength;

  for (let r = 0; r < fullRecords; r++) {
    const rec = data.subarray(r * recordLength, (r + 1) * recordLength);
    if (rec.every((b) => b === 0)) {
      skippedZeroRecords++;
      continue;
    }
    records.push(
      fields.map((field) => {
        if (field.isGroup) return { ...field, raw: "", value: "", warning: null };
        const loc = byId.get(field.id)!;
        const slice = rec.subarray(loc.byteStart, loc.byteStart + loc.byteLength);
        const { value, warning } = decodeBinaryField(field, slice);
        return { ...field, raw: toHex(slice), value, warning };
      }),
    );
  }

  if (skippedZeroRecords > 0) {
    warnings.push(
      `${skippedZeroRecords} all-zero record${skippedZeroRecords === 1 ? "" : "s"} skipped (tail padding).`,
    );
  }
  if (leftoverBytes > 0) {
    warnings.push(
      `${leftoverBytes} leftover byte${leftoverBytes === 1 ? "" : "s"} at the end of the file don't fill a whole ${recordLength}-byte record.`,
    );
  }

  return { records, warnings, recordLength, skippedZeroRecords, leftoverBytes };
}
