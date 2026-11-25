import Papa from 'papaparse';
import { CartItemPayload } from '../types';

export interface CsvParseOutput {
  data: CartItemPayload[];
  errors: string[];
}

export const SAMPLE_CART_CSV = `item_id,product,brand,platform,base_price
ITEM-01,Cushion Cover,Natura Casa,Amazon India,1299
ITEM-02,Bed Sheet Set,Natura Casa,Flipkart,849
ITEM-03,Wall Shelf,LivSpace Pro,Amazon India,599
ITEM-04,Ceramic Vase,LivSpace Pro,Noon,2499
ITEM-05,Cutting Board,Nordic Basics,Amazon India,449
ITEM-06,Desk Organiser,Nordic Basics,Flipkart,899`;

export function parseCartCSV(csvText: string): CsvParseOutput {
  const { data: rows, errors: parseErrors } = Papa.parse<Record<string, string>>(csvText.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
  });

  if (parseErrors.length > 0) {
    return { data: [], errors: parseErrors.map((e) => e.message) };
  }

  const data: CartItemPayload[] = [];
  const errors: string[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const product = row.product_name || row.product || '';
    const brand = row.brand || '';
    const platform = row.platform || '';
    const priceRaw = row.base_price ?? '';

    const missing: string[] = [];
    if (!product.trim()) missing.push('product');
    if (!brand.trim()) missing.push('brand');
    if (!platform.trim()) missing.push('platform');
    if (priceRaw === '') missing.push('base_price');

    if (missing.length > 0) {
      errors.push(`Row ${rowNum}: missing fields — ${missing.join(', ')}`);
      return;
    }

    const basePrice = Number(String(priceRaw).replace(/,/g, '').trim());
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      errors.push(`Row ${rowNum}: base_price must be a positive number, got "${priceRaw}"`);
      return;
    }

    data.push({
      product_name: product.trim(),
      brand: brand.trim(),
      platform: platform.trim(),
      base_price: Math.round(basePrice),
    });
  });

  return { data, errors };
}
