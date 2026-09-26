declare module "pdf-parse/lib/pdf-parse.js" {
  type PDFParseResult = { text: string; numpages: number; info: Record<string, unknown>; metadata: unknown; version: string };
  export default function pdf(data: Buffer): Promise<PDFParseResult>;
}

declare module "pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js" {
  type PDFAnnotation = { url?: string };
  type PDFPage = { getAnnotations(): Promise<PDFAnnotation[]> };
  type PDFDocument = { numPages: number; getPage(page: number): Promise<PDFPage>; destroy(): void };
  const PDFJS: { disableWorker: boolean; getDocument(data: Buffer): Promise<PDFDocument> };
  export default PDFJS;
}
