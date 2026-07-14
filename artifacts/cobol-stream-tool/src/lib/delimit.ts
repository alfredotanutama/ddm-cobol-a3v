import { decomposeStream, type DecomposedField, type ParsedField } from "./cobol.ts";

/** Quote a value (RFC 4180) when it contains the delimiter, a quote, or a newline,
 *  so existing symbols in the data can never be confused with column separators. */
export const escapeValue = (s: string, delim: string) =>
  s.includes(delim) || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;

/** Elementary fields that become columns; pure FILLER padding is skipped. */
export const isDataField = (f: ParsedField) =>
  !f.isGroup && f.length > 0 && (!f.isFiller || f.initialValue !== null);

/**
 * Trims a numeric field's fixed-width value to a plain number:
 * "00123.45" -> "123.45", "-00123.45" -> "-123.45", "00000" -> "0".
 * String trimming (not Number()) so 15+ digit values never lose precision.
 */
export const trimNumericValue = (s: string) => s.replace(/^(-?)0+(?=\d)/, "$1");

/** Applies trimNumericValue to every numeric (PIC 9/S9) column of decoded rows. */
export const trimNumericRows = (rows: DecomposedField[][]): DecomposedField[][] =>
  rows.map((row) =>
    row.map((d) =>
      !d.isGroup && (d.type === "9" || d.type === "S9")
        ? { ...d, value: trimNumericValue(d.value) }
        : d,
    ),
  );

/** Header + one delimited row per decomposed record. Fields whose id is in `excluded` are left out. */
export function delimitRows(
  fields: ParsedField[],
  rows: DecomposedField[][],
  delim: string,
  excluded?: Set<string>,
): string[] {
  const included = (f: ParsedField) => isDataField(f) && !excluded?.has(f.id);
  const header = fields.filter(included).map((f) => escapeValue(f.name, delim)).join(delim);
  const out = rows.map((row) =>
    row.filter(included).map((d) => escapeValue(d.value, delim)).join(delim),
  );
  return [header, ...out];
}

/** Text-mode convenience: decompose fixed-width text lines, then delimit. */
export function delimitLines(
  fields: ParsedField[],
  lines: string[],
  delim: string,
  excluded?: Set<string>,
): string[] {
  return delimitRows(fields, lines.map((line) => decomposeStream(fields, line)), delim, excluded);
}
