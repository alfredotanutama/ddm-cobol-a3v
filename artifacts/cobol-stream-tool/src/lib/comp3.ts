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

/** Byte length of one field inside a BINARY record: packed for COMP-3, halfword/word/doubleword for COMP, 1 byte/char otherwise. */
export function packedByteLength(field: ParsedField): number {
  if (field.isGroup) return 0;
  if (field.isComp3) return Math.ceil((field.length + 1) / 2);
  if (field.isCompBinary) return field.length <= 4 ? 2 : field.length <= 9 ? 4 : 8;
  return field.length;
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

/** Formats a decoded digit string to RAW FIXED-WIDTH: full PIC digit count, zero-padded, "." at the V position, "-" prefix. */
function formatDigits(field: ParsedField, digits: string, negative: boolean): string {
  digits = digits.slice(-field.length).padStart(field.length, "0");
  const intLen = field.length - field.decimals;
  const body =
    field.decimals > 0 ? `${digits.slice(0, intLen)}.${digits.slice(intLen)}` : digits;
  return `${negative ? "-" : ""}${body}`;
}

/**
 * Decodes one field's bytes to its display value.
 * COMP-3: nibbles = digits, last nibble = sign (C/F/A/E = +, D/B = −), formatted RAW
 * FIXED-WIDTH (full PIC digit count, zero-padded, "." at the V position, "-" prefix).
 * COMP (binary): big-endian two's-complement int, same fixed-width formatting.
 * DISPLAY fields: EBCDIC per byte, non-printables as ".".
 */
export function decodeBinaryField(
  field: ParsedField,
  bytes: Uint8Array,
): { value: string; warning: string | null } {
  if (field.isCompBinary) {
    let v = 0n;
    for (const b of bytes) v = (v << 8n) | BigInt(b);
    const bits = BigInt(bytes.length * 8);
    if (field.type === "S9" && v >= 1n << (bits - 1n)) v -= 1n << bits; // two's complement
    return { value: formatDigits(field, (v < 0n ? -v : v).toString(), v < 0n), warning: null };
  }

  if (!field.isComp3) {
    if (field.type === "S9") {
      // Zoned decimal (PIC S9 DISPLAY) in EBCDIC: digit = low nibble of each
      // byte, sign = zone nibble of the LAST byte (C/A/E/F = +, D/B = −).
      let warning: string | null = null;
      let digits = "";
      for (const b of bytes) {
        const d = b & 0x0f;
        if (d > 9) {
          if (!warning) warning = `Invalid zoned digit 0x${d.toString(16).toUpperCase()} in ${field.name}`;
          digits += "0";
        } else {
          digits += String(d);
        }
      }
      const zone = bytes.length ? bytes[bytes.length - 1] >> 4 : 0x0f;
      if (zone <= 9) warning = `Invalid sign zone 0x${zone.toString(16).toUpperCase()} in ${field.name}`;
      const negative = zone === 0x0d || zone === 0x0b;
      return { value: formatDigits(field, digits, negative), warning };
    }
    let out = "";
    for (const b of bytes) out += ebcdicToAscii(b);
    const warning =
      field.alphaOnly && /[^A-Za-z ]/.test(out)
        ? `Non-alphabetic data in PIC A field ${field.name}`
        : null;
    return { value: out, warning };
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
  // Packed storage holds an odd digit count; formatDigits keeps the PIC's exact digit width.
  return { value: formatDigits(field, digits, negative), warning };
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

/**
 * Finds the real record stride when the copybook is shorter than the file's LRECL —
 * each record is copybook bytes + trailing low-value/space filler. Returns the smallest
 * stride that divides the file AND whose pad region is only 0x00 / EBCDIC space in EVERY
 * record; falls back to the copybook length when none qualifies.
 */
function detectStride(recordLength: number, data: Uint8Array): number {
  if (data.length % recordLength === 0) return recordLength;
  for (let L = recordLength + 1; L <= data.length; L++) {
    if (data.length % L !== 0) continue;
    let ok = true;
    for (let i = 0; i < data.length && ok; i += L) {
      for (let p = i + recordLength; p < i + L; p++) {
        const b = data[p];
        if (b !== 0x00 && b !== 0x40) { ok = false; break; }
      }
    }
    if (ok) return L;
  }
  return recordLength;
}

/**
 * Splits a binary .dat buffer into records and decodes every field of every record.
 * With `ignorePadding`, trailing low-value/space filler after each record (copybook
 * shorter than the file's LRECL) is detected and skipped, so the user doesn't have to
 * append a FILLER to the copybook first.
 */
export function decomposeBinaryRecords(
  fields: ParsedField[],
  data: Uint8Array,
  ignorePadding = false,
): BinaryDecomposition {
  const { byId, recordLength } = binaryLayout(fields);
  const records: DecomposedField[][] = [];
  const warnings: string[] = [];
  let skippedZeroRecords = 0;

  for (const f of fields) {
    if (f.parseWarning) warnings.push(`${f.name}: ${f.parseWarning}`);
  }

  if (recordLength === 0) {
    return { records, warnings, recordLength, skippedZeroRecords, leftoverBytes: data.length };
  }

  const stride = ignorePadding ? detectStride(recordLength, data) : recordLength;
  if (stride !== recordLength) {
    warnings.push(
      `Records are ${stride} bytes in the file; the copybook describes ${recordLength} — the trailing ${stride - recordLength} bytes of low-value/space padding per record were ignored.`,
    );
  }

  const fullRecords = Math.floor(data.length / stride);
  const leftoverBytes = data.length % stride;

  for (let r = 0; r < fullRecords; r++) {
    const rec = data.subarray(r * stride, (r + 1) * stride);
    if (rec.every((b) => b === 0)) {
      skippedZeroRecords++;
      continue;
    }
    records.push(
      fields.map((field) => {
        if (field.isGroup) return { ...field, raw: "", value: "", warning: field.parseWarning };
        const loc = byId.get(field.id)!;
        const slice = rec.subarray(loc.byteStart, loc.byteStart + loc.byteLength);
        const { value, warning } = decodeBinaryField(field, slice);
        return { ...field, raw: toHex(slice), value, warning: warning ?? field.parseWarning };
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
      `${leftoverBytes} leftover byte${leftoverBytes === 1 ? "" : "s"} at the end of the file don't fill a whole ${stride}-byte record.`,
    );
  }

  // recordLength reported to the UI = actual bytes per record in the file (incl. any padding).
  return { records, warnings, recordLength: stride, skippedZeroRecords, leftoverBytes };
}
