// COBOL Copybook parsing / stream generation / stream decomposition engine.
// Pure functions only — no React, no side effects. Safe to import from any component.

export type PicType = "X" | "9" | "S9";

/** High-level semantic category of a field, used to drive input formatting/assistance in the UI. */
export type FieldKind = "ALPHA" | "NUMERIC" | "DECIMAL" | "SIGNED" | "SIGNED_DEC" | "GROUP";

export interface ParsedField {
  id: string; // stable unique id for React keys / value maps (not necessarily the COBOL name, since names can repeat)
  level: number;
  name: string; // COBOL field name, e.g. "FIELD-A" or "FILLER"
  isFiller: boolean;
  picRaw: string; // human readable pic clause, e.g. "PIC X(04)."
  type: PicType;
  length: number; // total byte length in the stream (includes decimal digits for V99 fields, excludes the decimal point itself)
  decimals: number; // number of implied decimal digits (0 if none)
  isComp3: boolean; // COMP-3 fields are displayed as plain numbers (no packed-decimal conversion), per spec
  isCompBinary: boolean; // COMP/COMP-4/BINARY — big-endian two's-complement int in binary .dat records
  redefines: string | null; // name of the field/group this field redefines, if any
  indent: number; // 0 = top-level field, 1 = inside a REDEFINES sub-group (single level supported)
  start: number; // byte offset (0-indexed) within the generated/decomposed stream
  isGroup: boolean; // true for a group header row (no PIC clause, not fillable) shown for display purposes only
  groupNote: string | null; // display text shown in place of an input for a group header row, e.g. "Redefines X" or "Record Description"
  kind: FieldKind; // semantic category (ALPHA/NUMERIC/DECIMAL/SIGNED/SIGNED_DEC/GROUP) used to drive input formatting/assistance in the UI
  initialValue: string | null; // literal from a VALUE clause (e.g. VALUE 'X'); FILLER fields with one behave like normal editable fields
  parseWarning: string | null; // non-null when the line uses a clause this parser doesn't support (OCCURS, SYNC, SIGN SEPARATE, ...) — offsets/values may be wrong
  alphaOnly: boolean; // PIC A(n): only letters and spaces are valid content — decompose warns on anything else
}

// === Overpunch (signed numeric, PIC S9) encode/decode tables ===
// COBOL DISPLAY-format signed fields encode the sign into the last character
// of the field by replacing the final digit with a special "overpunch" character.
const OVERPUNCH_DECODE: Record<string, { digit: string; sign: "+" | "-" }> = {
  "{": { digit: "0", sign: "+" }, "}": { digit: "0", sign: "-" },
  A: { digit: "1", sign: "+" }, J: { digit: "1", sign: "-" },
  B: { digit: "2", sign: "+" }, K: { digit: "2", sign: "-" },
  C: { digit: "3", sign: "+" }, L: { digit: "3", sign: "-" },
  D: { digit: "4", sign: "+" }, M: { digit: "4", sign: "-" },
  E: { digit: "5", sign: "+" }, N: { digit: "5", sign: "-" },
  F: { digit: "6", sign: "+" }, O: { digit: "6", sign: "-" },
  G: { digit: "7", sign: "+" }, P: { digit: "7", sign: "-" },
  H: { digit: "8", sign: "+" }, Q: { digit: "8", sign: "-" },
  I: { digit: "9", sign: "+" }, R: { digit: "9", sign: "-" },
};

const OVERPUNCH_POS: Record<string, string> = {
  "0": "{", "1": "A", "2": "B", "3": "C", "4": "D",
  "5": "E", "6": "F", "7": "G", "8": "H", "9": "I",
};
const OVERPUNCH_NEG: Record<string, string> = {
  "0": "}", "1": "J", "2": "K", "3": "L", "4": "M",
  "5": "N", "6": "O", "7": "P", "8": "Q", "9": "R",
};

/** Result of decoding a signed-numeric (PIC S9) raw segment. */
export interface SignedDecodeResult {
  display: string; // formatted display value, e.g. "10001.00" or "-10001.00"
  warning: string | null; // non-null when the last char wasn't a recognized overpunch character
}

