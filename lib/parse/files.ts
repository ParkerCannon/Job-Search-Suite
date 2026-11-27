import mammoth from "mammoth";

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

export async function extractTextFromFile(file: File): Promise<string> {
  const ext = extensionOf(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  if (ext === "txt" || ext === "md" || ext === "json" || file.type?.startsWith("text/")) {
    return buffer.toString("utf8");
  }

  if (ext === "docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (ext === "pdf" || file.type === "application/pdf") {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true,
      isEvalSupported: false,
    });
    const doc = await task.promise;
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      // Ignore whitespace-only runs. Some PDFs emit a single space item whose
      // width spans the whole page, which hides the real gap between columns.
      const items = content.items.filter((item) => "str" in item && "transform" in item && item.str.trim().length > 0) as {
        str: string;
        transform: number[];
        width?: number;
      }[];

      // PDF text is a stream of positioned fragments. Group them by their Y
      // coordinate first, otherwise every line collapses into one paragraph.
      const positionedLines: { y: number; fragments: { x: number; str: string; width?: number }[] }[] = [];
      for (const item of items) {
        const x = item.transform[4] ?? 0;
        const y = item.transform[5] ?? 0;
        let line = positionedLines.find((candidate) => Math.abs(candidate.y - y) < 2);
        if (!line) {
          line = { y, fragments: [] };
          positionedLines.push(line);
        }
        line.fragments.push({ x, str: item.str, width: item.width });
      }

      const text = positionedLines
        .sort((a, b) => b.y - a.y)
        .map((line) => {
          const fragments = line.fragments.sort((a, b) => a.x - b.x);
          let lineText = "";
          for (let j = 0; j < fragments.length; j++) {
            const fragment = fragments[j];
            if (j > 0) {
              const previous = fragments[j - 1];
              const gap = fragment.x - (previous.x + (previous.width ?? 0));
              // Large horizontal gaps are separate resume columns (e.g.
              // "Company        City, ST"). Keep them as a pipe so the
              // structured parser can split them reliably.
              if (gap > 30) lineText += " | ";
              else if (gap > 1.5) lineText += " ";
            }
            lineText += fragment.str;
          }
          return lineText.replace(/\s{2,}/g, " ").trim();
        })
        .filter(Boolean)
        .join("\n");
      if (text) pages.push(text);
    }
    await doc.destroy();
    return pages.join("\n");
  }

  throw new Error(`Unsupported file type ".${ext || "?"}". Upload a PDF, DOCX, TXT, or JSON file.`);
}
