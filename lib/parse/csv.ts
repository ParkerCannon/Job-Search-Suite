import Papa from "papaparse";

const HEADER_HINTS = new Set(
  `Name|First Name|Last Name|Full Name|Company|Company Name|Organization|Title|Job Title|Position|School Name|Degree Name|Degree|Date|Started On|Finished On|Start Date|End Date|URL|Email Address|Connected On|Search Query|Time|Followed On|Status|Skill Name|Content Title|Question|Answer|Type|Text|Description|Location|Headline|Summary|Industry|Websites|Proficiency|Message|From|To|Sent At|Direction|Link|ShareLink|OptionText|Creation Date|License Number|Authority|Notes`.split(
    "|",
  ).map((item) => item.trim().toLowerCase()),
);

export type ParsedCsv = {
  columns: string[];
  rows: Array<Record<string, string>>;
  warnings: string[];
};

function cleanCell(value: unknown): string {
  return typeof value === "string" ? value.replace(/^\uFEFF/, "").trim() : value == null ? "" : String(value).trim();
}

function headerScore(row: string[]): number {
  const cells = row.map(cleanCell).filter(Boolean);
  if (!cells.length) return -100;
  let known = 0;
  let longest = 0;
  for (const cell of cells) {
    if (HEADER_HINTS.has(cell.toLowerCase()) || /^(content|alert|invitee|inviter)/i.test(cell)) known += 1;
    if (cell.length > longest) longest = cell.length;
  }
  if (longest > 180 && known < 2) return -100;
  return known * 20 + Math.min(cells.length, 30) * 2 - longest / 40;
}

function uniqueColumns(raw: string[]): string[] {
  const counts = new Map<string, number>();
  return raw.map((value, index) => {
    const base = cleanCell(value) || `Column ${index + 1}`;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    return count > 0 ? `${base} (${count + 1})` : base;
  });
}

export function parseCsv(text: string): ParsedCsv {
  const warnings: string[] = [];
  if (!text.trim()) return { columns: [], rows: [], warnings: ["File was empty."] };

  const result = Papa.parse<string[]>(text.replace(/^\uFEFF/, ""), {
    skipEmptyLines: "greedy",
    delimiter: "",
    transform: cleanCell,
  });

  if (result.errors.length) {
    const unique = [...new Set(result.errors.map((error) => error.message))];
    warnings.push(`CSV parser warnings: ${unique.slice(0, 3).join("; ")}`);
  }

  const matrix = (result.data ?? []).filter((row) => Array.isArray(row)) as string[][];
  if (!matrix.length) return { columns: [], rows: [], warnings: [...warnings, "No rows were found."] };

  const searchDepth = Math.min(12, matrix.length);
  let headerIndex = 0;
  let bestScore = -Infinity;
  for (let i = 0; i < searchDepth; i += 1) {
    const score = headerScore(matrix[i]);
    if (score > bestScore) {
      bestScore = score;
      headerIndex = i;
    }
  }
  if (headerIndex > 0) warnings.push(`Skipped ${headerIndex} preamble line${headerIndex === 1 ? "" : "s"} before the header.`);

  const columns = uniqueColumns(matrix[headerIndex]);
  const rows = matrix
    .slice(headerIndex + 1)
    .filter((row) => row.some((cell) => cleanCell(cell)))
    .map((row) => {
      const record: Record<string, string> = {};
      columns.forEach((column, index) => {
        record[column] = cleanCell(row[index]);
      });
      return record;
    });

  if (!rows.length) warnings.push("Header found but no data rows were present.");
  return { columns, rows, warnings };
}
