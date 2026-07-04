import { readFileSync } from "node:fs";
import { join } from "node:path";
import { seedDir } from "./paths";

export type CsvRow = Record<string, string>;

export function readCsv(name: string): Array<[number, CsvRow]> {
  const text = readFileSync(join(seedDir, name), "utf8");
  const rows = parseCsv(text);
  const [headers, ...body] = rows;
  return body
    .filter((row) => row.some((cell) => cell.trim().length > 0))
    .map((row, index) => [
      index + 2,
      Object.fromEntries(headers.map((header, cellIndex) => [header, row[cellIndex] ?? ""]))
    ]);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i += 1;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
      continue;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
