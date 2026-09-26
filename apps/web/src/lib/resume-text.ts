import mammoth from "mammoth";
import pdf from "pdf-parse/lib/pdf-parse.js";
import PDFJS from "pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js";

export type ExtractedResumeDocument = { text: string; embeddedLinks: string[] };

const unique = <T>(values: T[]) => [...new Set(values)];

async function extractPdfAnnotationLinks(buffer: Buffer): Promise<string[]> {
  try {
    PDFJS.disableWorker = true;
    const document = await PDFJS.getDocument(buffer);
    const links: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const annotations = await page.getAnnotations();
      for (const annotation of annotations) if (annotation.url) links.push(annotation.url);
    }
    document.destroy();
    return unique(links);
  } catch {
    return [];
  }
}

export async function extractResumeDocument(file: File): Promise<ExtractedResumeDocument> {
  const buffer = Buffer.from(await file.arrayBuffer());
  if (file.type === "application/pdf") {
    const [result, embeddedLinks] = await Promise.all([pdf(buffer), extractPdfAnnotationLinks(buffer)]);
    return { text: normalizeExtractedText(result.text), embeddedLinks };
  }
  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const [result, html] = await Promise.all([mammoth.extractRawText({ buffer }), mammoth.convertToHtml({ buffer })]);
    const embeddedLinks = unique([...html.value.matchAll(/href=["']([^"']+)["']/gi)].map((match) => match[1]).filter((value): value is string => Boolean(value)));
    return { text: normalizeExtractedText(result.value), embeddedLinks };
  }
  throw new Error("Unsupported resume type");
}

export async function extractResumeText(file: File): Promise<string> {
  return (await extractResumeDocument(file)).text;
}

export async function hasValidResumeSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (file.type === "application/pdf") return bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
  if (file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return bytes[0] === 0x50 && bytes[1] === 0x4b;
  return false;
}

function normalizeExtractedText(value: string): string {
  return value.replace(/\0/g, "").replace(/\r\n/g, "\n").replace(/[ \t]+\n/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
}
