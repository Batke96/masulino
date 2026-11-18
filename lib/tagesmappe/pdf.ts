import type { FolderPage, Tagesmappe } from "./folder";

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;
const INK: Rgb = [0.14, 0.15, 0.2];
const MUTED: Rgb = [0.44, 0.47, 0.55];
const RULE = 0.9;

type Rgb = [number, number, number];
type FontName = "F1" | "F2";

const writeIns = [
  { label: "Anpassungen", lines: 4 },
  { label: "Coupon-Ausgabe", lines: 3 },
  { label: "Abrechnung", lines: 4 },
] as const;

export function renderTagesmappePdf(folder: Tagesmappe, generatedLabel: string): Uint8Array {
  const streams = folder.pages.map((page) => drawPage(folder, page, generatedLabel));
  return assemblePdf(streams);
}

function drawPage(folder: Tagesmappe, page: FolderPage, generatedLabel: string): string {
  const commands: string[] = [];
  const right = PAGE_WIDTH - MARGIN;
  const mark = folder.source === "example" ? "Tagesmappe · Beispiel" : "Tagesmappe";
  let top = 56;

  commands.push(text(MARGIN, top, mark, 16, "F2", INK));
  commands.push(textRight(right, top + 3, folder.dateLabel, 11, "F1", MUTED));
  top += 28;
  commands.push(rule(MARGIN, top, right));
  top += 22;
  commands.push(text(MARGIN, top, page.title, 13, "F2", INK));

  if (page.kind === "party") {
    commands.push(textRight(right, top + 1, page.reference, 12, "F2", MUTED));
    top += 28;
    for (const line of [page.when, page.party, page.coupons].filter((line): line is string => Boolean(line))) {
      commands.push(text(MARGIN, top, line, 11, "F1", INK));
      top += 18;
    }
    top += 6;
    for (const line of wrap(page.note, 11, false, right - MARGIN)) {
      commands.push(text(MARGIN, top, line, 11, "F1", MUTED));
      top += 16;
    }
    top += 18;
    commands.push(text(MARGIN, top, "Zum Eintragen", 12, "F2", INK));
    top += 20;
    for (const field of writeIns) {
      commands.push(text(MARGIN, top, field.label, 11, "F2", INK));
      top += 16;
      for (let line = 0; line < field.lines; line += 1) {
        commands.push(rule(MARGIN, top, right));
        top += 22;
      }
      top += 6;
    }
  } else if (page.emptyLabel) {
    top += 28;
    commands.push(text(MARGIN, top, page.emptyLabel, 11, "F1", MUTED));
  } else {
    top += 24;
    for (const row of page.rows) {
      commands.push(text(MARGIN, top, row.time, 11, "F1", MUTED));
      const nameWidth = right - MARGIN - 168;
      const nameLines = wrap(row.name, 11, true, nameWidth);
      nameLines.forEach((line, index) => {
        commands.push(text(MARGIN + 64, top + index * 15, line, 11, "F2", INK));
      });
      commands.push(textRight(right, top, row.counts, 11, "F1", INK));
      top += Math.max(22, nameLines.length * 15 + 6);
    }
  }

  commands.push(rule(MARGIN, PAGE_HEIGHT - 64, right));
  const footer = `Seite ${pageNumber(page)} von ${folder.pages.length}`;
  commands.push(text(MARGIN, PAGE_HEIGHT - 46, footer, 9, "F1", MUTED));
  commands.push(textRight(right, PAGE_HEIGHT - 46, `Stand ${generatedLabel}`, 9, "F1", MUTED));
  return commands.join("\n");
}

function pageNumber(page: FolderPage): number {
  const match = /^Seite (\d+)/.exec(page.title);
  return match ? Number(match[1]) : 1;
}

function text(x: number, top: number, value: string, size: number, font: FontName, color: Rgb): string {
  return placed(x, baseline(top, size), value, size, font, color);
}

function textRight(right: number, top: number, value: string, size: number, font: FontName, color: Rgb): string {
  const x = right - measure(value, size, font === "F2");
  return placed(x, baseline(top, size), value, size, font, color);
}