/**
 * Decodes a raw fixed-width segment for a PIC S9(n) / S9(n)V9(m) field.
 * The sign is overpunched onto the LAST character of the entire field
 * (not the last digit of the integer part).
 */
export function decodeSignedNumeric(raw: string, intDigits: number, decDigits = 0): SignedDecodeResult {
  if (!raw) {
    return { display: decDigits > 0 ? `0.${"0".repeat(decDigits)}` : "0", warning: null };
  }

  const lastChar = raw[raw.length - 1];
  const decoded = OVERPUNCH_DECODE[lastChar.toUpperCase()];

  let digits: string;
  let sign: "+" | "-";
  let warning: string | null = null;

  if (decoded) {
    digits = raw.slice(0, -1) + decoded.digit;
    sign = decoded.sign;
  } else {
    // Last char is a regular digit (or unrecognized) -- assume positive, warn.
    digits = raw;
    sign = "+";
    warning = "Non-standard encoding, assumed positive";
  }

  digits = digits.replace(/[^0-9]/g, "").padStart(intDigits + decDigits, "0");

  const intPart = digits.slice(0, intDigits).replace(/^0+(?=\d)/, "") || "0";
  const display =
    decDigits === 0
      ? `${sign === "-" ? "-" : ""}${intPart}`
      : `${sign === "-" ? "-" : ""}${intPart}.${digits.slice(intDigits)}`;

  return { display, warning };
}

/**
 * Encodes a user-entered decimal string into a fixed-width overpunched segment
 * for a PIC S9(n) / S9(n)V9(m) field.
 */
export function encodeSignedNumeric(value: string, intDigits: number, decDigits = 0): string {
  const cleaned = (value ?? "").trim();
  const isNegative = cleaned.startsWith("-");
  const absValue = cleaned.replace(/^-/, "").replace(/[^0-9.]/g, "");
  const [intPartRaw, decPartRaw = ""] = absValue.split(".");

  const intDigitsOnly = (intPartRaw || "0").replace(/[^0-9]/g, "") || "0";
  const paddedInt = intDigitsOnly.slice(-intDigits).padStart(intDigits, "0");
  const paddedDec = decPartRaw.replace(/[^0-9]/g, "").slice(0, decDigits).padEnd(decDigits, "0");
  const combined = paddedInt + paddedDec;

  const lastDigit = combined[combined.length - 1] ?? "0";
  const overpunch = isNegative ? OVERPUNCH_NEG[lastDigit] : OVERPUNCH_POS[lastDigit];

  return combined.slice(0, -1) + overpunch;
}

interface RawLine {
  level: number;
  name: string;
  isFiller: boolean;
  redefines: string | null;
  picRaw: string | null;
  type: PicType;
  length: number;
  decimals: number;
  isComp3: boolean;
  isCompBinary: boolean;
  isGroup: boolean; // true when the line has no PIC clause (group header)
  initialValue: string | null;
  parseWarning: string | null;
  alphaOnly: boolean;
}

function stripPrefixAndComments(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("*")) return null; // whole line is a comment

  const tokens = trimmed.split(/\s+/);
  const first = tokens[0];
  const isLevelToken = /^\d{1,2}$/.test(first);

  if (isLevelToken) {
    return trimmed;
  }

  // First token isn't a level number -- likely a sequence/line prefix (e.g. A23101, 24174).
  if (/\*$/.test(first)) return null; // prefix directly followed by '*' marks a comment line

  const rest = trimmed.slice(first.length).trim();
  if (!rest) return null;
  if (rest.startsWith("*")) return null;
  return rest;
}

