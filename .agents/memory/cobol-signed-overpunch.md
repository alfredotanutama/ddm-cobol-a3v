---
name: COBOL signed numeric (PIC S9) overpunch encoding
description: How PIC S9(n)/S9(n)V9(m) fields encode sign via overpunch, and edge cases to preserve when touching cobol.ts
---

PIC S9(n)V9(m) fields store the sign by overpunching it onto the LAST character of the whole field (not the last digit of the integer part). Full digit/sign table: 0-9 positive = `{ABCDEFGHI`, 0-9 negative = `}JKLMNOPQR`. `{`/`}` (digit 0) are the most common in real BCA data and must decode cleanly, not error.

**Why:** A prior spec explicitly required treating `{`/`}` as valid zero-overpunch rather than "unknown" — a naive implementation that only checks digits 0-9 will misparse the most common case (zero-value signed fields).

**How to apply:** When decoding, if the last char isn't in the overpunch table, fall back to treating it as a plain digit (assume positive) and surface a "Non-standard encoding, assumed positive" warning rather than throwing/erroring. Also warn (not error) on FILLER/PIC X stream-length mismatches, and error only when the stream is too short to cover a field's full length. See `artifacts/cobol-stream-tool/src/lib/cobol.ts` (`decodeSignedNumeric`/`encodeSignedNumeric`) for the reference implementation.
