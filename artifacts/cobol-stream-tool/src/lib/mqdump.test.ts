// Run: node --experimental-strip-types src/lib/mqdump.test.ts
// Synthetic dump only — no real message data.
import { parseMqDump } from "./mqdump.ts";
import assert from "node:assert";

// "TESTA" in EBCDIC: E3 C5 E2 E3 C1, padded with EBCDIC spaces (40).
const DUMP = `
==== MESSAGE #1 ====
  ReplyToQ         : TEST.REPLY.QUEUE
  CCSID            : 500
 **** Message Body ****
00000000:  E3C5 E2E3 C140 4040
==== MESSAGE #2 ====
  ReplyToQ         : TEST.REPLY.QUEUE
  CCSID            : 1208
 **** Message Body ****
00000000:  4845 4C4C 4F20 574F 524C 44
==== MESSAGE #3 ====
  CCSID            : 500
  (no body section, no ReplyToQ -- must be skipped)
==== MESSAGE #4 ====
  ReplyToQ         : TEST.REPLY.QUEUE
  CCSID            : 12345
 **** Message Body ****
00000000:  0102
`;

const { messages, skipped } = parseMqDump(DUMP);

assert.strictEqual(messages.length, 3);
assert.strictEqual(skipped, 1);

assert.strictEqual(messages[0].ccsid, 500);
assert.strictEqual(messages[0].decoded, "TESTA");

assert.strictEqual(messages[1].ccsid, 1208);
assert.strictEqual(messages[1].decoded, "HELLO WORLD");

assert.strictEqual(messages[2].decoded, "[RAW HEX] 0102");
assert.match(messages[2].warning ?? "", /Unsupported CCSID 12345/);

console.log("mqdump.test.ts: all assertions passed");