function parsePicture(pic: string): {
  type: PicType;
  length: number;
  decimals: number;
  picWarning: string | null;
  alphaOnly: boolean;
} {
  const isSigned = /^\s*S/i.test(pic);
  const body = isSigned ? pic.replace(/^\s*S/i, "") : pic;

  let length = 0;
  let decimals = 0;
  let type: PicType = "X";
  let afterV = false;
  let sawFirstChar = false;
  let edited = false;
  let hasP = false;
  let sawA = false;
  let sawOther = false;

  // CR/DB take 2 bytes; every other symbol takes 1 (V, P take none).
  const re = /(CR|DB|[9XAV]|[ZB0/.,*$+-]|P)(\((\d+)\))?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const ch = m[1].toUpperCase();
    const count = m[3] ? parseInt(m[3], 10) : 1;

    if (ch === "V") {
      afterV = true;
      continue;
    }
    if (ch === "P") {
      hasP = true;
      continue;
    }

    if (!sawFirstChar) {
      type = ch === "9" ? "9" : "X";
      sawFirstChar = true;
    }
    if (!/^(9|X|A)$/.test(ch)) edited = true;
    if (ch === "A") sawA = true;
    else sawOther = true;

    length += (ch === "CR" || ch === "DB" ? 2 : 1) * count;
    if (afterV) decimals += count;
  }

  let picWarning: string | null = null;
  if (edited) {
    // Edited fields (Z * $ , . etc.) are treated as raw text of the correct byte
    // length — output editing/de-editing isn't implemented.
    type = "X";
    decimals = 0;
    picWarning = `Edited PIC ${pic} treated as text (${length} bytes)`;
  } else if (isSigned && type === "9") {
    type = "S9";
  }
  if (hasP) {
    picWarning = `PIC ${pic}: P scaling unsupported — value will be unscaled`;
  }

  return { type, length, decimals, picWarning, alphaOnly: sawA && !sawOther };
}

/**
 * Parses a COBOL VALUE clause into the literal string that fills the field.
 * Supports: VALUE [IS] [ALL] 'lit' / "lit" / numeric literal, and the
 * figurative constants ZERO(S)/ZEROES, SPACE(S), QUOTE(S).
 * ALL and the plural figurative constants repeat to fill the field length.
 * ponytail: HIGH-VALUES/LOW-VALUES (0xFF/0x00 bytes) unsupported -- non-printable in a text stream
 */
function parseValueClause(afterLevel: string, length: number): string | null {
  const m = afterLevel.match(
    /VALUE\s+(?:IS\s+)?(ALL\s+)?(?:'([^']*)'|"([^"]*)"|([+-]?\d+(?:\.\d+)?)|(ZEROE?S?|SPACES?|QUOTES?))/i,
  );
  if (!m) return null;

  const [, all, singleQuoted, doubleQuoted, numeric, figurative] = m;
  let literal = singleQuoted ?? doubleQuoted ?? numeric ?? null;

  if (figurative) {
    const fig = figurative.toUpperCase();
    if (fig.startsWith("ZERO")) literal = "0".repeat(Math.max(length, 1));
    else if (fig.startsWith("SPACE")) literal = " ".repeat(Math.max(length, 1));
    else literal = '"';
  }

  if (literal !== null && all && literal.length > 0 && length > 0) {
    literal = literal.repeat(Math.ceil(length / literal.length)).slice(0, length);
  }

  return literal;
}