function placed(x: number, y: number, value: string, size: number, font: FontName, color: Rgb): string {
  const [red, green, blue] = color;
  return `${num(red)} ${num(green)} ${num(blue)} rg\nBT\n/${font} ${size} Tf\n1 0 0 1 ${num(x)} ${num(y)} Tm\n(${winAnsi(value)}) Tj\nET`;
}

function rule(x1: number, top: number, x2: number): string {
  const y = PAGE_HEIGHT - top;
  return `${RULE} ${RULE} ${RULE} RG\n0.6 w\n${num(x1)} ${num(y)} m ${num(x2)} ${num(y)} l S`;
}

function baseline(top: number, size: number): number {
  return PAGE_HEIGHT - top - size;
}

function wrap(value: string, size: number, bold: boolean, maxWidth: number): string[] {
  const words = value.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = words[0] ?? "";
  for (const word of words.slice(1)) {
    const next = `${current} ${word}`;
    if (measure(next, size, bold) <= maxWidth) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  lines.push(current);
  return lines;
}

function measure(value: string, size: number, bold: boolean): number {
  let units = 0;
  for (const char of value) units += widthOf(char);
  return (units / 1000) * size * (bold ? 1.06 : 1);
}

function widthOf(char: string): number {
  const known = HELVETICA[char];
  if (known) return known;
  const base = char.normalize("NFD")[0] ?? char;
  return HELVETICA[base] ?? 500;
}

function winAnsi(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 63;
    if (char === "\\") out += "\\\\";
    else if (char === "(") out += "\\(";
    else if (char === ")") out += "\\)";
    else if (code >= 32 && code <= 126) out += char;
    else if (code >= 160 && code <= 255) out += octal(code);
    else if (WIN_EXTRA[code] !== undefined) out += octal(WIN_EXTRA[code]);
    else out += "?";
  }
  return out;
}

function octal(code: number): string {
  return `\\${code.toString(8).padStart(3, "0")}`;
}

function num(value: number): string {
  return value.toFixed(2);
}

function assemblePdf(streams: string[]): Uint8Array {
  const objects = new Map<number, string>();
  objects.set(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  objects.set(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const pageIds: number[] = [];
  let nextId = 5;
  for (const stream of streams) {
    const contentId = nextId;
    const pageId = nextId + 1;
    nextId += 2;
    pageIds.push(pageId);
    objects.set(contentId, `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    objects.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_WIDTH)} ${num(PAGE_HEIGHT)}] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>`,
    );
  }
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(2, `<< /Type /Pages /Count ${streams.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);

  const maxId = nextId - 1;
  const header = "%PDF-1.4\n";
  const parts = [header];
  const offsets = [0];
  let offset = header.length;
  for (let id = 1; id <= maxId; id += 1) {
    const body = objects.get(id);
    if (!body) throw new Error(`PDF object ${id} is missing`);
    offsets[id] = offset;
    const chunk = `${id} 0 obj\n${body}\nendobj\n`;
    parts.push(chunk);
    offset += chunk.length;
  }
  let xref = `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${maxId + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`;
  parts.push(xref);
  const pdf = parts.join("");
  return Uint8Array.from(pdf, (char) => char.charCodeAt(0));
}

const WIN_EXTRA: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
};

const HELVETICA: Record<string, number> = {
  " ": 278,
  ".": 278,
  ",": 278,
  ":": 278,
  ";": 278,
  "-": 333,
  "–": 556,
  "/": 278,
  "(": 333,
  ")": 333,
  "·": 278,
  i: 222,
  l: 222,
  j: 222,
  f: 278,
  t: 278,
  r: 333,
  I: 278,
  J: 500,
  s: 500,
  c: 500,
  z: 500,
  a: 556,
  b: 556,
  d: 556,
  e: 556,
  g: 556,
  h: 556,
  n: 556,
  o: 556,
  p: 556,
  q: 556,
  u: 556,
  "0": 556,
  "1": 556,
  "2": 556,
  "3": 556,
  "4": 556,
  "5": 556,
  "6": 556,
  "7": 556,
  "8": 556,
  "9": 556,
  m: 833,
  w: 722,
  M: 833,
  W: 944,
};
