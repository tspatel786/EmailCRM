import * as XLSX from "xlsx";

function autoFitColumns(rows: Record<string, unknown>[]): XLSX.ColInfo[] {
  if (!rows || rows.length === 0 || !rows[0]) return [];
  const keys = Object.keys(rows[0]);
  return keys.map((key) => {
    let maxLen = key.length;
    for (const row of rows) {
      const val = row[key];
      if (val !== null && val !== undefined) {
        const str = String(val);
        if (str.length > maxLen) {
          maxLen = Math.min(str.length, 60);
        }
      }
    }
    return { wch: Math.max(maxLen + 3, 12) };
  });
}

export function downloadWorkbook(filename: string, rows: Record<string, unknown>[], sheet = "Export") {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws["!cols"] = autoFitColumns(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheet);
  XLSX.writeFile(wb, filename);
}

export function downloadMultiSheetWorkbook(
  filename: string,
  sheets: Array<{ name: string; rows: Record<string, unknown>[] }>
) {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ Info: "No data available" }]);
    ws["!cols"] = autoFitColumns(s.rows);
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31)); // Excel limit is 31 chars for sheet name
  }
  XLSX.writeFile(wb, filename);
}

export function parseWorkbook(file: ArrayBuffer): { headers: string[]; rows: Record<string, unknown>[] } {
  const wb = XLSX.read(file, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
  if (!sheet) return { headers: [], rows: [] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const headers = rows[0] ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

export function parseCsv(text: string): { headers: string[]; rows: Record<string, unknown>[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  if (!lines[0]) return { headers: [], rows: [] };
  const headers = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cols = splitCsvLine(line);
    const row: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}