function parseLine(line: string): RawLine | null {
  const levelMatch = line.match(/^(\d{1,2})\s+(.*)$/);
  if (!levelMatch) return null;

  const level = parseInt(levelMatch[1], 10);
  if (level === 88) return null; // condition names -- skip, never affect the stream

  const afterLevel = levelMatch[2].trim();
  if (!afterLevel) return null;

  const nameTokenMatch = afterLevel.match(/^([A-Za-z0-9\-]+)/);
  if (!nameTokenMatch) return null;
  const name = nameTokenMatch[1].replace(/\.$/, "");
  const isFiller = name.toUpperCase() === "FILLER";

  const redefinesMatch = afterLevel.match(/REDEFINES\s+([A-Za-z0-9\-]+)/i);
  const redefines = redefinesMatch ? redefinesMatch[1] : null;

  const picMatch = afterLevel.match(/PIC(?:TURE)?\s+([A-Za-z0-9().,*$/+-]+)/i);
  const isComp3 = /COMP-3|COMPUTATIONAL-3/i.test(afterLevel);
  // COMP / COMPUTATIONAL / COMP-4 / BINARY / COMP-5 = big-endian binary int
  // (COMP-5 is native binary; mainframe-native = big-endian, same sizes as COMP).
  // The lookahead rejects COMP-1/-2 (and COMP-3, already handled above).
  const isCompBinary =
    !isComp3 && /\b(?:COMP(?:UTATIONAL)?(?:-[45])?|BINARY)(?![-\w])/i.test(afterLevel);

  // Clauses this parser doesn't implement — flag them instead of silently
  // producing wrong offsets/values downstream.
  const unsupported: string[] = [];
  if (/\bOCCURS\b/i.test(afterLevel)) unsupported.push("OCCURS (only 1 occurrence counted)");
  if (/\bSYNC(HRONIZED)?\b/i.test(afterLevel)) unsupported.push("SYNC (slack bytes not added)");
  if (/\bSIGN\b[\s\S]*\bSEPARATE\b/i.test(afterLevel)) unsupported.push("SIGN SEPARATE (extra sign byte not counted)");
  else if (/\bSIGN\s+(?:IS\s+)?LEADING\b/i.test(afterLevel)) unsupported.push("SIGN LEADING (sign decoded as trailing)");
  if (/COMP(?:UTATIONAL)?-[12](?![-\w])/i.test(afterLevel)) unsupported.push("COMP-1/-2 float (treated as text)");
  if (/\bRENAMES\b/i.test(afterLevel)) unsupported.push("RENAMES (ignored)");

  if (!picMatch) {
    return {
      level,
      name,
      isFiller,
      redefines,
      picRaw: null,
      type: "X",
      length: 0,
      decimals: 0,
      isComp3,
      isCompBinary,
      alphaOnly: false,
      isGroup: true,
      initialValue: null,
      parseWarning: unsupported.length ? `Unsupported: ${unsupported.join("; ")}` : null,
    };
  }

  const picStr = picMatch[1].replace(/\.$/, ""); // clause-terminating period
  const { type, length, decimals, picWarning, alphaOnly } = parsePicture(picStr);
  const initialValue = parseValueClause(afterLevel, length);
  if (picWarning) unsupported.push(picWarning);
  if (length === 0) unsupported.push(`PIC ${picStr} not understood (counted as 0 bytes)`);

  return {
    level,
    name,
    isFiller,
    redefines,
    picRaw: `PIC ${picStr}.`,
    type,
    length,
    decimals,
    isComp3,
    isCompBinary,
    isGroup: false,
    initialValue,
    parseWarning: unsupported.length ? `Unsupported: ${unsupported.join("; ")}` : null,
    alphaOnly,
  };
}

/**
 * Parses a COBOL copybook (.txt) into a flat, ordered list of elementary fields
 * ready for stream generation and decomposition. Group headers (lines with no
 * PIC clause) are used only to resolve REDEFINES targets and offsets — they do
 * not appear in the returned list.
 */
