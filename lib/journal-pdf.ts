export type JournalPdfStroke = { points: [number, number, number?][]; color: string; width: number; erase?: boolean; shape?: "rectangle" | "ellipse" | "line" };
export type JournalPdfTodo = { id: string; line: number; checked: boolean };
export type JournalPdfPage = { id: string; typed_text: string; strokes: JournalPdfStroke[]; todos: JournalPdfTodo[] };
export type JournalPdfEntry = { note_date: string; title: string; pages: JournalPdfPage[] };

const pdfText = (value: string) => String(value || "").normalize("NFKD").replace(/[^\x20-\x7e]/g, "?").replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
const number = (value: number) => Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "0";
const rgb = (hex: string) => {
  const clean = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "243f68";
  return [0, 2, 4].map(offset => Math.round(parseInt(clean.slice(offset, offset + 2), 16) / 255 * 1000) / 1000);
};

function inkPage(entry: JournalPdfEntry, page: JournalPdfPage, index: number): string {
  const commands = ["q", "1 1 1 rg", "0 0 595 842 re f", "Q", "BT", "/F1 16 Tf", "48 800 Td", `(${pdfText(entry.title || "Daily journal")}) Tj`, "0 -22 Td", "/F1 10 Tf", `(${pdfText(entry.note_date)}    Page ${index + 1} of ${entry.pages.length}) Tj`, "ET"];
  const x0 = 48, yTop = 755, lineStep = 27, width = 500, height = 680;
  for (let y = yTop; y > 44; y -= lineStep) commands.push("0.88 0.92 0.95 RG 0.55 w", `${x0} ${number(y)} m ${x0 + width} ${number(y)} l S`);
  commands.push("0.94 0.78 0.76 RG 0.7 w", `87 58 m 87 759 l S`);
  for (const stroke of page.strokes || []) {
    if (!stroke.points?.length) continue;
    const color = stroke.erase ? [1, 1, 1] : rgb(stroke.color);
    commands.push(`${color.map(number).join(" ")} RG ${number(Math.max(0.6, stroke.width * 0.65))} w 1 J 1 j`);
    const point = (value: [number, number, number?]): [number, number] => [x0 + Math.max(0, Math.min(1, value[0])) * width, yTop - Math.max(0, Math.min(1, value[1])) * height];
    const first = point(stroke.points[0]);
    if (stroke.shape && stroke.points.length >= 2) {
      const last = point(stroke.points.at(-1)!);
      const left = Math.min(first[0], last[0]), right = Math.max(first[0], last[0]);
      const bottom = Math.min(first[1], last[1]), top = Math.max(first[1], last[1]);
      if (stroke.shape === "line") commands.push(`${number(first[0])} ${number(first[1])} m ${number(last[0])} ${number(last[1])} l S`);
      else if (stroke.shape === "rectangle") commands.push(`${number(left)} ${number(bottom)} ${number(right - left)} ${number(top - bottom)} re S`);
      else {
        const cx = (left + right) / 2, cy = (bottom + top) / 2, rx = (right - left) / 2, ry = (top - bottom) / 2, k = 0.55228475;
        commands.push(`${number(cx + rx)} ${number(cy)} m ${number(cx + rx)} ${number(cy + k * ry)} ${number(cx + k * rx)} ${number(cy + ry)} ${number(cx)} ${number(cy + ry)} c ${number(cx - k * rx)} ${number(cy + ry)} ${number(cx - rx)} ${number(cy + k * ry)} ${number(cx - rx)} ${number(cy)} c ${number(cx - rx)} ${number(cy - k * ry)} ${number(cx - k * rx)} ${number(cy - ry)} ${number(cx)} ${number(cy - ry)} c ${number(cx + k * rx)} ${number(cy - ry)} ${number(cx + rx)} ${number(cy - k * ry)} ${number(cx + rx)} ${number(cy)} c S`);
      }
    }
    else if (stroke.points.length === 1) commands.push(`${number(first[0])} ${number(first[1])} m ${number(first[0] + 0.1)} ${number(first[1] + 0.1)} l S`);
    else {
      commands.push(`${number(first[0])} ${number(first[1])} m`);
      for (const value of stroke.points.slice(1)) { const next = point(value); commands.push(`${number(next[0])} ${number(next[1])} l`); }
      commands.push("S");
    }
  }
  // Redraw the notebook ruling after white erase strokes so the lines remain visible.
  for (let y = yTop; y > 44; y -= lineStep) commands.push("0.88 0.92 0.95 RG 0.55 w", `${x0} ${number(y)} m ${x0 + width} ${number(y)} l S`);
  commands.push("0.94 0.78 0.76 RG 0.7 w", `87 58 m 87 759 l S`);
  for (const todo of page.todos || []) {
    const y = yTop - (58 + todo.line * 40) * (height / 920) - 5;
    if (y < 45 || y > 760) continue;
    commands.push("0.1 0.35 0.28 RG 1 w", `55 ${number(y)} 10 10 re S`);
    if (todo.checked) commands.push(`57 ${number(y + 4)} m 59 ${number(y + 1)} l 64 ${number(y + 8)} l S`);
  }
  return commands.join("\n");
}

function typedPages(entry: JournalPdfEntry): string[] {
  const text = entry.pages.map(page => page.typed_text?.trim()).filter(Boolean).join("\n\n");
  if (!text) return [];
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let current = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > 88 && current) { lines.push(current); current = word; } else current = next;
    }
    lines.push(current);
  }
  const pages: string[] = [];
  while (lines.length) {
    const chunk = lines.splice(0, 48);
    const commands = ["BT", "/F1 16 Tf", "48 790 Td", `(${pdfText(entry.title || "Daily journal")}) Tj`, "0 -22 Td", "/F1 10 Tf", `(${pdfText(entry.note_date)}    Typed notes) Tj`, "0 -28 Td", "/F1 11 Tf", "14 TL"];
    chunk.forEach((line, index) => commands.push(`${index ? "T* " : ""}(${pdfText(line)}) Tj`));
    commands.push("ET"); pages.push(commands.join("\n"));
  }
  return pages;
}

export function buildJournalPdf(entry: JournalPdfEntry): Uint8Array {
  const contents = [...entry.pages.map((page, index) => inkPage(entry, page, index)), ...typedPages(entry)];
  const objects: string[] = ["", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  const pageIds: number[] = [];
  contents.forEach(content => {
    const pageId = objects.length + 1, streamId = pageId + 1;
    pageIds.push(pageId);
    const stream = `${content}\n`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);
    objects.push(`<< /Length ${new TextEncoder().encode(stream).length} >>\nstream\n${stream}endstream`);
  });
  objects[0] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let output = "%PDF-1.4\n%OfficeFlow Journal\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(new TextEncoder().encode(output).length); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xrefOffset = new TextEncoder().encode(output).length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) output += `${String(offset).padStart(10, "0")} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new TextEncoder().encode(output);
}

