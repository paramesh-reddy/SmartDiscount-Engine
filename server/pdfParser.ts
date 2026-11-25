import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { z } from 'zod';

export const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB

export const PdfCartRowSchema = z.object({
  row_number: z.number().int().positive(),
  product_name: z.string().trim().min(1, 'Product name is required').max(180),
  brand: z.string().trim().min(1, 'Brand is required').max(120),
  platform: z.string().trim().min(1, 'Platform is required').max(120),
  base_price: z.number().positive('Base price must be greater than 0'),
});

export type ValidatedPdfRow = z.infer<typeof PdfCartRowSchema>;

export interface MalformedPdfRow {
  row_number: number;
  raw_text: string;
  errors: string[];
  partial: {
    product_name: string;
    brand: string;
    platform: string;
    base_price: string;
  };
}

export interface PdfExtractionResult {
  filename: string;
  total_pages: number;
  valid_rows: ValidatedPdfRow[];
  malformed_rows: MalformedPdfRow[];
  warnings: string[];
}

export function validatePdfBuffer(buffer: Buffer, mimeType?: string): void {
  if (!buffer || buffer.length === 0) {
    throw new Error('Uploaded PDF file is empty.');
  }
  if (buffer.length > MAX_PDF_BYTES) {
    throw new Error(`PDF exceeds the ${MAX_PDF_BYTES / (1024 * 1024)} MB maximum file size.`);
  }
  if (mimeType && mimeType !== 'application/pdf' && mimeType !== 'application/x-pdf' && mimeType !== 'application/octet-stream') {
    throw new Error(`Invalid MIME type "${mimeType}". Expected application/pdf.`);
  }
  const signature = buffer.subarray(0, 5).toString('ascii');
  if (signature !== '%PDF-') {
    throw new Error('Invalid file signature. File does not start with %PDF- header.');
  }
}

interface TextToken {
  str: string;
  x: number;
  y: number;
}