export function parseCopybook(source: string): ParsedField[] {
  const lines = source.split(/\r?\n/);
  const fields: ParsedField[] = [];
  const offsetsByName = new Map<string, number>();

  let cursor = 0;
  let shadowLevel: number | null = null;
  let shadowCursor = 0;
  let fieldCounter = 0;

  for (const rawLine of lines) {
    const cleaned = stripPrefixAndComments(rawLine);
    if (cleaned === null) continue;

    const parsed = parseLine(cleaned);
    if (!parsed) continue;

    // Exit the shadow (REDEFINES) group once we hit a line at or above its level.
    if (shadowLevel !== null && parsed.level <= shadowLevel) {
      shadowLevel = null;
    }

    if (parsed.isGroup) {
      if (parsed.redefines) {
        const targetOffset = offsetsByName.get(parsed.redefines.toUpperCase());
        const groupStart = targetOffset ?? cursor;

        // Emit a non-fillable display-only row for the REDEFINES group header itself,
        // so users can see it in the field table (with a "Redefines X" description)
        // even though it carries no value/length of its own -- its children (indented
        // beneath it) hold the actual overlapping fields.
        fieldCounter += 1;
        fields.push({
          id: `f${fieldCounter}`,
          level: parsed.level,
          name: parsed.name,
          isFiller: parsed.isFiller,
          picRaw: "",
          type: "X",
          length: 0,
          decimals: 0,
          isComp3: false,
          isCompBinary: false,
          redefines: parsed.redefines,
          indent: shadowLevel !== null ? 1 : 0,
          start: groupStart,
          isGroup: true,
          kind: "GROUP",
          groupNote: `Redefines ${parsed.redefines}`,
          initialValue: null,
          parseWarning: parsed.parseWarning,
          alphaOnly: false,
        });

        offsetsByName.set(parsed.name.toUpperCase(), groupStart);

        shadowLevel = parsed.level;
        shadowCursor = groupStart;
      } else {
        // Emit a non-fillable display-only row for the group header itself (whether it's
        // the top-level 01 record or a nested structural group like "05 PAYMENT-DETAILS."),
        // so users can see the record/group structure even though the row carries no
        // value/length of its own -- its children accumulate the actual byte length below it.
        fieldCounter += 1;
        fields.push({
          id: `f${fieldCounter}`,
          level: parsed.level,
          name: parsed.name,
          isFiller: parsed.isFiller,
          picRaw: "",
          type: "X",
          length: 0,
          decimals: 0,
          isComp3: false,
          isCompBinary: false,
          redefines: null,
          indent: shadowLevel !== null ? 1 : 0,
          start: shadowLevel !== null ? shadowCursor : cursor,
          isGroup: true,
          kind: "GROUP",
          groupNote: parsed.level === 1 ? "Record Description" : null,
          initialValue: null,
          parseWarning: parsed.parseWarning,
          alphaOnly: false,
        });

        offsetsByName.set(parsed.name.toUpperCase(), shadowLevel !== null ? shadowCursor : cursor);
      }
      continue;
    }

    fieldCounter += 1;
    const id = `f${fieldCounter}`;

    let start: number;
    let indent = 0;

    if (shadowLevel !== null) {
      // Field nested inside an active REDEFINES group -- shares the group's offset space.
      start = shadowCursor;
      shadowCursor += parsed.length;
      indent = 1;
    } else if (parsed.redefines) {
      // A single elementary field redefining another field/group directly.
      const targetOffset = offsetsByName.get(parsed.redefines.toUpperCase());
      start = targetOffset ?? cursor;
      indent = 1;
    } else {
      start = cursor;
      cursor += parsed.length;
      indent = 0;
    }

    offsetsByName.set(parsed.name.toUpperCase(), start);

    fields.push({
      id,
      level: parsed.level,
      name: parsed.name,
      isFiller: parsed.isFiller,
      picRaw: parsed.picRaw ?? "",
      type: parsed.type,
      length: parsed.length,
      decimals: parsed.decimals,
      isComp3: parsed.isComp3,
      isCompBinary: parsed.isCompBinary,
      redefines: parsed.redefines,
      indent,
      start,
      isGroup: false,
      kind:
        parsed.type === "X"
          ? "ALPHA"
          : parsed.type === "S9"
          ? parsed.decimals > 0
            ? "SIGNED_DEC"
            : "SIGNED"
          : parsed.decimals > 0
          ? "DECIMAL"
          : "NUMERIC",
      groupNote: null,
      initialValue: parsed.initialValue,
      parseWarning: parsed.parseWarning,
      alphaOnly: parsed.alphaOnly,
    });
  }

  return fields;
}

/** Formats a single field's user-entered value into its fixed-width stream representation. */
export function formatFieldValue(field: ParsedField, rawValue: string): string {
  const value = rawValue ?? "";

  if (field.type === "S9") {
    const intLen = field.length - field.decimals;
    return encodeSignedNumeric(value, intLen, field.decimals);
  }

  if (field.type === "9") {
    if (field.decimals > 0) {
      const intLen = field.length - field.decimals;
      const cleaned = value.replace(/[^0-9.\-]/g, "");
      const [intPartRaw, decPartRaw = ""] = cleaned.split(".");
      const intDigits = (intPartRaw || "0").replace(/[^0-9]/g, "") || "0";
      const decDigits = decPartRaw.replace(/[^0-9]/g, "");
      const intPadded = intDigits.slice(-intLen).padStart(intLen, "0");
      const decPadded = decDigits.slice(0, field.decimals).padEnd(field.decimals, "0");
      return `${intPadded}${decPadded}`;
    }
    const digits = value.replace(/[^0-9]/g, "") || "0";
    return digits.slice(-field.length).padStart(field.length, "0");
  }

  // PIC A: only letters and spaces are valid — drop anything else before padding.
  const text = field.alphaOnly ? value.replace(/[^A-Za-z ]/g, "") : value;

  // Alphanumeric (X) fields: pad with trailing spaces, truncate if too long.
  return text.slice(0, field.length).padEnd(field.length, " ");
}

