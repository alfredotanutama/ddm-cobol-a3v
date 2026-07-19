// Export a parsed copybook as a DECODEETO "pre-template" file.
// Format (one field per line): LABEL:LEN:VISIBLE:TYPE=DEFAULT
//   LABEL   = field name
//   LEN     = byte length
//   VISIBLE = 1 for data fields, 0 for FILLER
//   TYPE    = 9 for numeric fields, X otherwise
//   =DEFAULT = optional, from a VALUE clause (quoted)

import type { ParsedField } from "./cobol.ts";

export const PRE_TEMPLATE_HEADER = "# LABEL:LEN:VISIBLE:TYPE=DEFAULT   (# lines are ignored)";

const NUMERIC_KINDS = new Set(["NUMERIC", "DECIMAL", "SIGNED", "SIGNED_DEC"]);

/** Fields that occupy their own bytes in the record (skips groups and REDEFINES overlays). */
export const isTemplateField = (f: ParsedField) =>
  !f.isGroup && f.length > 0 && f.redefines === null && f.indent === 0;

export function toPreTemplate(fields: ParsedField[]): string {
  const lines = fields
    .filter(isTemplateField)
    .map((f) => {
      const type = NUMERIC_KINDS.has(f.kind) ? "9" : "X";
      const visible = f.isFiller ? 0 : 1;
      const def = f.initialValue != null ? `="${f.initialValue}"` : "";
      return `${f.name}:${f.length}:${visible}:${type}${def}`;
    });
  return [PRE_TEMPLATE_HEADER, ...lines].join("\n");
}