function parsePriceString(raw: string): number | null {
  const cleaned = raw
    .replace(/rs\.?/gi, '')
    .replace(/inr/gi, '')
    .replace(/₹/g, '')
    .replace(/,/g, '')
    .trim();
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function isHeaderRow(cells: string[]): boolean {
  const joined = cells.join(' ').toLowerCase();
  return (
    joined.includes('product') &&
    joined.includes('brand') &&
    joined.includes('platform') &&
    (joined.includes('price') || joined.includes('base_price'))
  );
}

function groupTokensIntoLines(tokens: TextToken[]): string[][] {
  if (tokens.length === 0) return [];
  // Sort top-to-bottom (descending Y in PDF coords), then left-to-right (ascending X)
  const sorted = [...tokens].sort((a, b) => {
    if (Math.abs(b.y - a.y) > 4) return b.y - a.y;
    return a.x - b.x;
  });

  const lines: TextToken[][] = [];
  for (const token of sorted) {
    const lastLine = lines[lines.length - 1];
    if (!lastLine || Math.abs(lastLine[0].y - token.y) > 4) {
      lines.push([token]);
    } else {
      lastLine.push(token);
    }
  }

  return lines.map((line) => {
    line.sort((a, b) => a.x - b.x);
    // Merge adjacent tokens that belong to the same column cell (gap < 14pt)
    const cells: string[] = [];
    let currentCell = '';
    let prevRight = -Infinity;

    for (const tok of line) {
      const text = tok.str.trim();
      if (!text) continue;
      if (text === '|') {
        if (currentCell.trim()) cells.push(currentCell.trim());
        currentCell = '';
        prevRight = tok.x + 8;
        continue;
      }
      if (currentCell && tok.x - prevRight > 14) {
        cells.push(currentCell.trim());
        currentCell = text;
      } else {
        currentCell = currentCell ? `${currentCell} ${text}` : text;
      }
      prevRight = tok.x + text.length * 4.8;
    }
    if (currentCell.trim()) {
      cells.push(currentCell.trim());
    }
    return cells;
  });
}

function splitDelimitedLine(lineText: string): string[] {
  if (lineText.includes('|')) {
    return lineText.split('|').map((c) => c.trim()).filter(Boolean);
  }
  if (lineText.includes(',')) {
    return lineText.split(',').map((c) => c.trim());
  }
  if (lineText.includes('\t')) {
    return lineText.split('\t').map((c) => c.trim());
  }
  return lineText.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
}

export async function extractCartFromPdf(buffer: Buffer, filename: string, mimeType?: string): Promise<PdfExtractionResult> {
  validatePdfBuffer(buffer, mimeType);

  const uint8 = new Uint8Array(buffer);
  const loadingTask = pdfjsLib.getDocument({ data: uint8, useSystemFonts: true });
  const pdfDoc = await loadingTask.promise;

  const valid_rows: ValidatedPdfRow[] = [];
  const malformed_rows: MalformedPdfRow[] = [];
  const warnings: string[] = [];

  let logicalRowIndex = 0;

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const tokens: TextToken[] = [];

    for (const item of textContent.items) {
      if ('str' in item && item.str.trim().length > 0) {
        const transform = item.transform as number[];
        tokens.push({
          str: item.str,
          x: transform[4] ?? 0,
          y: transform[5] ?? 0,
        });
      }
    }

    const lines = groupTokensIntoLines(tokens);

    for (const rawCells of lines) {
      // If a line came out as a single pipe/comma string, split it
      const cells = rawCells.length === 1 ? splitDelimitedLine(rawCells[0]) : rawCells;
      const rawLine = cells.join(' | ');

      if (cells.length === 0) continue;
      if (isHeaderRow(cells)) continue;
      // Skip non-table document title lines like "Shopping Cart Export" when fewer than 2 cells and no digits
      if (cells.length === 1 && !/\d/.test(cells[0])) continue;

      logicalRowIndex += 1;

      // Support optional leading item_id column (5 columns: ITEM-01 | Product | Brand | Platform | Price)
      let normalizedCells = cells;
      if (cells.length >= 5 && /^item[-_\s]?\d+/i.test(cells[0])) {
        normalizedCells = cells.slice(1);
      }

      if (normalizedCells.length < 4) {
        malformed_rows.push({
          row_number: logicalRowIndex,
          raw_text: rawLine,
          errors: [`Expected 4 columns (Product, Brand, Platform, Base Price), found ${normalizedCells.length}.`],
          partial: {
            product_name: normalizedCells[0] ?? '',
            brand: normalizedCells[1] ?? '',
            platform: normalizedCells[2] ?? '',
            base_price: normalizedCells[3] ?? '',
          },
        });
        continue;
      }

      const [productRaw, brandRaw, platformRaw, priceRaw] = normalizedCells;
      const parsedPrice = parsePriceString(priceRaw);
      const rowErrors: string[] = [];

      if (!productRaw.trim()) rowErrors.push('Product name is missing.');
      if (!brandRaw.trim()) rowErrors.push('Brand is missing.');
      if (!platformRaw.trim()) rowErrors.push('Platform is missing.');
      if (parsedPrice === null) {
        rowErrors.push(`Invalid base price "${priceRaw}".`);
      } else if (parsedPrice <= 0) {
        rowErrors.push(`Base price must be positive, got ${parsedPrice}.`);
      }

      if (rowErrors.length > 0 || parsedPrice === null) {
        malformed_rows.push({
          row_number: logicalRowIndex,
          raw_text: rawLine,
          errors: rowErrors,
          partial: {
            product_name: productRaw.trim(),
            brand: brandRaw.trim(),
            platform: platformRaw.trim(),
            base_price: priceRaw.trim(),
          },
        });
        continue;
      }

      const validated = PdfCartRowSchema.safeParse({
        row_number: logicalRowIndex,
        product_name: productRaw,
        brand: brandRaw,
        platform: platformRaw,
        base_price: Math.round(parsedPrice),
      });

      if (!validated.success) {
        malformed_rows.push({
          row_number: logicalRowIndex,
          raw_text: rawLine,
          errors: validated.error.issues.map((iss) => iss.message),
          partial: {
            product_name: productRaw.trim(),
            brand: brandRaw.trim(),
            platform: platformRaw.trim(),
            base_price: priceRaw.trim(),
          },
        });
      } else {
        valid_rows.push(validated.data);
      }
    }
  }

  if (valid_rows.length === 0 && malformed_rows.length === 0) {
    warnings.push('No tabular product rows were detected in the uploaded PDF.');
  }

  return {
    filename,
    total_pages: pdfDoc.numPages,
    valid_rows,
    malformed_rows,
    warnings,
  };
}