/** Total fixed-width byte length of the record described by a parsed copybook (REDEFINES overlaps don't add). */
export function getRecordLength(fields: ParsedField[]): number {
  return fields.reduce((max, f) => Math.max(max, f.start + f.length), 0);
}

/** Builds the full fixed-width stream from a set of user-entered field values. */
export function generateStream(fields: ParsedField[], values: Record<string, string>): string {
  // Fields with indent > 0 (REDEFINES) occupy the same bytes as their target,
  // so only one "view" of each overlapping byte range should be written. We
  // write top-level (indent 0) fields first, then let REDEFINES fields overwrite
  // the same range only if the user actually typed a value for them.
  const length = getRecordLength(fields);
  const chars: string[] = new Array(length).fill(" ");

  const writeField = (field: ParsedField) => {
    const formatted = formatFieldValue(field, values[field.id] ?? field.initialValue ?? "");
    for (let i = 0; i < formatted.length; i++) {
      chars[field.start + i] = formatted[i];
    }
  };

  fields.filter((f) => f.indent === 0).forEach(writeField);
  fields
    .filter((f) => f.indent > 0 && (values[f.id] ?? "").length > 0)
    .forEach(writeField);

  return chars.join("");
}

/** Extracts a field's raw fixed-width substring from a stream. */
export function extractFieldRaw(field: ParsedField, stream: string): string {
  return stream.slice(field.start, field.start + field.length).padEnd(field.length, " ");
}

/** Converts a field's raw fixed-width substring into its display value (trimmed / decimal-formatted). */
export function displayFieldValue(field: ParsedField, raw: string): string {
  if (field.type === "S9") {
    const intLen = field.length - field.decimals;
    return decodeSignedNumeric(raw, intLen, field.decimals).display;
  }

  if (field.type === "9") {
    if (field.decimals > 0) {
      const intLen = field.length - field.decimals;
      const intPart = raw.slice(0, intLen).replace(/[^0-9]/g, "") || "0";
      const decPart = raw.slice(intLen).replace(/[^0-9]/g, "").padEnd(field.decimals, "0");
      const trimmedInt = intPart.replace(/^0+(?=\d)/, "");
      return `${trimmedInt}.${decPart}`;
    }
    const digits = raw.replace(/[^0-9]/g, "") || "0";
    const trimmed = digits.replace(/^0+(?=\d)/, "");
    return trimmed;
  }
  return raw.replace(/\s+$/, "");
}

export interface DecomposedField extends ParsedField {
  raw: string;
  value: string;
  warning: string | null; // non-null when this field's decoding is questionable (non-standard sign, truncated stream, etc.)
}

/** Decomposes a stream into field values, given a parsed copybook. */
export function decomposeStream(fields: ParsedField[], stream: string): DecomposedField[] {
  return fields.map((field) => {
    if (field.isGroup) {
      return { ...field, raw: "", value: "", warning: field.parseWarning };
    }

    const available = stream.length - field.start;
    let warning: string | null = field.parseWarning;

    if (available < field.length) {
      warning = `Stream too short for field ${field.name}`;
    } else if (field.type === "X" && field.isFiller && stream.slice(field.start, field.start + field.length).startsWith(" ")) {
      // FILLER (PIC X) fields with a leading space are a common symptom of an
      // upstream stream that's a different length than this copybook expects.
      if (stream.length !== getRecordLength(fields)) {
        warning = `Stream length mismatch. Expected ${getRecordLength(fields)} chars, got ${stream.length}. Check for hidden leading spaces.`;
      }
    }

    const raw = extractFieldRaw(field, stream);
    let value: string;

    if (field.alphaOnly && !warning && /[^A-Za-z ]/.test(raw)) {
      warning = `Non-alphabetic data in PIC A field ${field.name}`;
    }

    if (field.type === "S9") {
      const intLen = field.length - field.decimals;
      const decoded = decodeSignedNumeric(raw, intLen, field.decimals);
      value = decoded.display;
      if (decoded.warning && !warning) warning = decoded.warning;
    } else {
      value = displayFieldValue(field, raw);
    }

    return { ...field, raw, value, warning };
  });
}
