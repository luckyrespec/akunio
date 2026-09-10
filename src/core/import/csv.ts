export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

function splitLines(src: string): string[] {
  const lines: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"') {
      if (inQ && src[i + 1] === '"') {
        cur += '""';
        i++;
      } else {
        inQ = !inQ;
        cur += ch;
      }
    } else if (ch === "\n" && !inQ) {
      lines.push(cur);
      cur = "";
    } else if (ch === "\r") {
      continue;
    } else {
      cur += ch;
    }
  }
  if (cur.length > 0) lines.push(cur);
  return lines;
}

function splitLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((f) => f.trim());
}

/** Parser CSV murni (tanpa dep): deteksi `;`/`,`, quote-aware, BOM/CRLF aman. */
export function parseCsv(text: string): ParsedCsv {
  const lines = splitLines(text.replace(/^﻿/, "")).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const semi = (lines[0].match(/;/g) ?? []).length;
  const comma = (lines[0].match(/,/g) ?? []).length;
  const delim = semi > 0 && semi >= comma ? ";" : ",";
  return {
    headers: splitLine(lines[0], delim).map((h) => h.toLowerCase()),
    rows: lines.slice(1).map((l) => splitLine(l, delim)),
  };
}
