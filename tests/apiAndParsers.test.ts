import { describe, expect, it } from 'vitest';
import { normalizeAndValidateModelOutput } from '../server/aiRuleParser';
import { extractCartFromPdf, validatePdfBuffer } from '../server/pdfParser';
import { parseCartCSV, SAMPLE_CART_CSV } from '../frontend/src/utils/csvParser';

function createTestPdfBuffer(lines: string[]): Buffer {
  const streamParts = ['BT', '/F1 10 Tf'];
  let y = 740;
  for (const line of lines) {
    const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    streamParts.push(`50 ${y} Td (${escaped}) Tj`);
    y -= 18;
    streamParts.push('ET BT /F1 10 Tf');
  }
  streamParts.push('ET');
  const stream = streamParts.join('\n');

  const objs = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const o of objs) {
    offsets.push(pdf.length);
    pdf += o;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf-8');
}

describe('AI Validation, PDF Extraction & CSV Parsing', () => {
  it('rejects invalid AI rule values (percentage > 100, cart without min_cart_value)', () => {
    const over100 = normalizeAndValidateModelOutput({
      scope: 'brand',
      applies_to: 'Natura Casa',
      discount_type: 'percentage',
      value: 150,
      stackable: false,
      min_cart_value: null,
      is_valid: true,
      clarification_message: null,
    });
    expect(over100.is_valid).toBe(false);
    expect(over100.clarification_message).toBeTruthy();

    const cartMissingMin = normalizeAndValidateModelOutput({
      scope: 'cart',
      applies_to: null,
      discount_type: 'percentage',
      value: 10,
      stackable: false,
      min_cart_value: null,
      is_valid: true,
      clarification_message: null,
    });
    expect(cartMissingMin.is_valid).toBe(false);
  });

  it('preserves ambiguous AI input clarification response', () => {
    const ambiguous = normalizeAndValidateModelOutput({
      scope: null,
      applies_to: null,
      discount_type: null,
      value: null,
      stackable: false,
      min_cart_value: null,
      is_valid: false,
      clarification_message: 'Please specify the discount percentage or amount and the minimum cart value.',
    });
    expect(ambiguous.is_valid).toBe(false);
    expect(ambiguous.clarification_message).toContain('minimum cart value');
  });

  it('rejects non-PDF files by signature and MIME type', () => {
    expect(() => validatePdfBuffer(Buffer.from('not a pdf'), 'application/pdf')).toThrow('%PDF-');
    expect(() => validatePdfBuffer(Buffer.from('%PDF-1.4'), 'text/plain')).toThrow('Invalid MIME');
  });

  it('extracts valid rows and surfaces malformed rows from PDF', async () => {
    const buf = createTestPdfBuffer([
      'Product | Brand | Platform | Base Price',
      'Cushion Cover | Natura Casa | Amazon India | 1299',
      'Broken Row | Missing Columns | -50',
      'Desk Organiser | Nordic Basics | Flipkart | 899',
    ]);

    const res = await extractCartFromPdf(buf, 'cart.pdf', 'application/pdf');
    expect(res.valid_rows).toHaveLength(2);
    expect(res.valid_rows[0]).toMatchObject({
      product_name: 'Cushion Cover',
      brand: 'Natura Casa',
      platform: 'Amazon India',
      base_price: 1299,
    });
    expect(res.malformed_rows).toHaveLength(1);
    expect(res.malformed_rows[0].errors.length).toBeGreaterThan(0);
  });

  it('parses assignment sample CSV and rejects negative prices', () => {
    const parsed = parseCartCSV(SAMPLE_CART_CSV);
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.data).toHaveLength(6);

    const bad = parseCartCSV('item_id,product,brand,platform,base_price\n1,Lamp,BrandA,Flipkart,-200');
    expect(bad.data).toHaveLength(0);
    expect(bad.errors[0]).toContain('positive number');
  });
});
