import { decomposeStream, type ParsedField } from "./cobol.ts";

/** Quote a value (RFC 4180) when it contains the delimiter, a quote, or a newline,
 *  so existing symbols in the data can never be confused with column separators. */
export const escapeValue = (s: string, delim: string) =>
  s.includes(delim) || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;

/** Elementary fields that become columns; pure FILLER padding is skipped. */
export const isDataField = (f: ParsedField) =>
  !f.isGroup && f.length > 0 && (!f.isFiller || f.initialValue !== null);

/** Header + one delimited row per input line. Fields whose id is in `excluded` are left out. */
export function delimitLines(
  fields: ParsedField[],
  lines: string[],
  delim: string,
  excluded?: Set<string>,
): string[] {
  const included = (f: ParsedField) => isDataField(f) && !excluded?.has(f.id);
  const header = fields.filter(included).map((f) => escapeValue(f.name, delim)).join(delim);
  const rows = lines.map((line) =>
    decomposeStream(fields, line)
      .filter(included)
      .map((d) => escapeValue(d.value, delim))
      .join(delim),
  );
  return [header, ...rows];
}
