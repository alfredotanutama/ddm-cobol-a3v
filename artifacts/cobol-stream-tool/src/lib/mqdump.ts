// IBM MQ queue-dump (amqsbcg-style) parsing: split messages, extract CCSID +
// hex body, decode to text. Pure functions only — no React, no side effects.

import { ebcdicToAscii } from "./comp3.ts";

export interface MqMessage {
  index: number; // 1-based position among the KEPT messages
  ccsid: number | null;
  bytes: Uint8Array;
  decoded: string;
  warning: string | null;
}

export interface MqDumpResult {
  messages: MqMessage[];
  /** message blocks skipped because they lack ReplyToQ or a Message Body section */
  skipped: number;
}

// EBCDIC code pages we decode via the CP037 printable table (close enough for
// the invariant charset shared by 037/500/1140/1047; unmapped bytes render ".").
const EBCDIC_CCSIDS = new Set([37, 500, 1047, 1140, 1141, 1142, 1143, 1144, 1145, 1146, 1147, 1148]);
// ASCII/latin-ish code pages a latin1 TextDecoder handles.
const LATIN_CCSIDS = new Set([819, 850, 1252]);

// Hex groups end at whitespace OR end-of-line (last group on a line has no trailing space).
const HEX_LINE_RE = /^[ \-0-9A-Fa-f]{8,10}:\s+((?:[0-9A-Fa-f]{2,4}(?:\s+|$))+)/;

function decodeBody(bytes: Uint8Array, ccsid: number | null): { decoded: string; warning: string | null } {
  const trim = (s: string) => s.replace(/\x00+$/g, "").trim();

  if (ccsid === 1208) {
    return { decoded: trim(new TextDecoder("utf-8", { fatal: false }).decode(bytes)), warning: null };
  }
  if (ccsid !== null && EBCDIC_CCSIDS.has(ccsid)) {
    let out = "";
    for (const b of bytes) out += ebcdicToAscii(b);
    return { decoded: trim(out), warning: null };
  }
  if (ccsid === null || LATIN_CCSIDS.has(ccsid)) {
    return {
      decoded: trim(new TextDecoder("latin1").decode(bytes)),
      warning: ccsid === null ? "No CCSID found — decoded as latin1" : null,
    };
  }

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return { decoded: `[RAW HEX] ${hex}`, warning: `Unsupported CCSID ${ccsid} — raw hex shown` };
}

/** Parses a full MQ dump into decoded message bodies. */
export function parseMqDump(dump: string): MqDumpResult {
  const blocks = dump.split(/={4,}\s*MESSAGE\s*#\d+\s*={4,}/i);
  const messages: MqMessage[] = [];
  let skipped = 0;

  for (const block of blocks) {
    if (!block.trim()) continue;
    if (!block.includes("ReplyToQ") || !block.includes("**** Message Body")) {
      skipped++;
      continue;
    }

    const ccsidMatch = block.match(/CCSID\s+:\s+(\d+)/);
    const ccsid = ccsidMatch ? parseInt(ccsidMatch[1], 10) : null;

    let inBody = false;
    let hex = "";
    for (const line of block.split(/\r?\n/)) {
      if (line.includes("**** Message Body")) {
        inBody = true;
        continue;
      }
      if (!inBody) continue;
      const m = HEX_LINE_RE.exec(line);
      if (m) hex += m[1].replace(/\s+/g, "");
    }

    if (!hex) {
      skipped++;
      continue;
    }

    const bytes = new Uint8Array(hex.length >> 1);
    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);

    const { decoded, warning } = decodeBody(bytes, ccsid);
    messages.push({ index: messages.length + 1, ccsid, bytes, decoded, warning });
  }

  return { messages, skipped };
}
