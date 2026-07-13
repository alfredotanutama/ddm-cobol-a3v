# COBOL Copybook Parsing Rules — DDM Stream for COBOLers

Single source of truth for every parsing/encoding/decoding rule the app implements.
Code lives in `artifacts/cobol-stream-tool/src/lib/` — `cobol.ts` (parser + text engine),
`delimit.ts` (CSV export), `comp3.ts` (binary COMP-3, in progress).

---

## 1. Reading copybook lines (`stripPrefixAndComments`, `parseLine`)

Each line is cleaned before parsing:

| Rule | Example | Result |
|---|---|---|
| Blank lines | | skipped |
| Whole-line comment (`*` first char) | `* THIS IS A COMMENT` | skipped |
| Sequence/line prefix (first token isn't a 1–2 digit level) | `A23101 05 FIELD-A PIC X(4).` | prefix dropped, rest parsed |
| Prefix ending in `*` | `24174* comment` | skipped |
| Level 88 (condition names) | `88 IS-ACTIVE VALUE '1'.` | skipped — never affects the stream |

A parseable line is: `<level 1–99> <NAME> [REDEFINES x] [PIC ...] [COMP-3] [VALUE ...]`.
The trailing `.` on a name is stripped. Names match `[A-Za-z0-9-]+`.

## 2. Groups vs elementary fields

- **No PIC clause → group header** (e.g. `01 DAMCDB-REC.` or `05 PAYMENT-DETAILS.`).
  Groups are shown as display-only rows (level 01 gets the note "Record Description"), carry
  no bytes themselves, and exist so children can accumulate under them and so REDEFINES can
  target them by name.
- **Has PIC → elementary field**, occupies bytes in the record.

## 3. PIC clause (`parsePicture`)

Grammar: sequence of `X`, `9`, `V`, each optionally with a repeat `(n)`. Optional leading `S`.

| PIC | type | length (digits/chars) | decimals |
|---|---|---|---|
| `X(8)` | X (alphanumeric) | 8 | 0 |
| `9(10)` | 9 (numeric) | 10 | 0 |
| `9(4)V99` | 9 | 6 | 2 |
| `S9(13)V99` | S9 (signed) | 15 | 2 |

Rules:
- `V` is an **implied** decimal point: it adds no byte to the record; digits after V count
  into both `length` and `decimals`.
- Type comes from the first real character (`9` → numeric, `X` → alpha); leading `S` upgrades
  `9` to `S9`.
- `PIC` and `PICTURE` are both accepted, case-insensitive.

Field kinds derived for the UI: `ALPHA` (X), `NUMERIC` (9), `DECIMAL` (9 + V), `SIGNED` (S9),
`SIGNED_DEC` (S9 + V), `GROUP`.

## 4. FILLER and VALUE clauses (`parseValueClause`)

- `FILLER` is a valid repeating name. FILLER **without** VALUE = read-only padding.
- `VALUE` literal forms supported: `VALUE [IS] [ALL] 'lit'` / `"lit"` / signed numeric
  (`VALUE 123`, `VALUE -1.5` — the line's closing `.` is NOT captured), and figurative
  constants `ZERO/ZEROS/ZEROES`, `SPACE/SPACES`, `QUOTE/QUOTES`.
- `ALL 'AB'` and plural figuratives repeat to fill the field length, truncated to fit.
- A FILLER **with** VALUE behaves like a normal editable field (prefilled with the literal);
  Clear Values restores the VALUE, not blank.
- Unsupported by design: `HIGH-VALUES`/`LOW-VALUES` (0xFF/0x00 — non-printable in a text stream).

## 5. REDEFINES and offsets (`parseCopybook`)

Byte offsets (`start`) are assigned by walking fields in order with a cursor:

- Normal field: `start = cursor`, cursor advances by its length.
- `REDEFINES target`: field/group starts at the **target's offset** — it overlays the same
  bytes, the cursor does not advance.
- A group with REDEFINES opens a "shadow" region: all children under it (deeper level) share
  the overlay space with their own sub-cursor, get `indent = 1` in the UI, and the shadow
  closes at the next line at/above the group's level.
- **Only one nesting level of REDEFINES is supported.**
- Record length = `max(start + length)` over all fields — overlapping REDEFINES bytes are not
  double-counted.

When generating a stream, indent-0 fields are written first; REDEFINES (indent > 0) fields
overwrite the shared bytes **only if the user typed a value** for them.

## 6. Text stream: formatting values in (`formatFieldValue`)

Used by the Generate tab (fixed-width **text** records):

| type | rule | example (len 5) |
|---|---|---|
| X | pad right with spaces, truncate right | `"AB"` → `"AB   "` |
| 9 | digits only, pad left with zeros, keep the **last** n digits | `"1234567"` → `"34567"` |
| 9 + V | integer part right-aligned zero-padded, decimals left-aligned zero-filled, no `.` in stream | `9(3)V99`, `"1.5"` → `"00150"` |
| S9 | as 9/9V, then the **last character of the whole field** becomes an overpunch char | see §7 |

## 7. Signed DISPLAY numbers — overpunch (`encodeSignedNumeric` / `decodeSignedNumeric`)

The sign is punched into the final character of the field (last decimal digit if V present):

| digit | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| positive | `{` | A | B | C | D | E | F | G | H | I |
| negative | `}` | J | K | L | M | N | O | P | Q | R |

Example `S9(4)V99` value `-10001.00` → stream `1000100` with last char `0`→`}` = `100010}`… (7 chars).
Decoding: if the last char isn't a recognized overpunch character, the value is assumed
positive and flagged **"Non-standard encoding, assumed positive"**.

## 8. Text stream: decoding values out (`displayFieldValue`, `decomposeStream`)

- X: trailing spaces trimmed.
- 9: non-digits stripped, leading zeros trimmed (`00042` → `42`).
- 9 + V: decimal point inserted at the V position, integer leading zeros trimmed (`00150` → `1.50`).
- S9: overpunch decoded (§7), same trimming.
- Warnings raised per field: stream shorter than the field needs; total stream length ≠
  record length (heuristic: triggered when a `FILLER PIC X` starts with a space); non-standard sign.

## 9. Delimiter Export (CSV) rules (`delimit.ts`)

- Columns = elementary fields with length > 0, **excluding** FILLER-without-VALUE and group rows
  (`isDataField`). Per-field checkboxes can exclude more.
- Header row = field names; one CSV row per record.
- RFC 4180 quoting: a value containing the delimiter, `"`, or newline is wrapped in quotes,
  inner quotes doubled — so delimiter characters inside data can never break columns.
- Delimiter is user-chosen (1–3 chars, default `,`); a warning lists records whose data contains it.

## 10. COMP-3 (packed decimal) — binary `.dat` records

`COMP-3` / `COMPUTATIONAL-3` on a PIC 9/S9 field marks packed decimal.

**In the text tabs (Generate/Decompose):** COMP-3 is deliberately treated as plain DISPLAY
text (per original spec) — no packing.

**In Delimiter Export (binary mode — validated against real mainframe data, see
`COMP3COPYBOOK.txt` / `DATA_DAT.dat` / `COMP3VIEWDATA.txt` in repo root):**

- Detection: copybook contains any COMP-3 field → the uploaded record file is treated as
  **binary** (one continuous byte stream, no line breaks).
- **Packed byte length** = `ceil((digits + 1) / 2)` — two digits per byte, last nibble = sign.
  `9(10)` → 6 bytes, `9(3)` → 2 bytes, `S9(13)V99` (15 digits) → 8 bytes.
- **Sign nibble**: `C` or `F` = positive, `D` or `B` = negative. Example bytes `00 00 15 0C`
  for `S9(...)V99` → `+…1.50`; `89 7C` → `+…8.97`.
- Non-COMP-3 fields in a binary record are **EBCDIC** (CP037): `F0–F9` → `0–9`,
  `C1…` → letters (`D4 C3` → `MC`), `40` → space.
- **Record length** = sum of packed/text byte lengths (digit-based length is wrong for binary).
- Output formatting: **raw fixed width** — full PIC digit count, zero-padded, `.` inserted at
  the V position, `-` prefix for negative. (`0030001141`, `013`, `0000000000001.50`.)
- Non-printable bytes in text fields render as `.` — same as ISPF hex view.
- Records that are entirely `0x00` (tail padding) are skipped with a warning; leftover bytes
  that don't fill a whole record also warn.

## 11. Known limits (deliberate)

- One level of REDEFINES nesting; `OCCURS` not supported; `HIGH/LOW-VALUES` not supported;
  `COMP`/`COMP-1`/`COMP-2` (binary/float) not supported — only COMP-3.
- EBCDIC codepage is CP037, assumed automatically for binary COMP-3 files (no toggle).
