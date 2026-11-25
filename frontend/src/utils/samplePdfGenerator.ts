/**
 * Generates a real, standards-compliant PDF binary in memory containing
 * the Opptra sample cart table (Product | Brand | Platform | Base Price)
 * so users can test real PDF upload & extraction immediately.
 */
export function buildSampleCartPdfBlob(): Blob {
  const rows = [
    ['Product', 'Brand', 'Platform', 'Base Price'],
    ['Cushion Cover', 'Natura Casa', 'Amazon India', '1299'],
    ['Bed Sheet Set', 'Natura Casa', 'Flipkart', '849'],
    ['Wall Shelf', 'LivSpace Pro', 'Amazon India', '599'],
    ['Ceramic Vase', 'LivSpace Pro', 'Noon', '2499'],
    ['Cutting Board', 'Nordic Basics', 'Amazon India', '449'],
    ['Desk Organiser', 'Nordic Basics', 'Flipkart', '899'],
  ];

  const colX = [50, 195, 325, 455];
  const streamLines: string[] = [
    'BT',
    '/F1 14 Tf',
    '50 750 Td',
    '(Opptra Shopping Cart Export) Tj',
    'ET',
  ];

  let y = 710;
  rows.forEach((cols, idx) => {
    const fontSize = idx === 0 ? 11 : 10;
    cols.forEach((cell, cIdx) => {
      const escaped = cell.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      streamLines.push('BT', `/F1 ${fontSize} Tf`, `${colX[cIdx]} ${y} Td`, `(${escaped}) Tj`, 'ET');
    });
    y -= 24;
  });

  const streamContent = streamLines.join('\n');

  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${streamContent.length} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return new Blob([pdf], { type: 'application/pdf' });
}
